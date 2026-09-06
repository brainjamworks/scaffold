import type { SurfaceTransitionV1 } from "@scaffold/contracts";

import type { PresentationMotionMode } from "./compiled-presentation-program";

/** Navigation direction derived by SlideshowPlayer; never persisted. */
export type SurfaceTransitionDirection = "forward" | "backward";

/** Clip insets as percentages of the frame; all zero means unclipped. */
export interface SurfaceTransitionClipInset {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Driver-neutral paint of one whole Surface frame at one instant. */
export interface SurfaceTransitionLayerState {
  readonly opacity: number;
  /** Horizontal offset as a percentage of the frame width. */
  readonly translateXPercent: number;
  readonly clipInsetPercent: SurfaceTransitionClipInset;
}

export interface SurfaceTransitionKeyframe {
  readonly offset: number;
  readonly outgoing: SurfaceTransitionLayerState;
  readonly incoming: SurfaceTransitionLayerState;
}

export interface SurfaceTransitionScene {
  readonly outgoing: SurfaceTransitionLayerState;
  readonly incoming: SurfaceTransitionLayerState;
  /** True once the incoming Surface fully owns the frame and the outgoing layer may unmount. */
  readonly settled: boolean;
}

/** Resolved treatment the player hands to the driver; `null` means Cut. */
export interface ResolvedSurfaceTransition {
  readonly kind: SurfaceTransitionV1["kind"];
  readonly durationMs: number;
  readonly easing: string;
  readonly keyframes: readonly [SurfaceTransitionKeyframe, ...SurfaceTransitionKeyframe[]];
}

const UNCLIPPED: SurfaceTransitionClipInset = Object.freeze({
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});

const PRESENT: SurfaceTransitionLayerState = Object.freeze({
  opacity: 1,
  translateXPercent: 0,
  clipInsetPercent: UNCLIPPED,
});

const FADED_OUT: SurfaceTransitionLayerState = Object.freeze({ ...PRESENT, opacity: 0 });

/** Product easing defaults per treatment, expressed in the animation driver's vocabulary. */
const SURFACE_TRANSITION_EASING: Readonly<Record<SurfaceTransitionV1["kind"], string>> =
  Object.freeze({
    fade: "linear",
    slide: "cubicBezier(0.77, 0, 0.175, 1)",
    wipe: "cubicBezier(0.23, 1, 0.32, 1)",
  });

/**
 * Resolves the incoming Surface's authored transition for one navigation.
 * Reduced motion and absence both resolve to Cut (`null`) at the same boundary.
 */
export function resolveSurfaceTransition(
  transition: SurfaceTransitionV1 | null,
  motionMode: PresentationMotionMode,
  direction: SurfaceTransitionDirection,
): ResolvedSurfaceTransition | null {
  if (transition === null || motionMode === "reduced-motion") return null;
  assertTransition(transition);
  return Object.freeze({
    kind: transition.kind,
    durationMs: transition.durationMs,
    easing: SURFACE_TRANSITION_EASING[transition.kind],
    keyframes: surfaceTransitionKeyframes(transition.kind, direction),
  });
}

/**
 * Pure paint of both Surface layers for one transition progress in `[0, 1]`.
 * Cut and reduced motion return the settled scene at any progress.
 */
export function surfaceTransitionSceneAt(
  transition: SurfaceTransitionV1 | null,
  progress: number,
  motionMode: PresentationMotionMode,
  direction: SurfaceTransitionDirection = "forward",
): SurfaceTransitionScene {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    throw new Error("Surface transition progress must be between 0 and 1.");
  }
  const resolved = resolveSurfaceTransition(transition, motionMode, direction);
  if (resolved === null) return settledScene(FADED_OUT);
  const [from, to] = resolved.keyframes;
  if (!to) throw new Error("Surface transition recipes require a settled keyframe.");
  return Object.freeze({
    outgoing: lerpLayer(from.outgoing, to.outgoing, progress),
    incoming: lerpLayer(from.incoming, to.incoming, progress),
    settled: progress === 1,
  });
}

function surfaceTransitionKeyframes(
  kind: SurfaceTransitionV1["kind"],
  direction: SurfaceTransitionDirection,
): ResolvedSurfaceTransition["keyframes"] {
  const sign = direction === "forward" ? 1 : -1;
  switch (kind) {
    case "fade":
      return keyframes(
        { outgoing: PRESENT, incoming: FADED_OUT },
        { outgoing: FADED_OUT, incoming: PRESENT },
      );
    case "slide":
      return keyframes(
        { outgoing: PRESENT, incoming: { ...PRESENT, translateXPercent: 100 * sign } },
        { outgoing: { ...PRESENT, translateXPercent: -100 * sign }, incoming: PRESENT },
      );
    case "wipe":
      return keyframes(
        {
          outgoing: PRESENT,
          incoming: {
            ...PRESENT,
            clipInsetPercent:
              direction === "forward" ? { ...UNCLIPPED, right: 100 } : { ...UNCLIPPED, left: 100 },
          },
        },
        { outgoing: PRESENT, incoming: PRESENT },
      );
  }
}

function keyframes(
  baseline: Omit<SurfaceTransitionKeyframe, "offset">,
  settled: Omit<SurfaceTransitionKeyframe, "offset">,
): ResolvedSurfaceTransition["keyframes"] {
  return Object.freeze([
    Object.freeze({
      offset: 0,
      outgoing: freezeLayer(baseline.outgoing),
      incoming: freezeLayer(baseline.incoming),
    }),
    Object.freeze({
      offset: 1,
      outgoing: freezeLayer(settled.outgoing),
      incoming: freezeLayer(settled.incoming),
    }),
  ]) as unknown as ResolvedSurfaceTransition["keyframes"];
}

function settledScene(outgoing: SurfaceTransitionLayerState): SurfaceTransitionScene {
  return Object.freeze({ outgoing, incoming: PRESENT, settled: true });
}

function lerpLayer(
  from: SurfaceTransitionLayerState,
  to: SurfaceTransitionLayerState,
  progress: number,
): SurfaceTransitionLayerState {
  return freezeLayer({
    opacity: lerp(from.opacity, to.opacity, progress),
    translateXPercent: lerp(from.translateXPercent, to.translateXPercent, progress),
    clipInsetPercent: {
      top: lerp(from.clipInsetPercent.top, to.clipInsetPercent.top, progress),
      right: lerp(from.clipInsetPercent.right, to.clipInsetPercent.right, progress),
      bottom: lerp(from.clipInsetPercent.bottom, to.clipInsetPercent.bottom, progress),
      left: lerp(from.clipInsetPercent.left, to.clipInsetPercent.left, progress),
    },
  });
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function freezeLayer(layer: SurfaceTransitionLayerState): SurfaceTransitionLayerState {
  return Object.freeze({ ...layer, clipInsetPercent: Object.freeze({ ...layer.clipInsetPercent }) });
}

function assertTransition(transition: SurfaceTransitionV1): void {
  if (!Number.isSafeInteger(transition.durationMs) || transition.durationMs <= 0) {
    throw new Error("Surface transition duration must be a positive safe integer.");
  }
}
