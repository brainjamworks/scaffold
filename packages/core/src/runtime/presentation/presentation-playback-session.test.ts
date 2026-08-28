import { describe, expect, it, vi } from "vite-plus/test";

import type { CompiledInternalClockSurfaceTimeline } from "./compiled-presentation-program";
import {
  createAnimationFramePresentationMonotonicClock,
  type PresentationMonotonicClockPort,
} from "./presentation-monotonic-clock";
import {
  createPresentationPlaybackSession,
  type PresentationPlaybackPhase,
  type PresentationPlaybackSession,
  type PresentationSeekResult,
} from "./presentation-playback-session";

function createManualClock(initialNowMs = 1_000) {
  let nowMs = initialNowMs;
  let activeSubscriptions = 0;
  let maximumActiveSubscriptions = 0;
  let subscriptionsStarted = 0;
  const listeners = new Set<() => void>();

  const clock: PresentationMonotonicClockPort = {
    nowMs: vi.fn(() => nowMs),
    subscribe: vi.fn((listener) => {
      let active = true;
      subscriptionsStarted += 1;
      activeSubscriptions += 1;
      maximumActiveSubscriptions = Math.max(maximumActiveSubscriptions, activeSubscriptions);
      listeners.add(listener);

      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
        activeSubscriptions -= 1;
      };
    }),
  };

  return {
    clock,
    emitAt(nextNowMs: number) {
      nowMs = nextNowMs;
      for (const listener of [...listeners]) listener();
    },
    setNowMs(nextNowMs: number) {
      nowMs = nextNowMs;
    },
    get activeSubscriptions() {
      return activeSubscriptions;
    },
    get maximumActiveSubscriptions() {
      return maximumActiveSubscriptions;
    },
    get subscriptionsStarted() {
      return subscriptionsStarted;
    },
  };
}

function createHarness(durationMs = 1_000) {
  const timeline: CompiledInternalClockSurfaceTimeline = Object.freeze({
    surfaceId: "surface-1",
    durationMs,
  });
  const manualClock = createManualClock();
  const session = createPresentationPlaybackSession({
    timeline,
    monotonicClock: manualClock.clock,
  });

  return { manualClock, session, timeline };
}

function expectSeekOk(result: PresentationSeekResult): void {
  expect(result.isOk()).toBe(true);
  if (result.isErr()) throw new Error(`Expected successful Seek: ${JSON.stringify(result.error)}`);
}

function createHarnessInPhase(phase: PresentationPlaybackPhase) {
  const harness = createHarness();

  switch (phase) {
    case "awaiting-start":
      break;
    case "playing":
      harness.session.play();
      break;
    case "paused":
      harness.session.play();
      harness.manualClock.emitAt(1_050);
      harness.session.pause();
      break;
    case "completed":
      harness.session.play();
      harness.manualClock.emitAt(2_000);
      break;
    case "stopped":
      harness.session.play();
      harness.manualClock.emitAt(1_050);
      harness.session.stop();
      break;
  }

  expect(harness.session.getSnapshot().phase).toBe(phase);
  return harness;
}

function expectDisposedSessionDefects(session: PresentationPlaybackSession): void {
  const operations: ReadonlyArray<readonly [string, () => unknown]> = [
    ["getSnapshot", () => session.getSnapshot()],
    ["subscribe", () => session.subscribe(() => undefined)],
    ["play", () => session.play()],
    ["pause", () => session.pause()],
    ["seek", () => session.seek(0)],
    ["restart", () => session.restart()],
    ["stop", () => session.stop()],
  ];

  for (const [operation, invoke] of operations) {
    expect(invoke, operation).toThrowError(/disposed/i);
  }
}

describe("createPresentationPlaybackSession", () => {
  it("starts with one frozen Scaffold snapshot and no XState surface", () => {
    const { session } = createHarness();
    const snapshot = session.getSnapshot();

    expect(snapshot).toEqual({
      phase: "awaiting-start",
      runNumber: 1,
      surfaceId: "surface-1",
      currentTimeMs: 0,
      durationMs: 1_000,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(session.getSnapshot()).toBe(snapshot);
    expect(Object.keys(snapshot).sort()).toEqual([
      "currentTimeMs",
      "durationMs",
      "phase",
      "runNumber",
      "surfaceId",
    ]);
    expect(Object.keys(session).sort()).toEqual([
      "dispose",
      "getSnapshot",
      "pause",
      "play",
      "restart",
      "seek",
      "stop",
      "subscribe",
    ]);
  });

  it("caches snapshots and notifies subscribers only when public state changes", () => {
    const { manualClock, session } = createHarness();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    const initialSnapshot = session.getSnapshot();

    session.pause();
    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe(initialSnapshot);

    session.play();
    const playingSnapshot = session.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(playingSnapshot.phase).toBe("playing");

    session.play();
    manualClock.emitAt(1_000);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toBe(playingSnapshot);

    manualClock.emitAt(1_050);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot()).not.toBe(playingSnapshot);

    unsubscribe();
    unsubscribe();
    manualClock.emitAt(1_100);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("anchors Play, pauses at the last confirmed sample, and resumes without paused wall time", () => {
    const { manualClock, session } = createHarness();

    session.play();
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 0 });
    expect(manualClock.activeSubscriptions).toBe(1);

    manualClock.emitAt(1_125.9);
    expect(session.getSnapshot().currentTimeMs).toBe(125);

    session.play();
    expect(manualClock.subscriptionsStarted).toBe(1);
    manualClock.setNowMs(1_300);
    session.pause();
    const pausedSnapshot = session.getSnapshot();
    expect(pausedSnapshot).toMatchObject({ phase: "paused", currentTimeMs: 125 });
    expect(manualClock.activeSubscriptions).toBe(0);

    session.pause();
    expect(session.getSnapshot()).toBe(pausedSnapshot);

    manualClock.setNowMs(2_000);
    session.play();
    manualClock.emitAt(2_075.8);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 200 });
    expect(manualClock.subscriptionsStarted).toBe(2);
    expect(manualClock.maximumActiveSubscriptions).toBe(1);
  });

  it("rejects non-finite Play, Resume, and playing Seek anchors as defects", () => {
    const initialPlay = createHarness();
    initialPlay.manualClock.setNowMs(Number.NaN);
    expect(() => initialPlay.session.play()).toThrowError(/finite/i);

    const resume = createHarness();
    resume.session.play();
    resume.manualClock.emitAt(1_100);
    resume.session.pause();
    resume.manualClock.setNowMs(Number.POSITIVE_INFINITY);
    expect(() => resume.session.play()).toThrowError(/finite/i);

    const playingSeek = createHarness();
    playingSeek.session.play();
    playingSeek.manualClock.setNowMs(Number.NEGATIVE_INFINITY);
    expect(() => playingSeek.session.seek(200)).toThrowError(/finite/i);
  });

  it("rejects a clock projection behind the last confirmed playhead", () => {
    const { manualClock, session } = createHarness();
    session.play();
    manualClock.emitAt(1_200);
    const confirmedSnapshot = session.getSnapshot();
    expect(confirmedSnapshot.currentTimeMs).toBe(200);

    expect(() => manualClock.emitAt(1_100)).toThrowError(/behind.*confirmed/i);
    expect(session.getSnapshot()).toBe(confirmedSnapshot);
  });

  it("clamps natural progression at the duration and stops clock work", () => {
    const { manualClock, session } = createHarness(300);

    session.play();
    manualClock.emitAt(1_299);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 299 });

    manualClock.emitAt(1_350);
    const completedSnapshot = session.getSnapshot();
    expect(completedSnapshot).toMatchObject({ phase: "completed", currentTimeMs: 300 });
    expect(manualClock.activeSubscriptions).toBe(0);
    expect(manualClock.maximumActiveSubscriptions).toBe(1);

    manualClock.emitAt(2_000);
    expect(session.getSnapshot()).toBe(completedSnapshot);
  });

  it("seeks absolutely in awaiting, playing, paused, and completed phases", () => {
    const { manualClock, session } = createHarness();
    const initialSnapshot = session.getSnapshot();

    expectSeekOk(session.seek(0));
    expect(session.getSnapshot()).toBe(initialSnapshot);

    expectSeekOk(session.seek(250));
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", currentTimeMs: 250 });

    session.play();
    manualClock.emitAt(1_100);
    expect(session.getSnapshot().currentTimeMs).toBe(350);

    manualClock.setNowMs(1_250);
    expectSeekOk(session.seek(400));
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 400 });
    expect(manualClock.activeSubscriptions).toBe(1);
    expect(manualClock.subscriptionsStarted).toBe(2);

    manualClock.emitAt(1_300);
    expect(session.getSnapshot().currentTimeMs).toBe(450);
    session.pause();

    expectSeekOk(session.seek(200));
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", currentTimeMs: 200 });

    expectSeekOk(session.seek(1_000));
    expect(session.getSnapshot()).toMatchObject({ phase: "completed", currentTimeMs: 1_000 });

    expectSeekOk(session.seek(600));
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", currentTimeMs: 600 });

    expectSeekOk(session.seek(1_000));
    expect(session.getSnapshot()).toMatchObject({ phase: "completed", currentTimeMs: 1_000 });
  });

  it("returns frozen range diagnostics without changing playback or active clock work", () => {
    const { manualClock, session } = createHarness();
    session.play();
    manualClock.emitAt(1_100);
    const beforeRejection = session.getSnapshot();
    const subscriptionsBeforeRejection = manualClock.subscriptionsStarted;

    for (const requestedTimeMs of [-1, 1_001]) {
      const result = session.seek(requestedTimeMs);
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error("Expected out-of-range Seek to fail.");
      expect(result.error).toEqual({
        reason: "seek-out-of-range",
        requestedTimeMs,
        durationMs: 1_000,
      });
      expect(Object.isFrozen(result.error)).toBe(true);
    }

    expect(session.getSnapshot()).toBe(beforeRejection);
    expect(manualClock.activeSubscriptions).toBe(1);
    expect(manualClock.subscriptionsStarted).toBe(subscriptionsBeforeRejection);
  });

  it("stops idempotently at the last confirmed time and requires Restart before reuse", () => {
    const { manualClock, session } = createHarness();
    session.play();
    manualClock.emitAt(1_240);
    manualClock.setNowMs(1_500);

    session.stop();
    const stoppedSnapshot = session.getSnapshot();
    expect(stoppedSnapshot).toMatchObject({ phase: "stopped", currentTimeMs: 240, runNumber: 1 });
    expect(manualClock.activeSubscriptions).toBe(0);

    session.stop();
    expect(session.getSnapshot()).toBe(stoppedSnapshot);
    expect(() => session.play()).toThrowError(/stopped/i);
    expect(() => session.pause()).toThrowError(/stopped/i);
    expect(() => session.seek(100)).toThrowError(/stopped/i);
    expect(session.getSnapshot()).toBe(stoppedSnapshot);

    session.restart();
    expect(session.getSnapshot()).toEqual({
      phase: "awaiting-start",
      runNumber: 2,
      surfaceId: "surface-1",
      currentTimeMs: 0,
      durationMs: 1_000,
    });
  });

  it.each([
    "awaiting-start",
    "playing",
    "paused",
    "completed",
    "stopped",
  ] satisfies readonly PresentationPlaybackPhase[])(
    "restarts from %s as a new awaiting run",
    (phase) => {
      const { manualClock, session } = createHarnessInPhase(phase);

      session.restart();

      expect(session.getSnapshot()).toEqual({
        phase: "awaiting-start",
        runNumber: 2,
        surfaceId: "surface-1",
        currentTimeMs: 0,
        durationMs: 1_000,
      });
      expect(Object.isFrozen(session.getSnapshot())).toBe(true);
      expect(manualClock.activeSubscriptions).toBe(0);
    },
  );

  it.each([
    "awaiting-start",
    "playing",
    "paused",
    "completed",
    "stopped",
  ] satisfies readonly PresentationPlaybackPhase[])(
    "disposes terminally and idempotently from %s",
    (phase) => {
      const { manualClock, session } = createHarnessInPhase(phase);
      const listener = vi.fn();
      const unsubscribe = session.subscribe(listener);

      session.dispose();
      session.dispose();
      expect(manualClock.activeSubscriptions).toBe(0);

      manualClock.emitAt(3_000);
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
      unsubscribe();
      expectDisposedSessionDefects(session);
    },
  );
});

describe("createAnimationFramePresentationMonotonicClock", () => {
  it("cancels active frame work idempotently and ignores a stale callback", () => {
    let nextFrameId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    });
    const cancelAnimationFrame = vi.fn((frameId: number) => {
      callbacks.delete(frameId);
    });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    try {
      const clock = createAnimationFramePresentationMonotonicClock();
      const listener = vi.fn();
      const unsubscribe = clock.subscribe(listener);
      expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

      const firstCallback = callbacks.get(1);
      if (!firstCallback) throw new Error("Expected the first animation-frame callback.");
      callbacks.delete(1);
      firstCallback(16);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

      const staleCallback = callbacks.get(2);
      if (!staleCallback) throw new Error("Expected the second animation-frame callback.");
      unsubscribe();
      unsubscribe();
      expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
      expect(cancelAnimationFrame).toHaveBeenCalledWith(2);

      staleCallback(32);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
