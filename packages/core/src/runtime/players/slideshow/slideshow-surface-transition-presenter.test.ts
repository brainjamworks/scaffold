// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { SlideshowSurfaceTransitionState } from "./slideshow-navigation";
import { presentSurfaceTransition } from "./slideshow-surface-transition-presenter";

const SOURCE = EmbeddedNodeIdSchema.parse("surface00001");
const DESTINATION = EmbeddedNodeIdSchema.parse("surface00002");

describe("presentSurfaceTransition", () => {
  it("paints both real roots from the recipe and clears them at natural settlement", () => {
    const { outgoingRoot, incomingRoot, frames, present } = harness(
      transition({ kind: "fade", durationMs: 400 }),
    );

    expect(outgoingRoot.style.opacity).toBe("1");
    expect(incomingRoot.style.opacity).toBe("0");
    frames.advanceTo(0);
    frames.advanceTo(200);
    expect(Number.parseFloat(outgoingRoot.style.opacity)).toBeCloseTo(0.5, 5);
    expect(Number.parseFloat(incomingRoot.style.opacity)).toBeCloseTo(0.5, 5);
    expect(present.onSettled).not.toHaveBeenCalled();

    frames.advanceTo(400);
    expect(present.onSettled).toHaveBeenCalledTimes(1);
    expect(outgoingRoot.getAttribute("style") ?? "").toBe("");
    expect(incomingRoot.getAttribute("style") ?? "").toBe("");
    expect(frames.pending()).toBe(0);
  });

  it("mirrors slide direction and expresses wipe as a clip inset", () => {
    const forward = harness(transition({ kind: "slide", durationMs: 300 }));
    expect(forward.incomingRoot.style.transform).toBe("translateX(100%)");
    forward.presentation.dispose();

    const backward = harness(transition({ kind: "slide", durationMs: 300 }, "backward"));
    expect(backward.incomingRoot.style.transform).toBe("translateX(-100%)");
    backward.presentation.dispose();

    const wipe = harness(transition({ kind: "wipe", durationMs: 300 }));
    expect(wipe.incomingRoot.style.clipPath).toBe("inset(0% 100% 0% 0%)");
    expect(wipe.outgoingRoot.style.opacity).toBe("1");
    wipe.presentation.dispose();
  });

  it("settles deterministically on interruption and reports settlement once", () => {
    const { presentation, outgoingRoot, incomingRoot, frames, present } = harness(
      transition({ kind: "fade", durationMs: 400 }),
    );
    frames.advanceTo(0);
    frames.advanceTo(100);

    presentation.settle();
    presentation.settle();
    expect(present.onSettled).toHaveBeenCalledTimes(1);
    expect(outgoingRoot.getAttribute("style") ?? "").toBe("");
    expect(incomingRoot.getAttribute("style") ?? "").toBe("");
    expect(frames.pending()).toBe(0);
    // A late frame after settlement is ignored.
    frames.advanceTo(1_000);
    expect(present.onSettled).toHaveBeenCalledTimes(1);
  });

  it("disposes without reporting settlement", () => {
    const { presentation, outgoingRoot, frames, present } = harness(
      transition({ kind: "fade", durationMs: 400 }),
    );
    presentation.dispose();
    expect(present.onSettled).not.toHaveBeenCalled();
    expect(outgoingRoot.getAttribute("style") ?? "").toBe("");
    expect(frames.pending()).toBe(0);
  });

  it("treats identical roots as a defect", () => {
    const root = document.createElement("div");
    expect(() =>
      presentSurfaceTransition({
        transition: transition({ kind: "fade", durationMs: 400 }),
        outgoingRoot: root,
        incomingRoot: root,
        onSettled: () => undefined,
        scheduleFrame: () => () => undefined,
      }),
    ).toThrow(/two distinct Surface roots/);
  });
});

function transition(
  treatment: SlideshowSurfaceTransitionState["transition"],
  direction: SlideshowSurfaceTransitionState["direction"] = "forward",
): SlideshowSurfaceTransitionState {
  return Object.freeze({
    sourceSurfaceId: SOURCE,
    destinationSurfaceId: DESTINATION,
    direction,
    transition: treatment,
  });
}

function harness(state: SlideshowSurfaceTransitionState) {
  const outgoingRoot = document.createElement("div");
  const incomingRoot = document.createElement("div");
  const frames = fakeFrames();
  const onSettled = vi.fn();
  const presentation = presentSurfaceTransition({
    transition: state,
    outgoingRoot,
    incomingRoot,
    onSettled,
    scheduleFrame: frames.schedule,
  });
  return { outgoingRoot, incomingRoot, frames, presentation, present: { onSettled } };
}

function fakeFrames() {
  const callbacks = new Set<(nowMs: number) => void>();
  return {
    schedule(callback: (nowMs: number) => void) {
      callbacks.add(callback);
      return () => callbacks.delete(callback);
    },
    advanceTo(nowMs: number) {
      const due = [...callbacks];
      callbacks.clear();
      for (const callback of due) callback(nowMs);
    },
    pending: () => callbacks.size,
  };
}
