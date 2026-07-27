import type { ArtifactPersistencePort, ArtifactSaveResult } from "@scaffold/core/ports";

import { moodleCall, type MoodleAjaxResponse } from "./api";

interface SaveContentResponse extends MoodleAjaxResponse {
  artifact?: {
    title?: unknown;
  };
}

export function createMoodleArtifactPersistence(cmid: number): ArtifactPersistencePort {
  return {
    saveArtifact: async (bundle): Promise<ArtifactSaveResult> => {
      const response = await moodleCall<SaveContentResponse>("mod_scaffold_save_content", {
        cmid,
        artifactjson: JSON.stringify(bundle.artifact),
        learnercontentjson: JSON.stringify(bundle.learnerContent),
        assessmenttargetsjson: JSON.stringify(bundle.assessmentTargets),
        assessmentgroupsjson: JSON.stringify(bundle.assessmentGroups),
      });

      return typeof response.artifact?.title === "string" && response.artifact.title
        ? { artifact: { title: response.artifact.title } }
        : {};
    },
  };
}
