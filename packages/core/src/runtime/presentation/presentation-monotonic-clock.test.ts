import type { EmbeddedNodeId } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { PresentationSurfaceNarrationSnapshot } from "./narration";
import {
  createPresentationNarrationClockSource,
  createReplaceablePresentationPlaybackClock,
  type PresentationPlaybackClockSource,
} from "./presentation-monotonic-clock";

function createManualSource(initialNowMs: number) {
  let nowMs = initialNowMs;
  let activeSubscriptions = 0;
  const listeners = new Set<() => void>();
  const source: PresentationPlaybackClockSource = {
    nowMs: () => nowMs,
    subscribe(listener) {
      activeSubscriptions += 1;
      listeners.add(listener);
      return () => {
        if (!listeners.delete(listener)) return;
        activeSubscriptions -= 1;
      };
    },
  };

  return {
    source,
    setNowMs(nextNowMs: number) {
      nowMs = nextNowMs;
    },
    emitAt(nextNowMs: number) {
      nowMs = nextNowMs;
      for (const listener of [...listeners]) listener();
    },
    get activeSubscriptions() {
      return activeSubscriptions;
    },
  };
}

function createNarrationClockHarness(initialSnapshot: PresentationSurfaceNarrationSnapshot) {
  let snapshot = initialSnapshot;
  let liveTimeMs = initialSnapshot.currentTimeMs;
  const listeners = new Set<() => void>();
  const controller = {
    surfaceId: "surface-1" as EmbeddedNodeId,
    getSnapshot: () => snapshot,
    getClockTimeMs: () => liveTimeMs,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    controller,
    publish(nextSnapshot: PresentationSurfaceNarrationSnapshot) {
      snapshot = nextSnapshot;
      liveTimeMs = nextSnapshot.currentTimeMs;
      for (const listener of [...listeners]) listener();
    },
    setLiveTimeMs(nextTimeMs: number) {
      liveTimeMs = nextTimeMs;
    },
  };
}

describe("createReplaceablePresentationPlaybackClock", () => {
  it("atomically replaces its source while preserving its absolute reading", () => {
    const internal = createManualSource(1_000);
    const narration = createManualSource(400);
    const clock = createReplaceablePresentationPlaybackClock(internal.source);
    const listener = vi.fn();
    const unsubscribe = clock.subscribe(listener);

    internal.emitAt(1_125);
    expect(clock.nowMs()).toBe(1_125);

    clock.replaceSource(narration.source);
    expect(clock.nowMs()).toBe(1_125);
    expect(internal.activeSubscriptions).toBe(1);
    expect(narration.activeSubscriptions).toBe(0);

    narration.setNowMs(475);
    internal.emitAt(1_500);
    expect(clock.nowMs()).toBe(1_200);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    expect(internal.activeSubscriptions).toBe(0);
  });

  it("aligns a replacement source to an explicit shared position without hiding later elapsed time", () => {
    const internal = createManualSource(5_000);
    const narration = createManualSource(1_000);
    const clock = createReplaceablePresentationPlaybackClock(internal.source);

    clock.replaceSourceAt(narration.source, 1_000);
    narration.setNowMs(1_016);

    expect(clock.nowMs()).toBe(1_016);
  });
});

describe("createPresentationNarrationClockSource", () => {
  it("can establish an aligned source while loaded media is still paused", () => {
    const narration = createNarrationClockHarness({
      status: "paused",
      currentTimeMs: 1_000,
      durationMs: 2_000,
      error: null,
    });
    const source = createPresentationNarrationClockSource(narration.controller);

    expect(source.nowMs()).toBe(1_000);
    narration.publish({
      status: "playing",
      currentTimeMs: 1_016,
      durationMs: 2_000,
      error: null,
    });
    expect(source.nowMs()).toBe(1_016);
  });

  it("advances from confirmed media time and freezes while buffering, seeking, or failed", () => {
    const narration = createNarrationClockHarness({
      status: "playing",
      currentTimeMs: 100,
      durationMs: 1_000,
      error: null,
    });
    const source = createPresentationNarrationClockSource(narration.controller);

    narration.setLiveTimeMs(140);
    expect(source.nowMs()).toBe(140);

    narration.publish({
      status: "playing",
      currentTimeMs: 175,
      durationMs: 1_000,
      error: null,
    });
    expect(source.nowMs()).toBe(175);

    for (const status of ["buffering", "seeking", "failed"] as const) {
      narration.publish({
        status,
        currentTimeMs: 600,
        durationMs: 1_000,
        error: status === "failed" ? { reason: "narration-unavailable", mediaErrorCode: 3 } : null,
      });
      expect(source.nowMs()).toBe(175);
    }
  });

  it("rejects an unloaded narration source as an invariant defect", () => {
    const narration = createNarrationClockHarness({
      status: "loading",
      currentTimeMs: 0,
      durationMs: 1_000,
      error: null,
    });

    expect(() => createPresentationNarrationClockSource(narration.controller)).toThrowError(
      /loaded/i,
    );
  });
});
