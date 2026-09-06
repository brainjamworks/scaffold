import type { JSONContent } from "@tiptap/core";
import type {
  AssessmentGroupContract,
  AssessmentTargetContract,
  CourseMode,
} from "@scaffold/contracts";
import { Result, type Result as ResultType } from "better-result";

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

export type LearnerPublicationRefusal =
  | {
      readonly reason: "stale-artifact-revision";
      readonly artifactId: string;
      readonly sourceArtifactRevision: ArtifactRevision;
      readonly cause: unknown;
    }
  | { readonly reason: "forbidden"; readonly artifactId: string; readonly cause: unknown }
  | { readonly reason: "invalid-payload"; readonly artifactId: string; readonly cause: unknown };

export type LearnerPublicationStatusFailure =
  | { readonly reason: "storage-unavailable"; readonly artifactId: string; readonly cause: unknown }
  | { readonly reason: "read-aborted"; readonly artifactId: string; readonly cause: unknown };

export type LearnerPublishFailure =
  | LearnerPublicationRefusal
  | { readonly reason: "storage-unavailable"; readonly artifactId: string; readonly cause: unknown }
  | { readonly reason: "quota-exceeded"; readonly artifactId: string; readonly cause: unknown }
  | { readonly reason: "write-aborted"; readonly artifactId: string; readonly cause: unknown };

export type LearnerPublicationStatusResult = ResultType<
  LearnerPublicationStatus,
  LearnerPublicationStatusFailure
>;
export type LearnerPublishResult = ResultType<LearnerPublicationStatus, LearnerPublishFailure>;

export function learnerPublicationStatusSucceeded(
  status: LearnerPublicationStatus,
): LearnerPublicationStatusResult {
  return Result.ok(status);
}

export function learnerPublicationStatusFailed(
  failure: LearnerPublicationStatusFailure,
): LearnerPublicationStatusResult {
  return Result.err(failure);
}

export function learnerPublishSucceeded(status: LearnerPublicationStatus): LearnerPublishResult {
  return Result.ok(status);
}

export function learnerPublishFailed(failure: LearnerPublishFailure): LearnerPublishResult {
  return Result.err(failure);
}

export interface LearnerPublicationPort {
  getStatus: () => Promise<LearnerPublicationStatusResult>;
  publish: (payload: LearnerPublicationPayload) => Promise<LearnerPublishResult>;
}
