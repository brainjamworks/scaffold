import type { EmbeddedDataId, EmbeddedNodeId, PresentationEasingV1 } from "@scaffold/contracts";

import type {
  CompiledVisualIntent,
  PresentationTargetSceneState,
  PresentationVisualScene,
} from "@/presentation/model";
import type { PresentationLayerApplicationPort } from "@/runtime/presentation/presentation-layer-runtime";
import type {
  VisualAnimationDriver,
  VisualAnimationHandle,
  VisualAnimationInput,
  VisualKeyframe,
} from "./visual-animation-driver";
import type { VisualTargetResolver } from "./visual-target-resolver";

export const PRESENTATION_AVAILABILITY_ATTRIBUTE = "data-presentation-availability";

export interface VisualTargetUnavailable {
  readonly targetId: EmbeddedNodeId;
  readonly reason: "target-unmounted" | "owner-view-inactive";
}

export interface VisualSceneApplicationReport {
  readonly surfaceId: EmbeddedNodeId;
  readonly timeMs: number;
  readonly unavailableTargets: readonly VisualTargetUnavailable[];
}

export interface PresentationVisualStateRenderer {
  apply(scene: PresentationVisualScene): VisualSceneApplicationReport;
  clear(): void;
  dispose(): void;
}

interface ElementBaseline {
  readonly presentationAvailability: string | null;
  readonly ariaHidden: string | null;
  readonly inert: string | null;
  readonly pointerEvents: string;
  readonly opacity: string;
  readonly transform: string;
  readonly authoredTransform: string;
  readonly clipPath: string;
  readonly outline: string;
  readonly outlineOffset: string;
}

interface ActiveHandle {
  readonly segmentId: EmbeddedDataId;
  readonly element: HTMLElement;
  readonly handle: VisualAnimationHandle;
}

export function createPresentationVisualStateRenderer({
  resolver,
  driver,
  layerApplication,
}: {
  readonly resolver: VisualTargetResolver;
  readonly driver: VisualAnimationDriver;
  readonly layerApplication?: PresentationLayerApplicationPort;
}): PresentationVisualStateRenderer {
  const baselines = new Map<HTMLElement, ElementBaseline>();
  const activeByTargetId = new Map<EmbeddedNodeId, ActiveHandle>();
  let surfaceId: EmbeddedNodeId | null = null;
  let disposed = false;

  function clear(): void {
    for (const active of activeByTargetId.values()) active.handle.cancel();
    activeByTargetId.clear();
    for (const [element, baseline] of baselines) restoreElement(element, baseline);
    baselines.clear();
    resolver.clear();
    surfaceId = null;
  }

  return Object.freeze({
    apply(scene: PresentationVisualScene): VisualSceneApplicationReport {
      if (disposed) throw new Error("Presentation visual state renderer has been disposed.");
      if (surfaceId !== null && surfaceId !== scene.surfaceId) {
        throw new Error("Presentation visual state renderer cannot change Surface identity.");
      }
      surfaceId = scene.surfaceId;
      if (layerApplication) {
        layerApplication.applySelection(scene);
      } else if (scene.selectedLayerByOwnerId.size > 0) {
        throw new Error("Presentation Layer selection has no runtime application port.");
      }
      const unavailableTargets: VisualTargetUnavailable[] = [];
      const appliedTargetIds = new Set<EmbeddedNodeId>();

      for (const state of scene.targetStates.values()) {
        appliedTargetIds.add(state.targetId);
        const resolution = resolver.resolve(state.targetId);
        if (resolution.kind === "unavailable") {
          const cancelled = cancelTargetHandle(activeByTargetId, state.targetId);
          const baseline = cancelled ? baselines.get(cancelled.element) : undefined;
          if (cancelled && baseline) {
            restoreTransientPaint(cancelled.element, baseline);
            cancelled.element.style.opacity = baseline.opacity;
          }
          unavailableTargets.push(
            Object.freeze({ targetId: state.targetId, reason: resolution.reason }),
          );
          continue;
        }

        const element = resolution.element;
        rememberBaseline(baselines, element);
        applyAvailability(element, state, baselines.get(element)!);
        applyPaint({
          state,
          element,
          baseline: baselines.get(element)!,
          driver,
          activeByTargetId,
        });
      }

      for (const targetId of activeByTargetId.keys()) {
        if (!appliedTargetIds.has(targetId)) cancelTargetHandle(activeByTargetId, targetId);
      }

      return Object.freeze({
        surfaceId: scene.surfaceId,
        timeMs: scene.position.timeMs,
        unavailableTargets: Object.freeze(unavailableTargets),
      });
    },
    clear,
    dispose(): void {
      if (disposed) return;
      clear();
      disposed = true;
    },
  });
}

function applyAvailability(
  element: HTMLElement,
  state: PresentationTargetSceneState,
  baseline: ElementBaseline,
): void {
  element.setAttribute(PRESENTATION_AVAILABILITY_ATTRIBUTE, state.availability);
  if (state.availability === "withheld") {
    const activeElement = element.ownerDocument.activeElement;
    if (activeElement instanceof HTMLElement && element.contains(activeElement))
      activeElement.blur();
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("inert", "");
    element.style.pointerEvents = "none";
    return;
  }
  restoreAttribute(element, "aria-hidden", baseline.ariaHidden);
  restoreAttribute(element, "inert", baseline.inert);
  element.style.pointerEvents = baseline.pointerEvents;
}

function applyPaint({
  state,
  element,
  baseline,
  driver,
  activeByTargetId,
}: {
  readonly state: PresentationTargetSceneState;
  readonly element: HTMLElement;
  readonly baseline: ElementBaseline;
  readonly driver: VisualAnimationDriver;
  readonly activeByTargetId: Map<EmbeddedNodeId, ActiveHandle>;
}): void {
  if (state.paint.kind === "none") {
    cancelTargetHandle(activeByTargetId, state.targetId);
    restoreTransientPaint(element, baseline);
    element.style.opacity = "0";
    return;
  }
  if (state.paint.kind === "settled") {
    cancelTargetHandle(activeByTargetId, state.targetId);
    restoreTransientPaint(element, baseline);
    element.style.opacity = "1";
    return;
  }

  if (state.paint.visual.kind === "emphasize" && state.paint.visual.effect === "outline") {
    cancelTargetHandle(activeByTargetId, state.targetId);
    restoreTransientPaint(element, baseline);
    element.style.opacity = "1";
    element.style.outline = "3px solid currentColor";
    element.style.outlineOffset = "2px";
    return;
  }

  const input = resolveAnimationInput(
    state as PresentationTargetSceneState & {
      readonly paint: Extract<PresentationTargetSceneState["paint"], { kind: "transition" }>;
    },
    element,
    baseline,
  );
  const current = activeByTargetId.get(state.targetId);
  const active =
    current?.segmentId === state.paint.segmentId && current.element === element
      ? current
      : replaceTargetHandle(activeByTargetId, state.targetId, {
          segmentId: state.paint.segmentId,
          element,
          handle: driver.create(input),
        });
  active.handle.seek(state.paint.progress * input.durationMs);
}

function resolveAnimationInput(
  state: PresentationTargetSceneState & {
    readonly paint: Extract<PresentationTargetSceneState["paint"], { kind: "transition" }>;
  },
  element: HTMLElement,
  baseline: ElementBaseline,
): VisualAnimationInput {
  const { paint } = state;
  switch (paint.visual.kind) {
    case "reveal":
    case "hide":
      return resolveVisibilityAnimationInput(paint.segmentId, paint.visual, element, baseline);
    case "emphasize":
      if (paint.visual.effect !== "pulse") {
        throw new Error("Presentation outline emphasis must not create an animation handle.");
      }
      return Object.freeze({
        segmentId: paint.segmentId,
        element,
        durationMs: paint.visual.durationMs,
        easing: resolvePresentationEasing(paint.visual.easing),
        ...(baseline.authoredTransform ? { baseTransform: baseline.authoredTransform } : {}),
        keyframes: freezeKeyframes(
          { offset: 0, transform: Object.freeze({ scale: 1 }) },
          { offset: 0.5, transform: Object.freeze({ scale: 1.06 }) },
          { offset: 1, transform: Object.freeze({ scale: 1 }) },
        ),
      });
  }
}

function resolveVisibilityAnimationInput(
  segmentId: EmbeddedDataId,
  visual: Extract<CompiledVisualIntent, { readonly kind: "reveal" | "hide" }>,
  element: HTMLElement,
  baseline: ElementBaseline,
): VisualAnimationInput {
  const transition = visual.transition;
  if (transition.kind === "instant") {
    throw new Error("An instant visibility recipe cannot own an active animation handle.");
  }
  const reveal = visual.kind === "reveal";
  const [hidden, visible] = visibilityKeyframes(
    transition.kind,
    "direction" in transition ? transition.direction : undefined,
  );
  const keyframes = reveal ? [hidden, visible] : [visible, hidden];
  return Object.freeze({
    segmentId,
    element,
    durationMs: transition.durationMs,
    easing: resolvePresentationEasing(transition.easing),
    ...(baseline.authoredTransform && keyframes.some(({ transform }) => transform !== undefined)
      ? { baseTransform: baseline.authoredTransform }
      : {}),
    keyframes: freezeKeyframes({ ...keyframes[0], offset: 0 }, { ...keyframes[1], offset: 1 }),
  });
}

function visibilityKeyframes(
  kind: "fade" | "slide" | "float" | "scale" | "wipe",
  direction: "up" | "right" | "down" | "left" | undefined,
): readonly [
  Omit<VisualAnimationInput["keyframes"][number], "offset">,
  Omit<VisualAnimationInput["keyframes"][number], "offset">,
] {
  const visible = Object.freeze({ opacity: 1 });
  switch (kind) {
    case "fade":
      return [Object.freeze({ opacity: 0 }), visible];
    case "scale":
      return [
        Object.freeze({ opacity: 0, transform: Object.freeze({ scale: 0.92 }) }),
        Object.freeze({ opacity: 1, transform: Object.freeze({ scale: 1 }) }),
      ];
    case "slide":
    case "float": {
      if (!direction) throw new Error(`Presentation ${kind} recipe requires a direction.`);
      const distance = kind === "slide" ? 48 : 18;
      return [
        Object.freeze({ opacity: 0, transform: directionalTransform(direction, distance) }),
        Object.freeze({ opacity: 1, transform: directionalTransform(direction, 0) }),
      ];
    }
    case "wipe":
      if (!direction) throw new Error("Presentation wipe recipe requires a direction.");
      return [
        Object.freeze({ opacity: 1, clip: Object.freeze({ inset: hiddenWipeInset(direction) }) }),
        Object.freeze({ opacity: 1, clip: Object.freeze({ inset: "0% 0% 0% 0%" }) }),
      ];
  }
}

function directionalTransform(direction: "up" | "right" | "down" | "left", distance: number) {
  switch (direction) {
    case "up":
      return Object.freeze({ translateY: -distance });
    case "right":
      return Object.freeze({ translateX: distance });
    case "down":
      return Object.freeze({ translateY: distance });
    case "left":
      return Object.freeze({ translateX: -distance });
  }
}

function hiddenWipeInset(direction: "up" | "right" | "down" | "left"): string {
  switch (direction) {
    case "up":
      return "100% 0% 0% 0%";
    case "right":
      return "0% 0% 0% 100%";
    case "down":
      return "0% 0% 100% 0%";
    case "left":
      return "0% 100% 0% 0%";
  }
}

function freezeKeyframes(
  first: VisualKeyframe,
  second: VisualKeyframe,
  ...rest: readonly VisualKeyframe[]
): VisualAnimationInput["keyframes"] {
  return Object.freeze([
    Object.freeze(first),
    Object.freeze(second),
    ...rest.map((keyframe) => Object.freeze(keyframe)),
  ]) as VisualAnimationInput["keyframes"];
}

function restoreTransientPaint(element: HTMLElement, baseline: ElementBaseline): void {
  element.style.transform = baseline.transform;
  element.style.clipPath = baseline.clipPath;
  element.style.outline = baseline.outline;
  element.style.outlineOffset = baseline.outlineOffset;
}

function resolvePresentationEasing(easing: PresentationEasingV1): string {
  if (easing.kind === "cubic-bezier") {
    return `cubicBezier(${easing.x1}, ${easing.y1}, ${easing.x2}, ${easing.y2})`;
  }
  switch (easing.preset) {
    case "linear":
      return "linear";
    case "ease-in":
      return "in(2)";
    case "ease-out":
      return "cubicBezier(0.23, 1, 0.32, 1)";
    case "ease-in-out":
      return "cubicBezier(0.77, 0, 0.175, 1)";
  }
}

function rememberBaseline(
  baselines: Map<HTMLElement, ElementBaseline>,
  element: HTMLElement,
): void {
  if (baselines.has(element)) return;
  baselines.set(
    element,
    Object.freeze({
      presentationAvailability: element.getAttribute(PRESENTATION_AVAILABILITY_ATTRIBUTE),
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.getAttribute("inert"),
      pointerEvents: element.style.pointerEvents,
      opacity: element.style.opacity,
      transform: element.style.transform,
      authoredTransform: resolveAuthoredTransform(element),
      clipPath: element.style.clipPath,
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
    }),
  );
}

function resolveAuthoredTransform(element: HTMLElement): string {
  const transform = element.style.transform || getComputedStyle(element).transform;
  return transform && transform !== "none" ? transform : "";
}

function restoreElement(element: HTMLElement, baseline: ElementBaseline): void {
  restoreAttribute(element, PRESENTATION_AVAILABILITY_ATTRIBUTE, baseline.presentationAvailability);
  restoreAttribute(element, "aria-hidden", baseline.ariaHidden);
  restoreAttribute(element, "inert", baseline.inert);
  element.style.pointerEvents = baseline.pointerEvents;
  element.style.opacity = baseline.opacity;
  element.style.transform = baseline.transform;
  element.style.clipPath = baseline.clipPath;
  element.style.outline = baseline.outline;
  element.style.outlineOffset = baseline.outlineOffset;
}

function restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
}

function replaceTargetHandle(
  activeByTargetId: Map<EmbeddedNodeId, ActiveHandle>,
  targetId: EmbeddedNodeId,
  next: ActiveHandle,
): ActiveHandle {
  cancelTargetHandle(activeByTargetId, targetId);
  activeByTargetId.set(targetId, next);
  return next;
}

function cancelTargetHandle(
  activeByTargetId: Map<EmbeddedNodeId, ActiveHandle>,
  targetId: EmbeddedNodeId,
): ActiveHandle | undefined {
  const active = activeByTargetId.get(targetId);
  if (!active) return undefined;
  active.handle.cancel();
  activeByTargetId.delete(targetId);
  return active;
}
