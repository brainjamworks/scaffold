import { describe, expect, it } from "vite-plus/test";

import {
  resolveSurfaceTransition,
  surfaceTransitionSceneAt,
  type SurfaceTransitionLayerState,
} from "./presentation-surface-transition";

const PRESENT: SurfaceTransitionLayerState = {
  opacity: 1,
  translateXPercent: 0,
  clipInsetPercent: { top: 0, right: 0, bottom: 0, left: 0 },
};

describe("surfaceTransitionSceneAt", () => {
  it("crossfades a Fade between both frames", () => {
    const scene = surfaceTransitionSceneAt({ kind: "fade", durationMs: 400 }, 0.25, "normal");

    expect(scene.outgoing).toEqual({ ...PRESENT, opacity: 0.75 });
    expect(scene.incoming).toEqual({ ...PRESENT, opacity: 0.25 });
    expect(scene.settled).toBe(false);
  });

  it.each([
    ["forward", 50, -50],
    ["backward", -50, 50],
  ] as const)(
    "pushes a Slide %s from the navigation side",
    (direction, incomingOffset, outgoingOffset) => {
      const scene = surfaceTransitionSceneAt(
        { kind: "slide", durationMs: 400 },
        0.5,
        "normal",
        direction,
      );

      expect(scene.incoming).toEqual({ ...PRESENT, translateXPercent: incomingOffset });
      expect(scene.outgoing).toEqual({ ...PRESENT, translateXPercent: outgoingOffset });
    },
  );

  it.each([
    ["forward", { top: 0, right: 60, bottom: 0, left: 0 }],
    ["backward", { top: 0, right: 0, bottom: 0, left: 60 }],
  ] as const)("wipes the incoming frame in %s over a static outgoing frame", (direction, inset) => {
    const scene = surfaceTransitionSceneAt(
      { kind: "wipe", durationMs: 400 },
      0.4,
      "normal",
      direction,
    );

    expect(scene.outgoing).toEqual(PRESENT);
    expect(scene.incoming).toEqual({ ...PRESENT, clipInsetPercent: inset });
  });

  it("starts from the baseline and settles with the incoming frame owning the Surface", () => {
    for (const kind of ["fade", "slide", "wipe"] as const) {
      const start = surfaceTransitionSceneAt({ kind, durationMs: 400 }, 0, "normal");
      const end = surfaceTransitionSceneAt({ kind, durationMs: 400 }, 1, "normal");
      expect(start.settled).toBe(false);
      expect(end.incoming).toEqual(PRESENT);
      expect(end.settled).toBe(true);
      expect(Object.isFrozen(end)).toBe(true);
      expect(Object.isFrozen(end.incoming.clipInsetPercent)).toBe(true);
    }
  });

  it.each([
    ["Cut", null, "normal"],
    ["reduced motion", { kind: "slide", durationMs: 400 }, "reduced-motion"],
  ] as const)("applies the final state immediately for %s", (_name, transition, motionMode) => {
    for (const progress of [0, 0.5, 1]) {
      const scene = surfaceTransitionSceneAt(transition, progress, motionMode);
      expect(scene.incoming).toEqual(PRESENT);
      expect(scene.outgoing).toEqual({ ...PRESENT, opacity: 0 });
      expect(scene.settled).toBe(true);
    }
    expect(resolveSurfaceTransition(transition, motionMode, "forward")).toBeNull();
  });

  it("resolves a product easing and two-keyframe recipe per treatment", () => {
    const resolved = resolveSurfaceTransition(
      { kind: "slide", durationMs: 400 },
      "normal",
      "forward",
    );

    expect(resolved).toMatchObject({ kind: "slide", durationMs: 400 });
    expect(resolved?.easing).toMatch(/cubicBezier/);
    expect(resolved?.keyframes.map(({ offset }) => offset)).toEqual([0, 1]);
    expect(resolved?.keyframes[0].incoming.translateXPercent).toBe(100);
  });

  it("rejects out-of-range progress and invalid durations as programming defects", () => {
    expect(() =>
      surfaceTransitionSceneAt({ kind: "fade", durationMs: 400 }, 1.5, "normal"),
    ).toThrow(/progress/);
    expect(() =>
      resolveSurfaceTransition({ kind: "fade", durationMs: 0 }, "normal", "forward"),
    ).toThrow(/duration/);
  });
});
