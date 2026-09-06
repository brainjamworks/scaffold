import {
  artifactSaveFailed,
  artifactSaveSucceeded,
  type ArtifactPersistencePort,
  type ArtifactPersistenceResult,
} from "@scaffold/core/ports";

import { MoodleServiceError, moodleCall, type MoodleAjaxResponse } from "./api";

interface SaveContentResponse extends MoodleAjaxResponse {
  artifactRevision?: unknown;
}

export function createMoodleArtifactPersistence(cmid: number): ArtifactPersistencePort {
  return {
    saveArtifact: async (bundle): Promise<ArtifactPersistenceResult> => {
      let response: SaveContentResponse;
      try {
        response = await moodleCall<SaveContentResponse>("mod_scaffold_save_content", {
          cmid,
          artifactjson: JSON.stringify(bundle.artifact),
        });
      } catch (cause) {
        if (
          cause instanceof MoodleServiceError &&
          (cause.service.errorCode === "invalidparameter" ||
            cause.service.errorCode === "nopermissions")
        ) {
          return artifactSaveFailed({
            reason: "write-aborted",
            artifactId: bundle.artifact.id,
            cause,
          });
        }
        throw cause;
      }
      if (typeof response.artifactRevision !== "string" || !response.artifactRevision) {
        throw new Error("Moodle Save response did not include an artifact revision");
      }
      return artifactSaveSucceeded({ artifactRevision: response.artifactRevision });
    },
  };
}
