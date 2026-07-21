import type { AssessmentLearnerSnapshot, LearnerActivitySnapshot } from "@scaffold/contracts";
import type { ScaffoldArtifact } from "@scaffold/core/format";
import type {
  ScaffoldLearnerInitialState,
  ScaffoldMediaContext,
  ScaffoldResolvedMediaMap,
} from "@scaffold/core/ports";

export type ScaffoldXBlockView = "studio" | "student";

export interface ScaffoldXBlockData {
  artifact: ScaffoldArtifact;
  protocolVersion?: number;
  mediaContext?: ScaffoldMediaContext;
  resolvedMedia?: ScaffoldResolvedMediaMap;
  assessmentSnapshot?: AssessmentLearnerSnapshot;
  learnerActivitySnapshot?: LearnerActivitySnapshot;
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
  artifact: ScaffoldArtifact;
  protocolVersion?: number;
  mediaContext?: ScaffoldMediaContext;
  resolvedMedia?: ScaffoldResolvedMediaMap;
  initialLearnerState: ScaffoldXBlockLearnerInitialState;
}

export type SaveState = "idle" | "saving" | "saved" | "error";
