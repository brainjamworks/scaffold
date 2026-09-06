import type {
  LearnerPublicationStatusFailure,
  LearnerPublicationPayload,
  LearnerPublicationPort,
  LearnerPublishFailure,
  LearnerPublicationStatus,
} from "@scaffold/core/ports";
import {
  learnerPublicationStatusFailed,
  learnerPublicationStatusSucceeded,
  learnerPublishFailed,
  learnerPublishSucceeded,
} from "@scaffold/core/ports";

import {
  ARTIFACT_STORE,
  getBrowserStorageDb,
  PUBLICATION_STORE,
  type StoredLearnerPublication,
} from "./browserStorageDb";

const UNSAVED_BROWSER_REVISION = "browser-unsaved";

export interface BrowserLearnerPublicationPort extends LearnerPublicationPort {
  loadPublication: () => Promise<StoredLearnerPublication | null>;
}

export function createBrowserLearnerPublicationPort(
  artifactId: string,
): BrowserLearnerPublicationPort {
  return {
    async getStatus() {
      try {
        const database = getBrowserStorageDb();
        if (!database) {
          return learnerPublicationStatusFailed({
            reason: "storage-unavailable",
            artifactId,
            cause: new Error("Browser publication: IndexedDB is unavailable"),
          });
        }
        const db = await database;
        const transaction = db.transaction([ARTIFACT_STORE, PUBLICATION_STORE], "readonly");
        const [draft, publication] = await Promise.all([
          transaction.objectStore(ARTIFACT_STORE).get(artifactId),
          transaction.objectStore(PUBLICATION_STORE).get(artifactId),
        ]);
        await transaction.done;
        return learnerPublicationStatusSucceeded(
          statusFromRecords(draft?.artifactRevision, publication ?? null),
        );
      } catch (cause) {
        const failure = classifyBrowserPublicationStatusFailure(cause, artifactId);
        if (failure) return learnerPublicationStatusFailed(failure);
        throw cause;
      }
    },

    async publish(payload: LearnerPublicationPayload) {
      if (payload.artifact.id !== artifactId) {
        return learnerPublishFailed({
          reason: "invalid-payload",
          artifactId,
          cause: new Error("Publication artifact id does not match host"),
        });
      }
      try {
        const database = getBrowserStorageDb();
        if (!database) {
          return learnerPublishFailed({
            reason: "storage-unavailable",
            artifactId,
            cause: new Error("Browser publication: IndexedDB is unavailable"),
          });
        }
        const db = await database;
        const transaction = db.transaction([ARTIFACT_STORE, PUBLICATION_STORE], "readwrite");
        const draft = await transaction.objectStore(ARTIFACT_STORE).get(artifactId);
        if (!draft || draft.artifactRevision !== payload.sourceArtifactRevision) {
          await transaction.done;
          return learnerPublishFailed({
            reason: "stale-artifact-revision",
            artifactId,
            sourceArtifactRevision: payload.sourceArtifactRevision,
            cause: new Error("Publication source revision is not the current saved draft"),
          });
        }

        const publication: StoredLearnerPublication = {
          payload,
          publishedAt: new Date().toISOString(),
        };
        await transaction.objectStore(PUBLICATION_STORE).put(publication, artifactId);
        await transaction.done;
        return learnerPublishSucceeded(statusFromRecords(draft.artifactRevision, publication));
      } catch (cause) {
        const failure = classifyBrowserPublishFailure(cause, artifactId);
        if (failure) return learnerPublishFailed(failure);
        throw cause;
      }
    },

    async loadPublication(): Promise<StoredLearnerPublication | null> {
      const db = await getBrowserStorageDb();
      if (!db) return null;
      return (await db.get(PUBLICATION_STORE, artifactId)) ?? null;
    },
  };
}

function statusFromRecords(
  currentArtifactRevision: string | undefined,
  publication: StoredLearnerPublication | null,
): LearnerPublicationStatus {
  return {
    currentArtifactRevision: currentArtifactRevision ?? UNSAVED_BROWSER_REVISION,
    publishedArtifactRevision: publication?.payload.sourceArtifactRevision ?? null,
    publishedAt: publication?.publishedAt ?? null,
  };
}

function classifyBrowserPublicationStatusFailure(
  cause: unknown,
  artifactId: string,
): LearnerPublicationStatusFailure | null {
  const name = readErrorName(cause);
  if (name === "AbortError") return { reason: "read-aborted", artifactId, cause };
  if (isUnavailableStorageError(name)) {
    return { reason: "storage-unavailable", artifactId, cause };
  }
  return null;
}

function classifyBrowserPublishFailure(
  cause: unknown,
  artifactId: string,
): LearnerPublishFailure | null {
  const name = readErrorName(cause);
  if (name === "QuotaExceededError") return { reason: "quota-exceeded", artifactId, cause };
  if (name === "AbortError") return { reason: "write-aborted", artifactId, cause };
  if (isUnavailableStorageError(name)) {
    return { reason: "storage-unavailable", artifactId, cause };
  }
  return null;
}

function isUnavailableStorageError(name: string | null): boolean {
  return name === "InvalidStateError" || name === "NotSupportedError" || name === "SecurityError";
}

function readErrorName(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const descriptor = Object.getOwnPropertyDescriptor(error, "name");
  if (descriptor && "value" in descriptor && typeof descriptor.value === "string") {
    return descriptor.value;
  }
  return error instanceof Error ? error.name : null;
}
