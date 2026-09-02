import { Result, type Result as ResultType } from "better-result";

import type { SurfaceId } from "@/document/model/course-structure";
import type { SurfaceExitEnvironment, SurfaceExitSnapshot } from "./surface-exit-environment";

type BlockedSurfaceExitSnapshot = Extract<SurfaceExitSnapshot, { status: "blocked" }>;

export type SurfaceExitPolicy = "enforce" | "observe-only";

export interface SurfaceChangeRefused {
  readonly reason: "surface-exit-blocked";
  readonly activeSurfaceId: SurfaceId;
  readonly targetSurfaceId: SurfaceId;
  readonly blockers: BlockedSurfaceExitSnapshot["blockers"];
}

export interface SatisfiedLearnerRuleBranchSurfaceChange {
  readonly kind: "satisfied-learner-rule-branch";
}

export type SurfaceChangeResult = ResultType<void, SurfaceChangeRefused>;
export type RequestSurfaceChange = (
  targetSurfaceId: SurfaceId,
  context?: SatisfiedLearnerRuleBranchSurfaceChange,
) => SurfaceChangeResult;

export interface CreateRequestSurfaceChangeInput {
  readonly environment: Pick<SurfaceExitEnvironment, "evaluateSnapshot">;
  readonly getActiveSurfaceId: () => SurfaceId | null;
  readonly isKnownSurfaceId: (surfaceId: SurfaceId) => boolean;
  readonly commitSurfaceChange: (surfaceId: SurfaceId) => void;
  readonly surfaceExitPolicy?: SurfaceExitPolicy;
}

export function createRequestSurfaceChange({
  environment,
  getActiveSurfaceId,
  isKnownSurfaceId,
  commitSurfaceChange,
  surfaceExitPolicy = "enforce",
}: CreateRequestSurfaceChangeInput): RequestSurfaceChange {
  return (targetSurfaceId, context) => {
    if (!isKnownSurfaceId(targetSurfaceId)) {
      throw new Error(`Cannot request unknown Slideshow Surface "${targetSurfaceId}".`);
    }

    const activeSurfaceId = getActiveSurfaceId();
    if (targetSurfaceId === activeSurfaceId) return successfulSurfaceChange();
    if (activeSurfaceId === null) {
      throw new Error("Cannot change Slideshow Surface without an active Surface.");
    }

    const snapshot = environment.evaluateSnapshot();
    if (snapshot.surfaceId !== activeSurfaceId) {
      throw new Error(
        `Surface Exit snapshot for "${snapshot.surfaceId ?? "none"}" does not match active Surface "${activeSurfaceId}".`,
      );
    }

    if (surfaceExitPolicy === "enforce" && snapshot.status === "blocked") {
      const blockers =
        context?.kind === "satisfied-learner-rule-branch"
          ? snapshot.blockers.filter((blocker) => blocker.reason !== "presentation-learner-wait")
          : snapshot.blockers;
      if (blockers.length === 0) {
        commitSurfaceChange(targetSurfaceId);
        return successfulSurfaceChange();
      }
      const refusal: SurfaceChangeRefused = Object.freeze({
        reason: "surface-exit-blocked",
        activeSurfaceId,
        targetSurfaceId,
        blockers:
          blockers === snapshot.blockers
            ? snapshot.blockers
            : (Object.freeze(blockers) as BlockedSurfaceExitSnapshot["blockers"]),
      });
      const result: SurfaceChangeResult = Result.err(refusal);
      return Object.freeze(result);
    }

    commitSurfaceChange(targetSurfaceId);
    return successfulSurfaceChange();
  };
}

function successfulSurfaceChange(): SurfaceChangeResult {
  const result: SurfaceChangeResult = Result.ok();
  return Object.freeze(result);
}
