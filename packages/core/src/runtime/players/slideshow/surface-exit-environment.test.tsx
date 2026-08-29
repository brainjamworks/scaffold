// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  createSurfaceExitEnvironment,
  type SurfaceExitBlocker,
  type SurfaceExitGuard,
  type SurfaceExitGuardSnapshot,
} from "./surface-exit-environment";
import {
  SurfaceExitEnvironmentProvider,
  useSurfaceExitEnvironmentAvailability,
} from "./SurfaceExitEnvironmentProvider";

const SURFACE_ONE = EmbeddedNodeIdSchema.parse("surface00001");
const SURFACE_TWO = EmbeddedNodeIdSchema.parse("surface00002");

describe("Surface Exit Environment", () => {
  it("isolates player lifecycles behind a borrow-only environment with a cached frozen snapshot", () => {
    const first = createSurfaceExitEnvironment({
      knownSurfaceIds: [SURFACE_ONE, SURFACE_TWO],
      activeSurfaceId: SURFACE_ONE,
    });
    const second = createSurfaceExitEnvironment({
      knownSurfaceIds: [SURFACE_ONE, SURFACE_TWO],
      activeSurfaceId: SURFACE_ONE,
    });

    const firstSnapshot = first.environment.getSnapshot();

    expect(first.environment).not.toBe(second.environment);
    expect(first.environment).not.toHaveProperty("setActiveSurfaceId");
    expect(first.environment).not.toHaveProperty("dispose");
    expect(Object.isFrozen(first.environment)).toBe(true);
    expect(firstSnapshot).toEqual({
      status: "allowed",
      surfaceId: SURFACE_ONE,
      blockers: [],
    });
    expect(first.environment.getSnapshot()).toBe(firstSnapshot);
    expect(Object.isFrozen(firstSnapshot)).toBe(true);
    expect(Object.isFrozen(firstSnapshot.blockers)).toBe(true);

    first.dispose();
    second.dispose();
  });

  it("aggregates every blocker in registration order and publishes only changed facts", () => {
    const owner = createOwner();
    const environmentListener = vi.fn();
    owner.environment.subscribe(environmentListener);
    const first = createGuard({
      ownerId: "quiz-one",
      surfaceId: SURFACE_ONE,
      snapshot: blocked("quiz-one", SURFACE_ONE, "not_started"),
    });
    const allowed = createGuard({
      ownerId: "quiz-two",
      surfaceId: SURFACE_ONE,
      snapshot: { status: "allowed" },
    });
    const third = createGuard({
      ownerId: "quiz-three",
      surfaceId: SURFACE_ONE,
      snapshot: blocked("quiz-three", SURFACE_ONE, "in_progress"),
    });

    owner.environment.registerGuard(first.guard);
    owner.environment.registerGuard(allowed.guard);
    owner.environment.registerGuard(third.guard);
    environmentListener.mockClear();
    const aggregate = owner.environment.getSnapshot();

    expect(aggregate).toEqual({
      status: "blocked",
      surfaceId: SURFACE_ONE,
      blockers: [
        quizBlocker("quiz-one", SURFACE_ONE, "not_started"),
        quizBlocker("quiz-three", SURFACE_ONE, "in_progress"),
      ],
    });
    expect(Object.isFrozen(aggregate)).toBe(true);
    expect(Object.isFrozen(aggregate.blockers)).toBe(true);
    expect(aggregate.blockers.every(Object.isFrozen)).toBe(true);

    first.publish(blocked("quiz-one", SURFACE_ONE, "not_started"));

    expect(owner.environment.getSnapshot()).toBe(aggregate);
    expect(environmentListener).not.toHaveBeenCalled();

    first.publish({ status: "allowed" });

    expect(owner.environment.getSnapshot()).toEqual({
      status: "blocked",
      surfaceId: SURFACE_ONE,
      blockers: [quizBlocker("quiz-three", SURFACE_ONE, "in_progress")],
    });
    expect(environmentListener).toHaveBeenCalledTimes(1);
  });

  it("freshly evaluates active guards when their authority changes before notification", () => {
    const owner = createOwner();
    const guard = createGuard({ ownerId: "quiz-one", surfaceId: SURFACE_ONE });
    owner.environment.registerGuard(guard.guard);
    const listener = vi.fn();
    owner.environment.subscribe(listener);
    const cachedAllowedSnapshot = owner.environment.getSnapshot();

    guard.replaceSnapshot(blocked("quiz-one", SURFACE_ONE, "in_progress"));

    expect(owner.environment.getSnapshot()).toBe(cachedAllowedSnapshot);

    const evaluatedSnapshot = owner.environment.evaluateSnapshot();

    expect(evaluatedSnapshot).toEqual({
      status: "blocked",
      surfaceId: SURFACE_ONE,
      blockers: [quizBlocker("quiz-one", SURFACE_ONE, "in_progress")],
    });
    expect(owner.environment.getSnapshot()).toBe(evaluatedSnapshot);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(owner.environment.evaluateSnapshot()).toBe(evaluatedSnapshot);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("defers inactive guard reads and subscriptions until its Surface becomes active", () => {
    const owner = createOwner();
    const inactive = createGuard({
      ownerId: "quiz-two",
      surfaceId: SURFACE_TWO,
      snapshot: blocked("quiz-two", SURFACE_TWO, "not_started"),
    });

    owner.environment.registerGuard(inactive.guard);

    expect(inactive.getSnapshot).not.toHaveBeenCalled();
    expect(inactive.subscribe).not.toHaveBeenCalled();

    owner.setActiveSurfaceId(SURFACE_TWO);

    expect(inactive.subscribe).toHaveBeenCalledTimes(1);
    expect(inactive.getSnapshot).toHaveBeenCalledTimes(1);
    expect(owner.environment.getSnapshot()).toEqual({
      status: "blocked",
      surfaceId: SURFACE_TWO,
      blockers: [quizBlocker("quiz-two", SURFACE_TWO, "not_started")],
    });
  });

  it("switches active subscriptions and ignores a captured callback from the old Surface", () => {
    const owner = createOwner();
    const first = createGuard({
      ownerId: "quiz-one",
      surfaceId: SURFACE_ONE,
      snapshot: blocked("quiz-one", SURFACE_ONE, "not_started"),
    });
    const second = createGuard({
      ownerId: "quiz-two",
      surfaceId: SURFACE_TWO,
      snapshot: blocked("quiz-two", SURFACE_TWO, "in_progress"),
    });
    owner.environment.registerGuard(first.guard);
    owner.environment.registerGuard(second.guard);
    const staleListener = first.capturedListeners[0]!;
    const firstUnsubscribe = first.unsubscribeFunctions[0]!;
    const environmentListener = vi.fn();
    owner.environment.subscribe(environmentListener);

    owner.setActiveSurfaceId(SURFACE_TWO);
    environmentListener.mockClear();
    const secondSnapshot = owner.environment.getSnapshot();

    expect(firstUnsubscribe).toHaveBeenCalledTimes(1);
    expect(second.subscribe).toHaveBeenCalledTimes(1);
    expect(secondSnapshot.surfaceId).toBe(SURFACE_TWO);

    first.replaceSnapshot({ status: "allowed" });
    staleListener();

    expect(owner.environment.getSnapshot()).toBe(secondSnapshot);
    expect(environmentListener).not.toHaveBeenCalled();
  });

  it("makes unregister, subscriber cleanup, and owner disposal idempotent", () => {
    const owner = createOwner();
    const guard = createGuard({
      ownerId: "quiz-one",
      surfaceId: SURFACE_ONE,
      snapshot: blocked("quiz-one", SURFACE_ONE, "not_started"),
    });
    const unregister = owner.environment.registerGuard(guard.guard);
    const listener = vi.fn();
    const unsubscribe = owner.environment.subscribe(listener);

    unregister();
    unregister();

    expect(guard.unsubscribeFunctions[0]).toHaveBeenCalledTimes(1);
    expect(owner.environment.getSnapshot()).toEqual({
      status: "allowed",
      surfaceId: SURFACE_ONE,
      blockers: [],
    });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    unsubscribe();
    owner.dispose();
    owner.dispose();
    expect(() => unregister()).not.toThrow();
  });

  it("throws for duplicate owners and unknown lifecycle Surfaces", () => {
    const owner = createOwner();
    owner.environment.registerGuard(
      createGuard({ ownerId: "quiz-one", surfaceId: SURFACE_ONE }).guard,
    );

    expect(() =>
      owner.environment.registerGuard(
        createGuard({ ownerId: "quiz-one", surfaceId: SURFACE_TWO }).guard,
      ),
    ).toThrowError('Surface Exit Guard owner "quiz-one" is already registered');
    expect(() =>
      owner.environment.registerGuard(
        createGuard({ ownerId: "quiz-unknown", surfaceId: UNKNOWN_SURFACE }).guard,
      ),
    ).toThrowError('Surface Exit Guard owner "quiz-unknown" references unknown Surface');
    expect(() => owner.setActiveSurfaceId(UNKNOWN_SURFACE)).toThrowError(
      'Cannot activate unknown Surface "surface99999"',
    );
    expect(() =>
      createSurfaceExitEnvironment({
        knownSurfaceIds: [SURFACE_ONE],
        activeSurfaceId: UNKNOWN_SURFACE,
      }),
    ).toThrowError('Cannot activate unknown Surface "surface99999"');
    expect(() =>
      createSurfaceExitEnvironment({
        knownSurfaceIds: [SURFACE_ONE, SURFACE_ONE],
        activeSurfaceId: SURFACE_ONE,
      }),
    ).toThrowError('Duplicate known Surface "surface00001"');
  });

  it("throws when blocker facts do not match their registered guard", () => {
    const ownerMismatch = createOwner();
    const surfaceMismatch = createOwner();

    expect(() =>
      ownerMismatch.environment.registerGuard(
        createGuard({
          ownerId: "quiz-one",
          surfaceId: SURFACE_ONE,
          snapshot: blocked("quiz-other", SURFACE_ONE, "not_started"),
        }).guard,
      ),
    ).toThrowError('Surface Exit Guard "quiz-one" returned a blocker for owner "quiz-other"');
    expect(() =>
      surfaceMismatch.environment.registerGuard(
        createGuard({
          ownerId: "quiz-one",
          surfaceId: SURFACE_ONE,
          snapshot: blocked("quiz-one", SURFACE_TWO, "not_started"),
        }).guard,
      ),
    ).toThrowError('Surface Exit Guard "quiz-one" returned a blocker for another Surface');
  });

  it("keeps guard read and subscription defects observable", () => {
    const readDefect = new Error("guard read defect");
    const subscribeDefect = new Error("guard subscribe defect");
    const readOwner = createOwner();
    const subscribeOwner = createOwner();
    const readGuard = createGuard({ ownerId: "quiz-read", surfaceId: SURFACE_ONE });
    const subscribeGuard = createGuard({ ownerId: "quiz-subscribe", surfaceId: SURFACE_ONE });
    readGuard.getSnapshot.mockImplementation(() => {
      throw readDefect;
    });
    subscribeGuard.subscribe.mockImplementation(() => {
      throw subscribeDefect;
    });

    expect(() => readOwner.environment.registerGuard(readGuard.guard)).toThrow(readDefect);
    expect(() => subscribeOwner.environment.registerGuard(subscribeGuard.guard)).toThrow(
      subscribeDefect,
    );
  });

  it("throws for environment use after disposal while keeping captured cleanup safe", () => {
    const owner = createOwner();
    const guard = createGuard({ ownerId: "quiz-one", surfaceId: SURFACE_ONE });
    const unregister = owner.environment.registerGuard(guard.guard);
    const unsubscribe = owner.environment.subscribe(() => undefined);

    owner.dispose();

    expect(() => owner.environment.getSnapshot()).toThrowError(
      "Surface Exit Environment has been disposed",
    );
    expect(() => owner.environment.subscribe(() => undefined)).toThrowError(
      "Surface Exit Environment has been disposed",
    );
    expect(() =>
      owner.environment.registerGuard(
        createGuard({ ownerId: "quiz-two", surfaceId: SURFACE_ONE }).guard,
      ),
    ).toThrowError("Surface Exit Environment has been disposed");
    expect(() => owner.setActiveSurfaceId(SURFACE_TWO)).toThrowError(
      "Surface Exit Environment has been disposed",
    );
    expect(() => unregister()).not.toThrow();
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("SurfaceExitEnvironmentProvider", () => {
  it("distinguishes an unavailable Page runtime from an available borrowed environment", () => {
    const outside = renderHook(() => useSurfaceExitEnvironmentAvailability());
    const owner = createOwner();
    const wrapper = ({ children }: PropsWithChildren) => (
      <SurfaceExitEnvironmentProvider environment={owner.environment}>
        {children}
      </SurfaceExitEnvironmentProvider>
    );
    const inside = renderHook(() => useSurfaceExitEnvironmentAvailability(), { wrapper });

    expect(outside.result.current).toEqual({ status: "unavailable" });
    expect(Object.isFrozen(outside.result.current)).toBe(true);
    expect(inside.result.current).toEqual({
      status: "available",
      environment: owner.environment,
    });
    expect(Object.isFrozen(inside.result.current)).toBe(true);
    if (inside.result.current.status === "available") {
      expect(inside.result.current.environment).not.toHaveProperty("setActiveSurfaceId");
      expect(inside.result.current.environment).not.toHaveProperty("dispose");
    }
  });
});

const UNKNOWN_SURFACE = EmbeddedNodeIdSchema.parse("surface99999");

function createOwner() {
  return createSurfaceExitEnvironment({
    knownSurfaceIds: [SURFACE_ONE, SURFACE_TWO],
    activeSurfaceId: SURFACE_ONE,
  });
}

function quizBlocker(
  ownerId: string,
  surfaceId: typeof SURFACE_ONE,
  attemptStatus: "not_started" | "in_progress",
): SurfaceExitBlocker {
  return {
    reason: "quiz-not-complete",
    ownerId,
    surfaceId,
    attemptStatus,
  };
}

function blocked(
  ownerId: string,
  surfaceId: typeof SURFACE_ONE,
  attemptStatus: "not_started" | "in_progress",
): SurfaceExitGuardSnapshot {
  return { status: "blocked", blocker: quizBlocker(ownerId, surfaceId, attemptStatus) };
}

function createGuard({
  ownerId,
  surfaceId,
  snapshot = { status: "allowed" },
}: {
  ownerId: string;
  surfaceId: typeof SURFACE_ONE;
  snapshot?: SurfaceExitGuardSnapshot;
}) {
  let currentSnapshot = snapshot;
  const listeners = new Set<() => void>();
  const capturedListeners: Array<() => void> = [];
  const unsubscribeFunctions: ReturnType<typeof vi.fn>[] = [];
  const getSnapshot = vi.fn(() => currentSnapshot);
  const subscribe = vi.fn((listener: () => void) => {
    listeners.add(listener);
    capturedListeners.push(listener);
    const unsubscribe = vi.fn(() => listeners.delete(listener));
    unsubscribeFunctions.push(unsubscribe);
    return unsubscribe;
  });
  const guard: SurfaceExitGuard = { ownerId, surfaceId, getSnapshot, subscribe };

  return {
    guard,
    getSnapshot,
    subscribe,
    capturedListeners,
    unsubscribeFunctions,
    publish(nextSnapshot: SurfaceExitGuardSnapshot) {
      currentSnapshot = nextSnapshot;
      for (const listener of listeners) listener();
    },
    replaceSnapshot(nextSnapshot: SurfaceExitGuardSnapshot) {
      currentSnapshot = nextSnapshot;
    },
  };
}
