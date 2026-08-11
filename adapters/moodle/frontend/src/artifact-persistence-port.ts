import type { ArtifactPersistencePort, ArtifactSaveResult } from "@scaffold/core/ports";

import { moodleCall, type MoodleAjaxResponse } from "./api";

interface SaveContentResponse extends MoodleAjaxResponse {
  artifactRevision?: unknown;
}

export function createMoodleArtifactPersistence(cmid: number): ArtifactPersistencePort {
  return {
    saveArtifact: async (bundle): Promise<ArtifactSaveResult> => {
      const response = await moodleCall<SaveContentResponse>("mod_scaffold_save_content", {
        cmid,
        artifactjson: JSON.stringify(bundle.artifact),
      });
      if (typeof response.artifactRevision !== "string" || !response.artifactRevision) {
        throw new Error("Moodle Save response did not include an artifact revision");
      }
      return { artifactRevision: response.artifactRevision };
    },
  };
}
