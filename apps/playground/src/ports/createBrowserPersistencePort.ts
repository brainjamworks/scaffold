import type {
  ArtifactPersistencePort,
  ArtifactPersistenceResult,
  ArtifactSavePayload,
} from "@scaffold/core/ports";
import { artifactSaveFailed, artifactSaveSucceeded } from "@scaffold/core/ports";

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
    async saveArtifact(payload: ArtifactSavePayload): Promise<ArtifactPersistenceResult> {
      const artifactId = payload.artifact.id;
      const database = getBrowserStorageDb();
      if (!database) {
        const cause = new Error("Browser persistence: IndexedDB is unavailable");
        return artifactSaveFailed({ reason: "storage-unavailable", artifactId, cause });
      }

      let db;
      try {
        db = await database;
      } catch (error) {
        const failure = classifyBrowserStorageFailure(error, artifactId, "open");
        if (failure) return artifactSaveFailed(failure);
        throw error;
      }

      const artifactRevision = crypto.randomUUID();

      const stored: StoredArtifact = {
        artifact: payload.artifact,
        artifactRevision,
        savedAt: new Date().toISOString(),
      };

      try {
        await db.put(ARTIFACT_STORE, stored, artifactId);
      } catch (error) {
        const failure = classifyBrowserStorageFailure(error, artifactId, "write");
        if (failure) return artifactSaveFailed(failure);
        throw error;
      }

      if (latencyMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, latencyMs));
      }

      return artifactSaveSucceeded({
        artifact: { title: payload.artifact.title },
        artifactRevision,
      });
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

function classifyBrowserStorageFailure(
  cause: unknown,
  artifactId: string,
  operation: "open" | "write",
) {
  const name = readErrorName(cause);
  if (name === "QuotaExceededError") {
    return { reason: "quota-exceeded" as const, artifactId, cause };
  }
  if (name === "AbortError") {
    return { reason: "write-aborted" as const, artifactId, cause };
  }
  if (
    operation === "open" &&
    (name === "InvalidStateError" || name === "NotSupportedError" || name === "SecurityError")
  ) {
    return { reason: "storage-unavailable" as const, artifactId, cause };
  }
  return null;
}

function readErrorName(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const descriptor = Object.getOwnPropertyDescriptor(error, "name");
  if (descriptor && "value" in descriptor && typeof descriptor.value === "string") {
    return descriptor.value;
  }
  return error instanceof Error ? error.name : null;
}
