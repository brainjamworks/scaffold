import type { JSONContent } from "@tiptap/core";
import type {
  AssessmentGroupContract,
  AssessmentTargetContract,
  CourseMode,
} from "@scaffold/contracts";

export type ArtifactRevision = string;

export interface LearnerPublicationStatus {
  readonly currentArtifactRevision: ArtifactRevision;
  readonly publishedArtifactRevision: ArtifactRevision | null;
  readonly publishedAt: string | null;
}

export interface LearnerPublicationPayload {
  readonly sourceArtifactRevision: ArtifactRevision;
  readonly artifact: {
    readonly id: string;
    readonly title: string;
    readonly mode: CourseMode;
    readonly requiresScaffoldPlus: boolean;
  };
  readonly learnerContent: JSONContent;
  readonly assessmentTargets: AssessmentTargetContract[];
  readonly assessmentGroups: AssessmentGroupContract[];
}

export type LearnerPublicationPortErrorCode =
  | "stale-artifact-revision"
  | "forbidden"
  | "invalid-payload";

export interface LearnerPublicationPortError extends Error {
  readonly code: LearnerPublicationPortErrorCode;
}

export interface LearnerPublicationPort {
  getStatus: () => Promise<LearnerPublicationStatus>;
  publish: (payload: LearnerPublicationPayload) => Promise<LearnerPublicationStatus>;
}
