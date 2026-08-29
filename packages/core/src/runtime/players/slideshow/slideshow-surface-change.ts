import { Result, type Result as ResultType } from "better-result";

import type { SurfaceId } from "@/document/model/course-structure";
import type { SurfaceExitEnvironment, SurfaceExitSnapshot } from "./surface-exit-environment";

type BlockedSurfaceExitSnapshot = Extract<SurfaceExitSnapshot, { status: "blocked" }>;

export interface SurfaceChangeRefused {
  readonly reason: "surface-exit-blocked";
  readonly activeSurfaceId: SurfaceId;
  readonly targetSurfaceId: SurfaceId;
  readonly blockers: BlockedSurfaceExitSnapshot["blockers"];
}

export type SurfaceChangeResult = ResultType<void, SurfaceChangeRefused>;
export type RequestSurfaceChange = (targetSurfaceId: SurfaceId) => SurfaceChangeResult;

export interface CreateRequestSurfaceChangeInput {
  readonly environment: Pick<SurfaceExitEnvironment, "evaluateSnapshot">;
  readonly getActiveSurfaceId: () => SurfaceId | null;
  readonly isKnownSurfaceId: (surfaceId: SurfaceId) => boolean;
  readonly commitSurfaceChange: (surfaceId: SurfaceId) => void;
}

export function createRequestSurfaceChange({
  environment,
  getActiveSurfaceId,
  isKnownSurfaceId,
  commitSurfaceChange,
}: CreateRequestSurfaceChangeInput): RequestSurfaceChange {
  return (targetSurfaceId) => {
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

    if (snapshot.status === "blocked") {
      const refusal: SurfaceChangeRefused = Object.freeze({
        reason: "surface-exit-blocked",
        activeSurfaceId,
        targetSurfaceId,
        blockers: snapshot.blockers,
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
