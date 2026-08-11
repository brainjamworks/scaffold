import type { JSONContent } from "@tiptap/core";
import type { ScaffoldArtifact } from "@scaffold/contracts";

import type { ScaffoldArtifactCreationPort } from "../ports/artifact-creation";
import type { ArtifactPersistencePort } from "../ports/artifact-persistence";
import type { LearnerPublicationPort } from "../ports/learner-publication";
import type { MediaPort } from "../ports/media";

export type ScaffoldAuthoringArtifact = Omit<ScaffoldArtifact, "content"> & {
  content: JSONContent;
};

export interface ScaffoldAuthoringHostServices {
  artifactPersistence: ArtifactPersistencePort;
  learnerPublication: LearnerPublicationPort;
  media?: MediaPort | null;
}

export interface ScaffoldAuthoringEntryHostServices extends ScaffoldAuthoringHostServices {
  artifactCreation: ScaffoldArtifactCreationPort;
}
