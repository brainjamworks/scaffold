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
  const listeners = new Set<() => void>();
  const controller = {
    surfaceId: "surface-1" as EmbeddedNodeId,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return {
    controller,
    publish(nextSnapshot: PresentationSurfaceNarrationSnapshot) {
      snapshot = nextSnapshot;
      for (const listener of [...listeners]) listener();
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
    expect(internal.activeSubscriptions).toBe(0);
    expect(narration.activeSubscriptions).toBe(1);

    internal.emitAt(1_500);
    expect(clock.nowMs()).toBe(1_125);
    narration.emitAt(475);
    expect(clock.nowMs()).toBe(1_200);
    expect(listener).toHaveBeenCalledTimes(3);

    unsubscribe();
    expect(narration.activeSubscriptions).toBe(0);
  });
});

describe("createPresentationNarrationClockSource", () => {
  it("advances from confirmed media time and freezes while buffering, seeking, or failed", () => {
    const narration = createNarrationClockHarness({
      status: "playing",
      currentTimeMs: 100,
      durationMs: 1_000,
      error: null,
    });
    const source = createPresentationNarrationClockSource(narration.controller);
    const listener = vi.fn();
    source.subscribe(listener);

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
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it("rejects an unconfirmed narration source as an invariant defect", () => {
    const narration = createNarrationClockHarness({
      status: "paused",
      currentTimeMs: 0,
      durationMs: 1_000,
      error: null,
    });

    expect(() => createPresentationNarrationClockSource(narration.controller)).toThrowError(
      /confirmed.*playing/i,
    );
  });
});
