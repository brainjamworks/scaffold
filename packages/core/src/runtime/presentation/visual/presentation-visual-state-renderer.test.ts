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
const OWNER_ID = EmbeddedNodeIdSchema.parse("region000001");
const LAYER_ID = EmbeddedNodeIdSchema.parse("layer0000001");
const SEGMENT_ID = EmbeddedDataIdSchema.parse("segment00001");

afterEach(() => {
  document.body.replaceChildren();
});

describe("PresentationVisualStateRenderer", () => {
  it("commits Layer selection before resolving and painting descendant targets", () => {
    const element = document.createElement("div");
    document.body.append(element);
    const order: string[] = [];
    const targetResolver: VisualTargetResolver = {
      resolve(targetId) {
        order.push("resolve-target");
        return { kind: "resolved", targetId, element };
      },
      clear() {},
    };
    const layerApplication = {
      applySelection: vi.fn(() => order.push("apply-layers")),
    };
    const renderer = createPresentationVisualStateRenderer({
      resolver: targetResolver,
      driver: recordingDriver().driver,
      layerApplication,
    });
    const selectedLayerByOwnerId = new Map([[OWNER_ID, LAYER_ID]]);

    renderer.apply(scene(settledState(TARGET_ID), new Map(), selectedLayerByOwnerId));

    expect(order).toEqual(["apply-layers", "resolve-target"]);
    expect(layerApplication.applySelection).toHaveBeenCalledWith(
      expect.objectContaining({ selectedLayerByOwnerId }),
    );
  });

  it("keeps a missing Layer application port observable", () => {
    const renderer = createPresentationVisualStateRenderer({
      resolver: resolver(new Map()),
      driver: recordingDriver().driver,
    });

    expect(() =>
      renderer.apply(scene(settledState(TARGET_ID), new Map(), new Map([[OWNER_ID, LAYER_ID]]))),
    ).toThrow(/no runtime application port/);
  });

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

  it("cancels and clears transient descendant paint when its selected Layer cuts away", () => {
    const element = document.createElement("div");
    element.style.opacity = "0.8";
    document.body.append(element);
    let layerActive = true;
    const targetResolver: VisualTargetResolver = {
      resolve(targetId) {
        return layerActive
          ? { kind: "resolved", targetId, element }
          : { kind: "unavailable", targetId, reason: "owner-view-inactive" };
      },
      clear() {},
    };
    const { driver, handles } = recordingDriver();
    const renderer = createPresentationVisualStateRenderer({ resolver: targetResolver, driver });

    renderer.apply(scene(transitionState(0.5)));
    element.style.opacity = "0.5";
    layerActive = false;
    const report = renderer.apply(scene(transitionState(0.5)));

    expect(handles[0]?.cancel).toHaveBeenCalledOnce();
    expect(element.style.opacity).toBe("0.8");
    expect(report.unavailableTargets).toEqual([
      { targetId: TARGET_ID, reason: "owner-view-inactive" },
    ]);
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

  it("preserves an authored transform through active effects and cleanup", () => {
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
  selectedLayerByOwnerId = new Map<
    ReturnType<typeof EmbeddedNodeIdSchema.parse>,
    ReturnType<typeof EmbeddedNodeIdSchema.parse>
  >(),
): PresentationVisualScene {
  return {
    surfaceId: SURFACE_ID,
    position: { timeMs: 750, side: "after-actions" },
    selectedLayerByOwnerId,
    targetStates: new Map([[TARGET_ID, state], ...additional]),
  };
}

function transitionState(progress: number): PresentationTargetSceneState {
  return {
    targetId: TARGET_ID,
    availability: "available",
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
    paint: { kind: "none" },
  };
}

function pulseState(): PresentationTargetSceneState {
  return {
    targetId: TARGET_ID,
    availability: "available",
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

function settledState(
  targetId: ReturnType<typeof EmbeddedNodeIdSchema.parse>,
): PresentationTargetSceneState {
  return {
    targetId,
    availability: "available",
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
