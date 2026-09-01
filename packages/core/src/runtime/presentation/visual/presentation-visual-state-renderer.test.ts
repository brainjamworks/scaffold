// @vitest-environment happy-dom

import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { PresentationTargetSceneState, PresentationVisualScene } from "@/presentation/model";

import { createPresentationVisualStateRenderer } from "./presentation-visual-state-renderer";
import type { VisualAnimationDriver, VisualAnimationHandle } from "./visual-animation-driver";
import type { VisualTargetResolver } from "./visual-target-resolver";

const SURFACE_ID = EmbeddedNodeIdSchema.parse("surface00001");
const TARGET_ID = EmbeddedNodeIdSchema.parse("target000001");
const SECOND_TARGET_ID = EmbeddedNodeIdSchema.parse("target000002");
const SEGMENT_ID = EmbeddedDataIdSchema.parse("segment00001");

afterEach(() => {
  document.body.replaceChildren();
});

describe("PresentationVisualStateRenderer", () => {
  it("applies availability before seeking a Fade Reveal", () => {
    const element = document.createElement("div");
    const child = document.createElement("button");
    element.append(child);
    document.body.append(element);
    element.setAttribute("aria-hidden", "false");
    const order: string[] = [];
    const { driver, handles } = recordingDriver(order);
    const renderer = createPresentationVisualStateRenderer({
      resolver: resolver(new Map([[TARGET_ID, element]])),
      driver,
    });

    const report = renderer.apply(scene(transitionState(0.5)));

    expect(report).toEqual({ surfaceId: SURFACE_ID, timeMs: 750, unavailableTargets: [] });
    expect(element).toHaveAttribute("data-presentation-availability", "available");
    expect(element).toHaveAttribute("aria-hidden", "false");
    expect(element).not.toHaveAttribute("inert");
    expect(element.style.pointerEvents).toBe("");
    expect(handles[0]?.seek).toHaveBeenCalledWith(250);
    expect(order).toEqual(["create", "seek"]);
    expect(driver.create).toHaveBeenCalledWith({
      segmentId: SEGMENT_ID,
      element,
      durationMs: 500,
      easing: "linear",
      keyframes: [
        { offset: 0, opacity: 0 },
        { offset: 1, opacity: 1 },
      ],
    });
  });

  it("withholds focus, pointer and accessibility before paint", () => {
    const element = document.createElement("div");
    const child = document.createElement("button");
    element.append(child);
    document.body.append(element);
    child.focus();
    const renderer = createPresentationVisualStateRenderer({
      resolver: resolver(new Map([[TARGET_ID, element]])),
      driver: recordingDriver().driver,
    });

    renderer.apply(scene(withheldState()));

    expect(element).toHaveAttribute("data-presentation-availability", "withheld");
    expect(element).toHaveAttribute("aria-hidden", "true");
    expect(element).toHaveAttribute("inert");
    expect(element.style.pointerEvents).toBe("none");
    expect(element.style.opacity).toBe("0");
    expect(document.activeElement).not.toBe(child);
  });

  it("collects independent unmounted outcomes while rendering available targets", () => {
    const mounted = document.createElement("div");
    document.body.append(mounted);
    const renderer = createPresentationVisualStateRenderer({
      resolver: resolver(new Map([[SECOND_TARGET_ID, mounted]])),
      driver: recordingDriver().driver,
    });

    const report = renderer.apply(
      scene(withheldState(), new Map([[SECOND_TARGET_ID, settledState(SECOND_TARGET_ID)]])),
    );

    expect(report.unavailableTargets).toEqual([
      { targetId: TARGET_ID, reason: "target-unmounted" },
    ]);
    expect(mounted).toHaveAttribute("data-presentation-availability", "available");
    expect(mounted.style.opacity).toBe("1");
  });

  it("uses a settled result without a driver handle for reduced motion", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const { driver } = recordingDriver();
    const renderer = createPresentationVisualStateRenderer({
      resolver: resolver(new Map([[TARGET_ID, element]])),
      driver,
    });

    renderer.apply(scene(settledState(TARGET_ID)));

    expect(driver.create).not.toHaveBeenCalled();
    expect(element.style.opacity).toBe("1");
  });

  it("preserves an authored transform through active effects and settled Move", () => {
    const element = document.createElement("div");
    element.style.transform = "translate(-50%, -50%)";
    document.body.append(element);
    const { driver } = recordingDriver();
    const renderer = createPresentationVisualStateRenderer({
      resolver: resolver(new Map([[TARGET_ID, element]])),
      driver,
    });

    renderer.apply(scene(pulseState()));
    expect(driver.create).toHaveBeenCalledWith(
      expect.objectContaining({ baseTransform: "translate(-50%, -50%)" }),
    );

    renderer.apply(scene(settledMoveState()));
    expect(element.style.transform).toBe("translate(-50%, -50%) translate(40px, 20px)");

    renderer.dispose();
    expect(element.style.transform).toBe("translate(-50%, -50%)");
  });

  it("cancels stale handles and restores only Presentation-owned state on cleanup", () => {
    const element = document.createElement("div");
    element.setAttribute("aria-hidden", "false");
    element.style.pointerEvents = "auto";
    element.style.opacity = "0.8";
    document.body.append(element);
    const { driver, handles } = recordingDriver();
    const clearResolver = vi.fn();
    const targetResolver = resolver(new Map([[TARGET_ID, element]]), clearResolver);
    const renderer = createPresentationVisualStateRenderer({ resolver: targetResolver, driver });

    renderer.apply(scene(transitionState(0.25)));
    renderer.apply(scene(settledState(TARGET_ID)));
    renderer.apply(scene(transitionState(0.75)));

    expect(handles[0]?.cancel).toHaveBeenCalledOnce();
    expect(handles[0]?.seek).toHaveBeenCalledTimes(1);
    expect(handles[1]?.seek).toHaveBeenCalledWith(375);

    renderer.dispose();
    renderer.dispose();
    expect(handles[1]?.cancel).toHaveBeenCalledOnce();
    expect(clearResolver).toHaveBeenCalledOnce();
    expect(element).not.toHaveAttribute("data-presentation-availability");
    expect(element).toHaveAttribute("aria-hidden", "false");
    expect(element).not.toHaveAttribute("inert");
    expect(element.style.pointerEvents).toBe("auto");
    expect(element.style.opacity).toBe("0.8");
  });
});

function scene(
  state: PresentationTargetSceneState,
  additional = new Map<
    ReturnType<typeof EmbeddedNodeIdSchema.parse>,
    PresentationTargetSceneState
  >(),
): PresentationVisualScene {
  return {
    surfaceId: SURFACE_ID,
    timeMs: 750,
    targetStates: new Map([[TARGET_ID, state], ...additional]),
    sequenceStates: [],
  };
}

function transitionState(progress: number): PresentationTargetSceneState {
  return {
    targetId: TARGET_ID,
    availability: "available",
    layoutParticipation: "normal",
    moveContributions: [],
    paint: {
      kind: "transition",
      segmentId: SEGMENT_ID,
      progress,
      visual: {
        kind: "reveal",
        transition: {
          kind: "fade",
          durationMs: 500,
          easing: { kind: "preset", preset: "linear" },
        },
      },
    },
  };
}

function withheldState(): PresentationTargetSceneState {
  return {
    targetId: TARGET_ID,
    availability: "withheld",
    layoutParticipation: "none",
    moveContributions: [],
    paint: { kind: "none" },
  };
}

function pulseState(): PresentationTargetSceneState {
  return {
    targetId: TARGET_ID,
    availability: "available",
    layoutParticipation: "normal",
    moveContributions: [],
    paint: {
      kind: "transition",
      segmentId: SEGMENT_ID,
      progress: 0.5,
      visual: {
        kind: "emphasize",
        durationMs: 500,
        easing: { kind: "preset", preset: "linear" },
        effect: "pulse",
      },
    },
  };
}

function settledMoveState(): PresentationTargetSceneState {
  const visual = {
    kind: "move" as const,
    durationMs: 500,
    easing: { kind: "preset" as const, preset: "linear" as const },
    boundaryId: SURFACE_ID,
    pathData: "M 0 0 L 40 20",
    orientToPath: false,
  };
  return {
    targetId: TARGET_ID,
    availability: "available",
    layoutParticipation: "normal",
    moveContributions: [{ segmentId: SEGMENT_ID, progress: 1, visual }],
    paint: { kind: "settled" },
  };
}

function settledState(
  targetId: ReturnType<typeof EmbeddedNodeIdSchema.parse>,
): PresentationTargetSceneState {
  return {
    targetId,
    availability: "available",
    layoutParticipation: "normal",
    moveContributions: [],
    paint: { kind: "settled" },
  };
}

function resolver(
  elements: ReadonlyMap<string, HTMLElement>,
  clear = vi.fn(),
): VisualTargetResolver {
  return {
    resolve(targetId) {
      const element = elements.get(targetId);
      return element
        ? { kind: "resolved", targetId, element }
        : { kind: "unavailable", targetId, reason: "target-unmounted" };
    },
    clear,
  };
}

function recordingDriver(order: string[] = []): {
  readonly driver: VisualAnimationDriver & { readonly create: ReturnType<typeof vi.fn> };
  readonly handles: Array<
    VisualAnimationHandle & { seek: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }
  >;
} {
  const handles: Array<
    VisualAnimationHandle & { seek: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }
  > = [];
  const create = vi.fn(() => {
    order.push("create");
    const handle = {
      seek: vi.fn(() => order.push("seek")),
      cancel: vi.fn(),
    };
    handles.push(handle);
    return handle;
  });
  return { driver: { create }, handles };
}
