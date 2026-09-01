import {
  EmbeddedDataIdSchema,
  PresentationContentLayout,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  CompiledSurfacePresentationVisualProgram,
  PresentationMotionMode,
  PresentationVisualScene,
} from "@/presentation/model";
import type { PresentationPlaybackSnapshot } from "@/runtime/presentation/presentation-playback-session";

import type {
  PresentationVisualStateRenderer,
  VisualSceneApplicationReport,
} from "./presentation-visual-state-renderer";
import { createPresentationVisualRuntime } from "./presentation-visual-runtime";

const SURFACE_ID = "surface00001" as EmbeddedNodeId;
const TARGET_ID = "target000001" as EmbeddedNodeId;

describe("createPresentationVisualRuntime", () => {
  it("projects the initial and every confirmed Session snapshot without invoking transport", () => {
    const source = createSnapshotSource(0);
    const applied: PresentationVisualScene[] = [];
    let motionMode: PresentationMotionMode = "normal";
    const renderer = rendererSpy(applied);

    const runtime = createPresentationVisualRuntime({
      visualProgram: revealProgram(),
      session: source.session,
      renderer,
      getMotionMode: () => motionMode,
    });

    expect(applied).toHaveLength(1);
    expect(applied[0]?.timeMs).toBe(0);
    expect(applied[0]?.targetStates.get(TARGET_ID)).toMatchObject({
      availability: "withheld",
      paint: { kind: "none" },
    });

    source.publish(750);
    expect(applied.at(-1)?.targetStates.get(TARGET_ID)).toMatchObject({
      availability: "available",
      paint: { kind: "transition", progress: 0.5 },
    });

    motionMode = "reduced-motion";
    source.publish(800);
    expect(applied.at(-1)?.targetStates.get(TARGET_ID)).toMatchObject({
      availability: "available",
      paint: { kind: "settled" },
    });
    expect(source.transportCalls).toEqual([]);

    runtime.dispose();
    runtime.dispose();
    expect(source.unsubscribe).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();

    source.publish(900);
    expect(applied.at(-1)?.timeMs).toBe(800);
  });

  it("keeps invariant defects observable and tears down a failed initial application", () => {
    const source = createSnapshotSource(0, "surface00002" as EmbeddedNodeId);
    const renderer = rendererSpy([]);

    expect(() =>
      createPresentationVisualRuntime({
        visualProgram: revealProgram(),
        session: source.session,
        renderer,
        getMotionMode: () => "normal",
      }),
    ).toThrow(/Surface/);
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(source.subscribe).not.toHaveBeenCalled();
  });

  it("retains typed renderer outcomes for the owning Slideshow runtime", () => {
    const source = createSnapshotSource(0);
    const unavailableTarget = Object.freeze({
      targetId: TARGET_ID,
      reason: "target-unmounted" as const,
    });
    const contentLayoutError = Object.freeze({
      reason: "content-layout-changed" as const,
      surfaceId: SURFACE_ID,
      containerId: TARGET_ID,
      expectedContentLayout: PresentationContentLayout.Flow,
      currentContentLayout: PresentationContentLayout.Sequence,
    });
    const renderer = rendererSpy([], (scene) =>
      Object.freeze({
        surfaceId: scene.surfaceId,
        timeMs: scene.timeMs,
        unavailableTargets: Object.freeze([unavailableTarget]),
        contentLayoutError,
      }),
    );
    const runtime = createPresentationVisualRuntime({
      visualProgram: revealProgram(),
      session: source.session,
      renderer,
      getMotionMode: () => "normal",
    });

    expect(runtime.getLatestApplicationReport()).toEqual({
      surfaceId: SURFACE_ID,
      timeMs: 0,
      unavailableTargets: [unavailableTarget],
      contentLayoutError,
    });
    source.publish(750);
    expect(runtime.getLatestApplicationReport()).toMatchObject({
      timeMs: 750,
      unavailableTargets: [unavailableTarget],
    });
    runtime.dispose();
  });
});

function createSnapshotSource(timeMs: number, surfaceId = SURFACE_ID) {
  let snapshot = presentationSnapshot(timeMs, surfaceId);
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      unsubscribe();
    };
  });
  const transportCalls: string[] = [];
  const session = {
    getSnapshot: () => snapshot,
    subscribe,
    play: () => transportCalls.push("play"),
    pause: () => transportCalls.push("pause"),
    seek: () => transportCalls.push("seek"),
    restart: () => transportCalls.push("restart"),
    stop: () => transportCalls.push("stop"),
  };
  return {
    session,
    subscribe,
    unsubscribe,
    transportCalls,
    publish(nextTimeMs: number) {
      snapshot = presentationSnapshot(nextTimeMs, surfaceId);
      for (const listener of [...listeners]) listener();
    },
  };
}

function rendererSpy(
  applied: PresentationVisualScene[],
  report: (scene: PresentationVisualScene) => VisualSceneApplicationReport = (scene) =>
    Object.freeze({
      surfaceId: scene.surfaceId,
      timeMs: scene.timeMs,
      unavailableTargets: Object.freeze([]),
    }),
) {
  return {
    apply: vi.fn((scene: PresentationVisualScene): VisualSceneApplicationReport => {
      applied.push(scene);
      return report(scene);
    }),
    clear: vi.fn(),
    dispose: vi.fn(),
  } satisfies PresentationVisualStateRenderer;
}

function presentationSnapshot(
  currentTimeMs: number,
  surfaceId: EmbeddedNodeId,
): PresentationPlaybackSnapshot {
  return Object.freeze({
    phase: "paused",
    runNumber: 1,
    surfaceId,
    currentTimeMs,
    durationMs: 1_000,
    outstandingLearnerWait: null,
  });
}

function revealProgram(): CompiledSurfacePresentationVisualProgram {
  return Object.freeze({
    surfaceId: SURFACE_ID,
    durationMs: 1_000,
    targetById: new Map([
      [TARGET_ID, Object.freeze({ targetId: TARGET_ID, initialVisibility: "withheld" as const })],
    ]),
    segments: Object.freeze([
      Object.freeze({
        id: EmbeddedDataIdSchema.parse("reveal000001"),
        targetId: TARGET_ID,
        startMs: 500,
        endMs: 1_000,
        visual: Object.freeze({
          kind: "reveal" as const,
          transition: Object.freeze({
            kind: "fade" as const,
            durationMs: 500,
            easing: Object.freeze({ kind: "preset" as const, preset: "linear" as const }),
          }),
        }),
      }),
    ]),
    sequenceContainers: Object.freeze([]),
  });
}
