import type {
  LearnerPublicationPayload,
  LearnerPublicationPort,
  LearnerPublicationPortError,
  LearnerPublicationPortErrorCode,
  LearnerPublicationStatus,
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
    async getStatus(): Promise<LearnerPublicationStatus> {
      const db = await getBrowserStorageDb();
      if (!db) {
        throw new Error("Browser publication: IndexedDB is unavailable");
      }
      const transaction = db.transaction([ARTIFACT_STORE, PUBLICATION_STORE], "readonly");
      const [draft, publication] = await Promise.all([
        transaction.objectStore(ARTIFACT_STORE).get(artifactId),
        transaction.objectStore(PUBLICATION_STORE).get(artifactId),
      ]);
      await transaction.done;
      return statusFromRecords(draft?.artifactRevision, publication ?? null);
    },

    async publish(payload: LearnerPublicationPayload): Promise<LearnerPublicationStatus> {
      if (payload.artifact.id !== artifactId) {
        throw publicationError("invalid-payload", "Publication artifact id does not match host");
      }
      const db = await getBrowserStorageDb();
      if (!db) {
        throw new Error("Browser publication: IndexedDB is unavailable");
      }

      const transaction = db.transaction([ARTIFACT_STORE, PUBLICATION_STORE], "readwrite");
      const draft = await transaction.objectStore(ARTIFACT_STORE).get(artifactId);
      if (!draft || draft.artifactRevision !== payload.sourceArtifactRevision) {
        await transaction.done;
        throw publicationError(
          "stale-artifact-revision",
          "Publication source revision is not the current saved draft",
        );
      }

      const publication: StoredLearnerPublication = {
        payload,
        publishedAt: new Date().toISOString(),
      };
      await transaction.objectStore(PUBLICATION_STORE).put(publication, artifactId);
      await transaction.done;
      return statusFromRecords(draft.artifactRevision, publication);
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

function publicationError(
  code: LearnerPublicationPortErrorCode,
  message: string,
): LearnerPublicationPortError {
  return Object.assign(new Error(message), { code });
}
