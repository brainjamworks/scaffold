import {
  type MediaPort,
  type MediaUploadMeta,
  type MediaUploadResult,
  type MediaUploadType,
} from "@scaffold/core/ports";
import { filterMediaList, validateMediaUploadFile } from "@scaffold/core/media-policy";

import { getBrowserStorageDb, MEDIA_STORE, type StoredMedia } from "./browserStorageDb";

/**
 * Browser-local media port (IndexedDB).
 *
 * Stores uploaded files as Blobs in IndexedDB so they survive playground
 * reloads. Production adapters use their host's upload API instead.
 *
 * resolve() returns object URLs that are cached per session and revoked
 * on reset, so a doc with many image references doesn't churn through
 * URL slots on every render.
 */

export interface BrowserMediaPortOptions {
  idFactory?: () => string;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
}

export interface BrowserMediaPort extends MediaPort {
  /** Revoke all cached object URLs. Call when wiping storage. */
  releaseUrls: () => void;
}

type BrowserMediaListFilter = Parameters<NonNullable<MediaPort["list"]>>[0];
type BrowserMediaListItem = Awaited<ReturnType<NonNullable<MediaPort["list"]>>>[number];

const defaultIdFactory = () => globalThis.crypto?.randomUUID?.() ?? `media-${Date.now()}`;
const defaultCreateObjectUrl = (blob: Blob) => globalThis.URL.createObjectURL(blob);
const defaultRevokeObjectUrl = (url: string) => globalThis.URL?.revokeObjectURL?.(url);

export function createBrowserMediaPort(options: BrowserMediaPortOptions = {}): BrowserMediaPort {
  const idFactory = options.idFactory ?? defaultIdFactory;
  const createObjectUrl = options.createObjectUrl ?? defaultCreateObjectUrl;
  const revokeObjectUrl = options.revokeObjectUrl ?? defaultRevokeObjectUrl;

  // Object URLs are per-session, not per-blob; cache them so repeated
  // resolves of the same media don't allocate new URL slots.
  const urlCache = new Map<string, string>();

  const releaseUrls = () => {
    for (const url of urlCache.values()) revokeObjectUrl(url);
    urlCache.clear();
  };

  const urlFor = (id: string, blob: Blob): string => {
    const cached = urlCache.get(id);
    if (cached) return cached;
    const url = createObjectUrl(blob);
    urlCache.set(id, url);
    return url;
  };

  const toListItem = (stored: StoredMedia): BrowserMediaListItem => ({
    id: stored.id,
    url: urlFor(stored.id, stored.blob),
    mediaType: stored.mediaType as MediaUploadType,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    size: stored.size,
    createdAt: stored.createdAt,
  });

  return {
    releaseUrls,

    async resolve(mediaId: string): Promise<string> {
      const db = await getBrowserStorageDb();
      if (!db) throw new Error(`browser media not found: ${mediaId}`);
      const stored = await db.get(MEDIA_STORE, mediaId);
      if (!stored) throw new Error(`browser media not found: ${mediaId}`);
      return urlFor(mediaId, stored.blob);
    },

    async list(filter?: BrowserMediaListFilter): Promise<BrowserMediaListItem[]> {
      const db = await getBrowserStorageDb();
      if (!db) return [];
      const all = await db.getAll(MEDIA_STORE);
      const items = all.map(toListItem);
      return filterMediaList(items, filter).sort((a, b) =>
        (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
      );
    },

    async upload(
      file: File,
      meta: MediaUploadMeta,
      onProgress?: (pct: number) => void,
    ): Promise<MediaUploadResult> {
      const mediaType = validateMediaUploadFile(file, meta.mediaType);
      onProgress?.(0);

      const id = idFactory();
      const stored: StoredMedia = {
        id,
        blob: file,
        mediaType,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        createdAt: new Date().toISOString(),
      };

      const db = await getBrowserStorageDb();
      if (!db) {
        throw new Error("browser media upload: IndexedDB unavailable");
      }
      await db.put(MEDIA_STORE, stored, id);

      const url = urlFor(id, file);
      onProgress?.(100);

      return {
        id,
        url,
        mediaType,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
      };
    },
  };
}
