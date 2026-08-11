import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type {
  ArtifactRevision,
  ArtifactSavePayload,
  LearnerPublicationPayload,
} from "@scaffold/core/ports";

/**
 * IndexedDB schema for the browser-local port pair.
 *
 * One DB, scoped per origin, with separate object stores for canonical drafts,
 * active learner publications and uploaded media.
 *
 * Used by `createBrowserPersistencePort` and
 * `createBrowserMediaPort`. Adapters with their own backend never touch
 * this playground-only store.
 */

const DB_NAME = "scaffold-local";
const DB_VERSION = 3;

export const ARTIFACT_STORE = "artifact" as const;
export const PUBLICATION_STORE = "publication" as const;
export const MEDIA_STORE = "media" as const;

export interface StoredArtifact {
  artifact: ArtifactSavePayload["artifact"];
  artifactRevision: ArtifactRevision;
  savedAt: string;
}

export interface StoredLearnerPublication {
  payload: LearnerPublicationPayload;
  publishedAt: string;
}

export interface StoredMedia {
  id: string;
  blob: Blob;
  mediaType: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface BrowserStorageSchema extends DBSchema {
  artifact: {
    key: string;
    value: StoredArtifact;
  };
  publication: {
    key: string;
    value: StoredLearnerPublication;
  };
  media: {
    key: string;
    value: StoredMedia;
    indexes: { "by-createdAt": string };
  };
}

let dbPromise: Promise<IDBPDatabase<BrowserStorageSchema>> | null = null;

/**
 * Lazily open the singleton DB. Both ports share one instance so the
 * connection pool doesn't multiply and so a reset can close + delete in one
 * place. Safe to call repeatedly; the promise is cached.
 *
 * In environments without IndexedDB (SSR, some test runners), returns null.
 * Callers should treat that as a no-op storage layer.
 */
export function getBrowserStorageDb(): Promise<IDBPDatabase<BrowserStorageSchema>> | null {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB<BrowserStorageSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(ARTIFACT_STORE)) {
          db.createObjectStore(ARTIFACT_STORE);
        }
        if (!db.objectStoreNames.contains(PUBLICATION_STORE)) {
          db.createObjectStore(PUBLICATION_STORE);
        }
        if (!db.objectStoreNames.contains(MEDIA_STORE)) {
          const mediaStore = db.createObjectStore(MEDIA_STORE);
          mediaStore.createIndex("by-createdAt", "createdAt");
        }
      },
    });
  }
  return dbPromise;
}

/**
 * Wipe all stores. Used by the playground's Reset
 * action. Re-opening happens lazily on next access.
 */
export async function resetBrowserStorage(): Promise<void> {
  const db = await getBrowserStorageDb();
  if (!db) return;
  await Promise.all([db.clear(ARTIFACT_STORE), db.clear(PUBLICATION_STORE), db.clear(MEDIA_STORE)]);
}

/**
 * Best-effort request for persistent storage so the browser doesn't evict
 * the DB under disk pressure. Resolves to whether the request was granted.
 * No-op (returns false) in environments without the StorageManager API.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;
  const storage = navigator.storage;
  if (!storage?.persist) return false;
  try {
    return await storage.persist();
  } catch {
    return false;
  }
}
