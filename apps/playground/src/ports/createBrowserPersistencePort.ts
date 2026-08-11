import type {
  ArtifactPersistencePort,
  ArtifactSavePayload,
  ArtifactSaveResult,
} from "@scaffold/core/ports";

import { ARTIFACT_STORE, getBrowserStorageDb, type StoredArtifact } from "./browserStorageDb";

/**
 * Browser-local persistence port (IndexedDB).
 *
 * Playground port that persists the authoring projection to IndexedDB so
 * documents survive reloads without an adapter or server. Adapters use their
 * own host boundary and never touch this.
 *
 * IDB instead of localStorage because:
 * - localStorage caps at ~5 MB per origin; an image-heavy doc fills that
 *   fast, especially once the media port persists Blobs alongside.
 * - localStorage is sync and string-only; IDB takes the structured-clone
 *   path which is faster on large JSON and doesn't block the main thread.
 *
 * A successful Save always returns the revision written with the canonical
 * draft. If IndexedDB is unavailable, Save fails rather than claiming a
 * revision that the publication port cannot subsequently verify.
 */

const DEFAULT_SAVE_LATENCY_MS = 120;

export interface BrowserPersistencePortOptions {
  /**
   * Synthetic latency in ms before resolving each save. Lets dev surfaces
   * see the `saving → saved` pill transition without a real network. Set
   * to 0 for instant saves (production / playground default).
   */
  saveLatencyMs?: number;
}

export interface BrowserPersistencePort extends ArtifactPersistencePort {
  /** Read the persisted artifact, or `null` if none. */
  loadArtifact: (artifactId: string) => Promise<StoredArtifact | null>;
  /** Remove a single persisted artifact. */
  clearArtifact: (artifactId: string) => Promise<void>;
}

export function createBrowserPersistencePort(
  options: BrowserPersistencePortOptions = {},
): BrowserPersistencePort {
  const latencyMs = options.saveLatencyMs ?? DEFAULT_SAVE_LATENCY_MS;

  return {
    async saveArtifact(payload: ArtifactSavePayload): Promise<ArtifactSaveResult> {
      const db = await getBrowserStorageDb();
      if (!db) {
        throw new Error("Browser persistence: IndexedDB is unavailable");
      }

      const artifactRevision = crypto.randomUUID();

      const stored: StoredArtifact = {
        artifact: payload.artifact,
        artifactRevision,
        savedAt: new Date().toISOString(),
      };

      try {
        await db.put(ARTIFACT_STORE, stored, payload.artifact.id);
      } catch (error) {
        throw new Error(
          `Browser persistence: could not write artifact ${payload.artifact.id}: ${stringifyError(error)}`,
        );
      }

      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }

      return {
        artifact: { title: payload.artifact.title },
        artifactRevision,
      };
    },

    async loadArtifact(artifactId: string): Promise<StoredArtifact | null> {
      const db = await getBrowserStorageDb();
      if (!db) return null;
      const value = await db.get(ARTIFACT_STORE, artifactId);
      return value ?? null;
    },

    async clearArtifact(artifactId: string): Promise<void> {
      const db = await getBrowserStorageDb();
      if (!db) return;
      await db.delete(ARTIFACT_STORE, artifactId);
    },
  };
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
