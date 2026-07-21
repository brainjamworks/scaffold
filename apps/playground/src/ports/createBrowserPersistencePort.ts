import type {
  ArtifactPersistencePort,
  ArtifactSaveBundle,
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
 * If IndexedDB is unavailable (SSR, some headless test runners), every
 * method becomes a no-op so the rest of the surface still mounts.
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
    async saveArtifact(bundle: ArtifactSaveBundle): Promise<ArtifactSaveResult | void> {
      const db = await getBrowserStorageDb();
      if (!db) return;

      const stored: StoredArtifact = {
        artifact: bundle.artifact,
        savedAt: new Date().toISOString(),
      };

      try {
        await db.put(ARTIFACT_STORE, stored, bundle.artifact.id);
      } catch (error) {
        throw new Error(
          `Browser persistence: could not write artifact ${bundle.artifact.id}: ${stringifyError(error)}`,
        );
      }

      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }

      return { artifact: { title: bundle.artifact.title } };
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
