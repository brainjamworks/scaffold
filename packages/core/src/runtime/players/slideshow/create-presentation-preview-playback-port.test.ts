import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import type { SurfaceId } from "@/document/model/course-structure";
import type { PresentationPlaybackSnapshot } from "@/runtime/presentation/presentation-playback-session";

import { createPresentationPreviewPlaybackPort } from "./create-presentation-preview-playback-port";
import type {
  SlideshowPresentationControls,
  SlideshowPresentationSeekResult,
} from "./slideshow-surface-runtime-composition";

const SURFACE_ID = "surface00000" as SurfaceId;

describe("createPresentationPreviewPlaybackPort", () => {
  it("returns the same snapshot object while the playback session snapshot is unchanged", () => {
    const port = createPresentationPreviewPlaybackPort({
      controls: createControls(),
      seek: appliedSeek,
      surfaceId: SURFACE_ID,
    });

    const first = port.getSnapshot();

    expect(port.getSnapshot()).toBe(first);
    expect(first).toEqual({
      status: "ready",
      surfaceId: SURFACE_ID,
      phase: "awaiting-start",
      currentTimeMs: 0,
      durationMs: 4_000,
    });
  });

  it("publishes a new snapshot object once the playback session snapshot changes", () => {
    const controls = createControls();
    const port = createPresentationPreviewPlaybackPort({
      controls,
      seek: appliedSeek,
      surfaceId: SURFACE_ID,
    });
    const first = port.getSnapshot();

    controls.publish({
      phase: "playing",
      position: { timeMs: 120, side: "after-actions" },
      advancement: "advancing",
    });
    const second = port.getSnapshot();

    expect(second).not.toBe(first);
    expect(second).toMatchObject({ phase: "playing", currentTimeMs: 120 });
    expect(port.getSnapshot()).toBe(second);
  });

  it("keeps play, pause, seek and subscribe delegating to the Surface runtime", async () => {
    const controls = createControls();
    const seek = vi.fn(appliedSeek);
    const port = createPresentationPreviewPlaybackPort({ controls, seek, surfaceId: SURFACE_ID });
    const listener = vi.fn();

    const unsubscribe = port.subscribe(listener);
    controls.publish({ position: { timeMs: 50, side: "after-actions" } });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    controls.publish({ position: { timeMs: 90, side: "after-actions" } });
    expect(listener).toHaveBeenCalledTimes(1);

    expect(port.play().isOk()).toBe(true);
    expect(controls.playCalls).toBe(1);
    expect(port.pause().isOk()).toBe(true);
    expect(controls.pauseCalls).toBe(1);

    const seeked = await port.seek(750);
    expect(seek).toHaveBeenCalledWith(750);
    expect(seeked.isOk() && seeked.value).toEqual({ kind: "applied", timeMs: 750 });
  });

  it("reports a preview-not-ready seek failure for a cancelled narration seek", async () => {
    const port = createPresentationPreviewPlaybackPort({
      controls: createControls(),
      seek: async (): Promise<SlideshowPresentationSeekResult> =>
        Result.err({
          reason: "cancelled",
          surfaceId: SURFACE_ID as unknown as EmbeddedNodeId,
          operation: "seek",
        }),
      surfaceId: SURFACE_ID,
    });

    const result = await port.seek(10);

    expect(result.isErr() && result.error).toEqual({
      reason: "preview-not-ready",
      operation: "seek",
      status: "error",
    });
  });

  it("passes an out-of-range seek error through untouched", async () => {
    const error = Object.freeze({
      reason: "seek-out-of-range" as const,
      requestedTimeMs: 99_000,
      durationMs: 4_000,
    });
    const port = createPresentationPreviewPlaybackPort({
      controls: createControls(),
      seek: async (): Promise<SlideshowPresentationSeekResult> => Result.err(error),
      surfaceId: SURFACE_ID,
    });

    const result = await port.seek(99_000);

    expect(result.isErr() && result.error).toBe(error);
  });
});

async function appliedSeek(timeMs: number): Promise<SlideshowPresentationSeekResult> {
  return Result.ok({
    kind: "applied",
    position: { timeMs, side: "after-actions" },
    cueReports: [],
  });
}

interface FakeControls extends SlideshowPresentationControls {
  playCalls: number;
  pauseCalls: number;
  publish(patch: Partial<PresentationPlaybackSnapshot>): void;
}

function createControls(): FakeControls {
  const listeners = new Set<() => void>();
  let snapshot: PresentationPlaybackSnapshot = Object.freeze({
    runNumber: 1,
    surfaceId: SURFACE_ID,
    phase: "awaiting-start",
    position: Object.freeze({ timeMs: 0, side: "before-actions" }),
    advancement: "suspended",
    durationMs: 4_000,
    outstandingLearnerWait: null,
  });
  const controls: FakeControls = {
    playCalls: 0,
    pauseCalls: 0,
    getSnapshot: () => snapshot,
    getNarrationSnapshot: () => null,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    subscribeCueReports: () => () => undefined,
    async play() {
      controls.playCalls += 1;
      return Result.ok();
    },
    pause() {
      controls.pauseCalls += 1;
    },
    async advance() {
      return Result.ok();
    },
    async restart() {
      return appliedSeek(0);
    },
    async returnToOutstandingCheckpoint() {
      return Result.err({ reason: "no-outstanding-learner-wait", surfaceId: SURFACE_ID });
    },
    stop() {},
    continueWithoutNarration() {},
    publish(patch: Partial<PresentationPlaybackSnapshot>) {
      snapshot = Object.freeze({ ...snapshot, ...patch }) as PresentationPlaybackSnapshot;
      for (const listener of [...listeners]) listener();
    },
  };
  return controls;
}
