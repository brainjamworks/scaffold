import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import type { SurfaceId } from "@/document/model/course-structure";
import type { PresentationWaitId } from "@/runtime/presentation/compiled-presentation-program";
import type {
  PresentationPlaybackSession,
  PresentationPlaybackSnapshot,
} from "@/runtime/presentation/presentation-playback-session";

import { createPresentationWaitSurfaceExitGuard } from "./presentation-wait-surface-exit-guard";

const SURFACE_ONE = "surface00001" as SurfaceId;
const SURFACE_TWO = "surface00002" as SurfaceId;
const FIRST_WAIT = "first-wait01" as PresentationWaitId;
const SECOND_WAIT = "second-wait1" as PresentationWaitId;

describe("Presentation Wait Surface Exit Guard", () => {
  it("projects the current outstanding Wait through one stable frozen blocker", () => {
    const source = createSessionSource(snapshot(SURFACE_ONE, FIRST_WAIT));
    const guard = createPresentationWaitSurfaceExitGuard({
      surfaceId: SURFACE_ONE,
      session: source.session,
    });

    const first = guard.getSnapshot();

    expect(first).toEqual({
      status: "blocked",
      blocker: {
        reason: "presentation-learner-wait",
        ownerId: guard.ownerId,
        surfaceId: SURFACE_ONE,
        waitId: FIRST_WAIT,
      },
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.status === "blocked" && Object.isFrozen(first.blocker)).toBe(true);

    source.replace(snapshot(SURFACE_ONE, SECOND_WAIT));

    expect(guard.getSnapshot()).toEqual({
      status: "blocked",
      blocker: {
        reason: "presentation-learner-wait",
        ownerId: guard.ownerId,
        surfaceId: SURFACE_ONE,
        waitId: SECOND_WAIT,
      },
    });

    source.replace(snapshot(SURFACE_ONE, null));

    expect(guard.getSnapshot()).toEqual({ status: "allowed" });

    source.replace(snapshot(SURFACE_ONE, FIRST_WAIT));

    expect(guard.getSnapshot()).toEqual({
      status: "blocked",
      blocker: {
        reason: "presentation-learner-wait",
        ownerId: guard.ownerId,
        surfaceId: SURFACE_ONE,
        waitId: FIRST_WAIT,
      },
    });
    expect(guard.ownerId).toBe(
      createPresentationWaitSurfaceExitGuard({
        surfaceId: SURFACE_ONE,
        session: source.session,
      }).ownerId,
    );
  });

  it("delegates subscriptions directly to the Presentation Session", () => {
    const source = createSessionSource(snapshot(SURFACE_ONE, FIRST_WAIT));
    const guard = createPresentationWaitSurfaceExitGuard({
      surfaceId: SURFACE_ONE,
      session: source.session,
    });
    const listener = vi.fn();

    const unsubscribe = guard.subscribe(listener);
    source.publish(snapshot(SURFACE_ONE, null));

    expect(source.subscribe).toHaveBeenCalledOnce();
    expect(source.subscribe).toHaveBeenCalledWith(listener);
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    source.publish(snapshot(SURFACE_ONE, FIRST_WAIT));

    expect(listener).toHaveBeenCalledOnce();
  });

  it("rejects a Session snapshot for another Surface", () => {
    const source = createSessionSource(snapshot(SURFACE_TWO, FIRST_WAIT));
    const guard = createPresentationWaitSurfaceExitGuard({
      surfaceId: SURFACE_ONE,
      session: source.session,
    });

    expect(() => guard.getSnapshot()).toThrow(
      'Presentation Wait Surface Exit Guard for "surface00001" received Session snapshot for "surface00002".',
    );
  });

  it("keeps Session read and subscription defects observable", () => {
    const readDefect = new Error("Session read defect");
    const subscribeDefect = new Error("Session subscription defect");
    const readSource = createSessionSource(snapshot(SURFACE_ONE, FIRST_WAIT));
    const subscribeSource = createSessionSource(snapshot(SURFACE_ONE, FIRST_WAIT));
    readSource.getSnapshot.mockImplementation(() => {
      throw readDefect;
    });
    subscribeSource.subscribe.mockImplementation(() => {
      throw subscribeDefect;
    });

    const readGuard = createPresentationWaitSurfaceExitGuard({
      surfaceId: SURFACE_ONE,
      session: readSource.session,
    });
    const subscribeGuard = createPresentationWaitSurfaceExitGuard({
      surfaceId: SURFACE_ONE,
      session: subscribeSource.session,
    });

    expect(() => readGuard.getSnapshot()).toThrow(readDefect);
    expect(() => subscribeGuard.subscribe(vi.fn())).toThrow(subscribeDefect);
  });
});

function snapshot(
  surfaceId: SurfaceId,
  waitId: PresentationWaitId | null,
): PresentationPlaybackSnapshot {
  return Object.freeze({
    phase: "held",
    runNumber: 1,
    surfaceId,
    position: Object.freeze({ timeMs: 0, side: "before-actions" }),
    advancement: "suspended",
    durationMs: 100,
    hold: Object.freeze({
      kind: "learner",
      waitId: waitId ?? FIRST_WAIT,
      status: waitId === null ? "ready" : "waiting",
    }),
    outstandingLearnerWait: waitId === null ? null : Object.freeze({ waitId }),
  });
}

function createSessionSource(initialSnapshot: PresentationPlaybackSnapshot) {
  let currentSnapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  const getSnapshot = vi.fn(() => currentSnapshot);
  const subscribe = vi.fn((listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  });
  const session: PresentationPlaybackSession = {
    getSnapshot,
    subscribe,
    subscribeCueReports: () => () => undefined,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(() => Result.ok()),
    advance: vi.fn(() => Result.ok()),
    restart: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  };

  return {
    session,
    getSnapshot,
    subscribe,
    replace(nextSnapshot: PresentationPlaybackSnapshot) {
      currentSnapshot = nextSnapshot;
    },
    publish(nextSnapshot: PresentationPlaybackSnapshot) {
      currentSnapshot = nextSnapshot;
      for (const listener of listeners) listener();
    },
  };
}
