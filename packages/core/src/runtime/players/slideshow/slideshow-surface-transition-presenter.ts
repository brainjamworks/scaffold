import type { PresentationMotionMode, SurfaceTransitionLayerState } from "@/presentation/model";
import { resolveSurfaceTransition, surfaceTransitionSceneAt } from "@/presentation/model";

import type { SlideshowSurfaceTransitionState } from "./slideshow-navigation";

export type SurfaceTransitionFrameScheduler = (callback: (nowMs: number) => void) => () => void;

export interface PresentSurfaceTransitionInput {
  readonly transition: SlideshowSurfaceTransitionState;
  readonly outgoingRoot: HTMLElement;
  readonly incomingRoot: HTMLElement;
  /** Called exactly once when the pair reaches its settled destination (naturally or forced). */
  readonly onSettled: () => void;
  readonly scheduleFrame?: SurfaceTransitionFrameScheduler;
}

export interface SurfaceTransitionPresentation {
  /** Jumps the pair to its settled destination, clears paint and reports settlement once. */
  settle(): void;
  /** Clears paint without reporting settlement; for unmount. */
  dispose(): void;
}

const LAYER_STYLE_PROPERTIES = ["opacity", "transform", "clipPath"] as const;
const NORMAL_MOTION: PresentationMotionMode = "normal";

/**
 * Drives one whole-Surface transition between two real Surface roots. Transition time is
 * wall-clock owned by the player and never enters either Surface Timeline; paint comes from the
 * neutral recipe so the outgoing and incoming layers are deterministic at every progress value.
 */
export function presentSurfaceTransition({
  transition,
  outgoingRoot,
  incomingRoot,
  onSettled,
  scheduleFrame = animationFrameScheduler(outgoingRoot),
}: PresentSurfaceTransitionInput): SurfaceTransitionPresentation {
  if (outgoingRoot === incomingRoot) {
    throw new Error("Surface transition requires two distinct Surface roots.");
  }
  const resolved = resolveSurfaceTransition(
    transition.transition,
    NORMAL_MOTION,
    transition.direction,
  );
  if (resolved === null) {
    throw new Error("Surface transition presenter received a Cut; settle it without presenting.");
  }
  const ease = createEasing(resolved.easing);
  let startedAtMs: number | null = null;
  let finished = false;
  let cancelFrame: (() => void) | null = null;

  const paint = (progress: number) => {
    const scene = surfaceTransitionSceneAt(
      transition.transition,
      progress,
      NORMAL_MOTION,
      transition.direction,
    );
    applyLayerState(outgoingRoot, scene.outgoing);
    applyLayerState(incomingRoot, scene.incoming);
  };
  const clear = () => {
    cancelFrame?.();
    cancelFrame = null;
    clearLayerState(outgoingRoot);
    clearLayerState(incomingRoot);
  };
  const finish = (report: boolean) => {
    if (finished) return;
    finished = true;
    clear();
    if (report) onSettled();
  };
  const frame = (nowMs: number) => {
    if (finished) return;
    startedAtMs ??= nowMs;
    const linearProgress = Math.min(1, (nowMs - startedAtMs) / resolved.durationMs);
    if (linearProgress >= 1) {
      finish(true);
      return;
    }
    paint(ease(linearProgress));
    cancelFrame = scheduleFrame(frame);
  };

  paint(0);
  cancelFrame = scheduleFrame(frame);

  return Object.freeze({
    settle: () => finish(true),
    dispose: () => finish(false),
  });
}

function applyLayerState(root: HTMLElement, layer: SurfaceTransitionLayerState): void {
  root.style.opacity = String(layer.opacity);
  root.style.transform =
    layer.translateXPercent === 0 ? "" : `translateX(${layer.translateXPercent}%)`;
  const inset = layer.clipInsetPercent;
  root.style.clipPath =
    inset.top === 0 && inset.right === 0 && inset.bottom === 0 && inset.left === 0
      ? ""
      : `inset(${inset.top}% ${inset.right}% ${inset.bottom}% ${inset.left}%)`;
}

function clearLayerState(root: HTMLElement): void {
  for (const property of LAYER_STYLE_PROPERTIES) root.style[property] = "";
}

function animationFrameScheduler(root: HTMLElement): SurfaceTransitionFrameScheduler {
  const view = root.ownerDocument.defaultView;
  if (!view) throw new Error("Surface transition requires a Surface root attached to a window.");
  return (callback) => {
    const handle = view.requestAnimationFrame(callback);
    return () => view.cancelAnimationFrame(handle);
  };
}

const CUBIC_BEZIER = /^cubicBezier\(\s*([\d.]+)\s*,\s*([-\d.]+)\s*,\s*([\d.]+)\s*,\s*([-\d.]+)\s*\)$/;

function createEasing(easing: string): (progress: number) => number {
  if (easing === "linear") return (progress) => progress;
  const match = CUBIC_BEZIER.exec(easing);
  if (!match) throw new Error(`Unsupported Surface transition easing "${easing}".`);
  const [x1, y1, x2, y2] = match.slice(1, 5).map(Number) as [number, number, number, number];
  return cubicBezier(x1, y1, x2, y2);
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const sample = (a: number, b: number, t: number) =>
    ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lower = 0;
    let upper = 1;
    let t = x;
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const sampled = sample(x1, x2, t);
      if (Math.abs(sampled - x) < 1e-5) break;
      if (sampled < x) lower = t;
      else upper = t;
      t = (lower + upper) / 2;
    }
    return sample(y1, y2, t);
  };
}
