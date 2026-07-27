import type { ScaffoldAuthoringEntryHostServices } from "@scaffold/core/ports";

import { createMoodleArtifactPersistence } from "./artifact-persistence-port";
import { createMoodleRuntimePorts } from "./ports";

interface MoodleArtifactMetadata {
  id: string;
  title: string;
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
