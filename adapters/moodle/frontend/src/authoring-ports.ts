import type {
  LearnerPublicationStatus,
  ScaffoldAuthoringEntryHostServices,
} from "@scaffold/core/ports";

import { createMoodleArtifactPersistence } from "./artifact-persistence-port";
import { createMoodleLearnerPublicationPort } from "./learner-publication-port";
import { createMoodleRuntimePorts } from "./ports";

interface MoodleArtifactMetadata {
  id: string;
  title: string;
}

export function createMoodleAuthoringHostServices(
  cmid: number,
  metadata: MoodleArtifactMetadata,
  publicationStatus: LearnerPublicationStatus,
): ScaffoldAuthoringEntryHostServices {
  const runtimePorts = createMoodleRuntimePorts(cmid);

  return {
    artifactPersistence: createMoodleArtifactPersistence(cmid),
    learnerPublication: createMoodleLearnerPublicationPort(cmid, publicationStatus),
    artifactCreation: {
      createArtifactMetadata: async () => ({
        ...metadata,
        requiresScaffoldPlus: false,
      }),
    },
    ...(runtimePorts.media ? { media: runtimePorts.media } : {}),
  };
}
