import type {
  ArtifactPersistencePort,
  ArtifactSaveResult,
  ScaffoldAuthoringEntryHostServices,
} from "@scaffold/core/ports";

import { moodleCall, type MoodleAjaxResponse } from "./api";
import { createMoodleRuntimePorts } from "./ports";

interface MoodleArtifactMetadata {
  id: string;
  title: string;
}

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

export function createMoodleAuthoringHostServices(
  cmid: number,
  metadata: MoodleArtifactMetadata,
): ScaffoldAuthoringEntryHostServices {
  const runtimePorts = createMoodleRuntimePorts(cmid);

  return {
    artifactPersistence: createMoodleArtifactPersistence(cmid),
    artifactCreation: {
      createArtifactMetadata: async () => metadata,
    },
    ...(runtimePorts.media ? { media: runtimePorts.media } : {}),
  };
}
