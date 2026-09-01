import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { PresentationWaitId } from "@/runtime/presentation/compiled-presentation-program";
import {
  createSurfaceExitEnvironment,
  type SurfaceExitBlocker,
  type SurfaceExitGuardSnapshot,
  type SurfaceExitSnapshot,
} from "./surface-exit-environment";
import { createRequestSurfaceChange } from "./slideshow-surface-change";

const SURFACE_ONE = EmbeddedNodeIdSchema.parse("surface00001");
const SURFACE_TWO = EmbeddedNodeIdSchema.parse("surface00002");
const UNKNOWN_SURFACE = EmbeddedNodeIdSchema.parse("surface99999");

describe("requestSurfaceChange", () => {
  it("commits one allowed departure to the exact target and returns a frozen Ok", () => {
    const evaluateSnapshot = vi.fn(() => allowedSnapshot(SURFACE_ONE));
    const commitSurfaceChange = vi.fn();
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: { evaluateSnapshot },
      getActiveSurfaceId: () => SURFACE_ONE,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange,
    });

    const result = requestSurfaceChange(SURFACE_TWO);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected an allowed Surface change");
    expect(result.value).toBeUndefined();
    expect(Object.isFrozen(result)).toBe(true);
    expect(evaluateSnapshot).toHaveBeenCalledTimes(1);
    expect(commitSurfaceChange).toHaveBeenCalledOnce();
    expect(commitSurfaceChange).toHaveBeenCalledWith(SURFACE_TWO);
  });

  it("returns every blocker in a frozen typed refusal without committing or mutating diagnostics", () => {
    const snapshot = blockedSnapshot(SURFACE_ONE, [
      quizBlocker("quiz-one", "not_started"),
      presentationBlocker("presentation-one", "learner-wait"),
    ]);
    const evaluateSnapshot = vi.fn(() => snapshot);
    const commitSurfaceChange = vi.fn();
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: { evaluateSnapshot },
      getActiveSurfaceId: () => SURFACE_ONE,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange,
    });

    const result = requestSurfaceChange(SURFACE_TWO);

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected a refused Surface change");
    expect(result.error).toEqual({
      reason: "surface-exit-blocked",
      activeSurfaceId: SURFACE_ONE,
      targetSurfaceId: SURFACE_TWO,
      blockers: snapshot.blockers,
    });
    expect(result.error.blockers).toBe(snapshot.blockers);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.error)).toBe(true);
    expect(Object.isFrozen(result.error.blockers)).toBe(true);
    expect(commitSurfaceChange).not.toHaveBeenCalled();
    expect(evaluateSnapshot()).toBe(snapshot);
  });

  it("allows a satisfying learner-rule branch through a Presentation-only blocker", () => {
    const snapshot = blockedSnapshot(SURFACE_ONE, [
      presentationBlocker("presentation-one", "learner-wait"),
    ]);
    const commitSurfaceChange = vi.fn();
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: { evaluateSnapshot: () => snapshot },
      getActiveSurfaceId: () => SURFACE_ONE,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange,
    });

    const result = requestSurfaceChange(SURFACE_TWO, {
      kind: "satisfied-learner-rule-branch",
    });

    expect(result.status).toBe("ok");
    expect(commitSurfaceChange).toHaveBeenCalledOnce();
    expect(commitSurfaceChange).toHaveBeenCalledWith(SURFACE_TWO);
    expect(snapshot.blockers).toEqual([
      presentationBlocker("presentation-one", "learner-wait"),
    ]);
  });

  it("retains independent blockers when a satisfying learner-rule branch is refused", () => {
    const snapshot = blockedSnapshot(SURFACE_ONE, [
      presentationBlocker("presentation-one", "learner-wait"),
      quizBlocker("quiz-one", "in_progress"),
    ]);
    const commitSurfaceChange = vi.fn();
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: { evaluateSnapshot: () => snapshot },
      getActiveSurfaceId: () => SURFACE_ONE,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange,
    });

    const result = requestSurfaceChange(SURFACE_TWO, {
      kind: "satisfied-learner-rule-branch",
    });

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected an independent blocker refusal");
    expect(result.error.blockers).toEqual([quizBlocker("quiz-one", "in_progress")]);
    expect(Object.isFrozen(result.error.blockers)).toBe(true);
    expect(commitSurfaceChange).not.toHaveBeenCalled();
    expect(snapshot.blockers).toEqual([
      presentationBlocker("presentation-one", "learner-wait"),
      quizBlocker("quiz-one", "in_progress"),
    ]);
    expect(Object.isFrozen(snapshot.blockers)).toBe(true);
  });

  it("re-evaluates a live guard at request time and never auto-commits when it clears", () => {
    const owner = createSurfaceExitEnvironment({
      knownSurfaceIds: [SURFACE_ONE, SURFACE_TWO],
      activeSurfaceId: SURFACE_ONE,
    });
    let guardSnapshot: SurfaceExitGuardSnapshot = { status: "allowed" };
    let publishGuardChange = () => {};
    owner.environment.registerGuard({
      ownerId: "quiz-one",
      surfaceId: SURFACE_ONE,
      getSnapshot: () => guardSnapshot,
      subscribe(listener) {
        publishGuardChange = listener;
        return () => {
          publishGuardChange = () => {};
        };
      },
    });
    const commitSurfaceChange = vi.fn();
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: owner.environment,
      getActiveSurfaceId: () => SURFACE_ONE,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange,
    });

    guardSnapshot = {
      status: "blocked",
      blocker: quizBlocker("quiz-one", "in_progress"),
    };

    const refused = requestSurfaceChange(SURFACE_TWO);

    expect(refused.status).toBe("error");
    expect(commitSurfaceChange).not.toHaveBeenCalled();

    guardSnapshot = { status: "allowed" };
    publishGuardChange();

    expect(commitSurfaceChange).not.toHaveBeenCalled();

    const allowed = requestSurfaceChange(SURFACE_TWO);

    expect(allowed.status).toBe("ok");
    expect(commitSurfaceChange).toHaveBeenCalledOnce();
    expect(commitSurfaceChange).toHaveBeenCalledWith(SURFACE_TWO);
  });

  it("treats a same-Surface request as a successful no-op without evaluating departure", () => {
    const evaluateSnapshot = vi.fn(() => {
      throw new Error("must not evaluate");
    });
    const commitSurfaceChange = vi.fn();
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: { evaluateSnapshot },
      getActiveSurfaceId: () => SURFACE_ONE,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange,
    });

    const result = requestSurfaceChange(SURFACE_ONE);

    expect(result.status).toBe("ok");
    expect(Object.isFrozen(result)).toBe(true);
    expect(evaluateSnapshot).not.toHaveBeenCalled();
    expect(commitSurfaceChange).not.toHaveBeenCalled();
  });

  it("throws when the requested target is not in the Slideshow lifecycle", () => {
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: { evaluateSnapshot: () => allowedSnapshot(SURFACE_ONE) },
      getActiveSurfaceId: () => SURFACE_ONE,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange: vi.fn(),
    });

    expect(() => requestSurfaceChange(UNKNOWN_SURFACE)).toThrowError(
      'Cannot request unknown Slideshow Surface "surface99999".',
    );
  });

  it("throws when a departure is requested without an active Surface", () => {
    const evaluateSnapshot = vi.fn(() => allowedSnapshot(null));
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: { evaluateSnapshot },
      getActiveSurfaceId: () => null,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange: vi.fn(),
    });

    expect(() => requestSurfaceChange(SURFACE_TWO)).toThrowError(
      "Cannot change Slideshow Surface without an active Surface.",
    );
    expect(evaluateSnapshot).not.toHaveBeenCalled();
  });

  it("throws when the fresh environment snapshot does not match the active Surface", () => {
    const commitSurfaceChange = vi.fn();
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: { evaluateSnapshot: () => allowedSnapshot(SURFACE_TWO) },
      getActiveSurfaceId: () => SURFACE_ONE,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange,
    });

    expect(() => requestSurfaceChange(SURFACE_TWO)).toThrowError(
      'Surface Exit snapshot for "surface00002" does not match active Surface "surface00001".',
    );
    expect(commitSurfaceChange).not.toHaveBeenCalled();
  });

  it("keeps guard evaluation defects observable", () => {
    const guardDefect = new Error("guard evaluation defect");
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: {
        evaluateSnapshot() {
          throw guardDefect;
        },
      },
      getActiveSurfaceId: () => SURFACE_ONE,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange: vi.fn(),
    });

    expect(() => requestSurfaceChange(SURFACE_TWO)).toThrow(guardDefect);
  });

  it("keeps commit defects observable instead of converting them to refusals", () => {
    const commitDefect = new Error("commit defect");
    const requestSurfaceChange = createRequestSurfaceChange({
      environment: { evaluateSnapshot: () => allowedSnapshot(SURFACE_ONE) },
      getActiveSurfaceId: () => SURFACE_ONE,
      isKnownSurfaceId: isKnownSurfaceId,
      commitSurfaceChange() {
        throw commitDefect;
      },
    });

    expect(() => requestSurfaceChange(SURFACE_TWO)).toThrow(commitDefect);
  });
});

function isKnownSurfaceId(surfaceId: typeof SURFACE_ONE): boolean {
  return surfaceId === SURFACE_ONE || surfaceId === SURFACE_TWO;
}

function quizBlocker(
  ownerId: string,
  attemptStatus: "not_started" | "in_progress",
): SurfaceExitBlocker {
  return Object.freeze({
    reason: "quiz-not-complete",
    ownerId,
    surfaceId: SURFACE_ONE,
    attemptStatus,
  });
}

function presentationBlocker(ownerId: string, waitId: string): SurfaceExitBlocker {
  return Object.freeze({
    reason: "presentation-learner-wait",
    ownerId,
    surfaceId: SURFACE_ONE,
    waitId: waitId as PresentationWaitId,
  });
}

function allowedSnapshot(surfaceId: typeof SURFACE_ONE | null): SurfaceExitSnapshot {
  return Object.freeze({
    status: "allowed",
    surfaceId,
    blockers: Object.freeze([]) as readonly [],
  });
}

function blockedSnapshot(
  surfaceId: typeof SURFACE_ONE,
  blockers: readonly [SurfaceExitBlocker, ...SurfaceExitBlocker[]],
): SurfaceExitSnapshot {
  return Object.freeze({
    status: "blocked",
    surfaceId,
    blockers: Object.freeze([...blockers]) as readonly [
      SurfaceExitBlocker,
      ...SurfaceExitBlocker[],
    ],
  });
}
