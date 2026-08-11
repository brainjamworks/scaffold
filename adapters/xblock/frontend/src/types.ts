import type { AssessmentLearnerSnapshot, LearnerActivitySnapshot } from "@scaffold/contracts";
import type { ScaffoldArtifact } from "@scaffold/core/format";
import type {
  LearnerPublicationStatus,
  ScaffoldLearnerInitialState,
  ScaffoldLearnerPublication,
  ScaffoldMediaContext,
  ScaffoldResolvedMediaMap,
} from "@scaffold/core/ports";

export type ScaffoldXBlockView = "studio" | "student";

export interface ScaffoldXBlockArtifactMetadata {
  readonly id: string;
  readonly title: string;
  readonly mode: ScaffoldArtifact["mode"];
}

export type ScaffoldXBlockArtifactAccess =
  | {
      readonly status: "supported";
      readonly artifact: ScaffoldXBlockArtifactMetadata;
    }
  | {
      readonly status: "not-published";
      readonly artifact: ScaffoldXBlockArtifactMetadata;
    }
  | {
      readonly status: "requires-scaffold-plus" | "invalid";
      readonly artifact: ScaffoldXBlockArtifactMetadata;
    }
  | {
      readonly status: "unsupported-core-format";
      readonly artifact: ScaffoldXBlockArtifactMetadata;
      readonly documentVersion: number;
      readonly supportedVersion: number;
    };

export interface ScaffoldXBlockData {
  artifactAccess: ScaffoldXBlockArtifactAccess;
  artifact: ScaffoldArtifact | null;
  protocolVersion?: number;
  mediaContext?: ScaffoldMediaContext;
  resolvedMedia?: ScaffoldResolvedMediaMap;
  assessmentSnapshot?: AssessmentLearnerSnapshot;
  learnerActivitySnapshot?: LearnerActivitySnapshot;
  learnerPublication?: ScaffoldLearnerPublication;
  publicationStatus?: LearnerPublicationStatus;
}

export interface ScaffoldXBlockOuterData extends ScaffoldXBlockData {
  innerUrl: string;
}

export interface ScaffoldXBlockLearnerInitialState extends ScaffoldLearnerInitialState {
  assessmentSnapshot?: AssessmentLearnerSnapshot;
  learnerActivitySnapshot?: LearnerActivitySnapshot;
}

export interface ScaffoldXBlockInnerInitPayload {
  view: ScaffoldXBlockView;
  artifactAccess: ScaffoldXBlockArtifactAccess;
  artifact: ScaffoldArtifact | null;
  protocolVersion?: number;
  mediaContext?: ScaffoldMediaContext;
  resolvedMedia?: ScaffoldResolvedMediaMap;
  initialLearnerState: ScaffoldXBlockLearnerInitialState;
  learnerPublication: ScaffoldLearnerPublication;
  publicationStatus?: LearnerPublicationStatus;
}

export type SaveState = "idle" | "saving" | "saved" | "error";
