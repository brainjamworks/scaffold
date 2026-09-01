import type {
  EmbeddedDataId,
  EmbeddedNodeId,
  PresentationEasingV1,
} from "@scaffold/contracts";

import type {
  PresentationTargetSceneState,
  PresentationVisualScene,
} from "@/presentation/model";

import type {
  VisualAnimationDriver,
  VisualAnimationHandle,
  VisualAnimationInput,
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
}

interface ActiveHandle {
  readonly segmentId: EmbeddedDataId;
  readonly element: HTMLElement;
  readonly handle: VisualAnimationHandle;
}

export function createPresentationVisualStateRenderer({
  resolver,
  driver,
}: {
  readonly resolver: VisualTargetResolver;
  readonly driver: VisualAnimationDriver;
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
      const unavailableTargets: VisualTargetUnavailable[] = [];
      const appliedTargetIds = new Set<EmbeddedNodeId>();

      for (const state of scene.targetStates.values()) {
        appliedTargetIds.add(state.targetId);
        const resolution = resolver.resolve(state.targetId);
        if (resolution.kind === "unavailable") {
          cancelTargetHandle(activeByTargetId, state.targetId);
          unavailableTargets.push(
            Object.freeze({ targetId: state.targetId, reason: resolution.reason }),
          );
          continue;
        }

        const element = resolution.element;
        rememberBaseline(baselines, element);
        applyAvailability(element, state, baselines.get(element)!);
        applyPaint({ state, element, driver, activeByTargetId });
      }

      for (const targetId of activeByTargetId.keys()) {
        if (!appliedTargetIds.has(targetId)) cancelTargetHandle(activeByTargetId, targetId);
      }

      return Object.freeze({
        surfaceId: scene.surfaceId,
        timeMs: scene.timeMs,
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
    if (activeElement instanceof HTMLElement && element.contains(activeElement)) activeElement.blur();
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
  driver,
  activeByTargetId,
}: {
  readonly state: PresentationTargetSceneState;
  readonly element: HTMLElement;
  readonly driver: VisualAnimationDriver;
  readonly activeByTargetId: Map<EmbeddedNodeId, ActiveHandle>;
}): void {
  if (state.paint.kind === "none") {
    cancelTargetHandle(activeByTargetId, state.targetId);
    element.style.opacity = "0";
    return;
  }
  if (state.paint.kind === "settled") {
    cancelTargetHandle(activeByTargetId, state.targetId);
    element.style.opacity = "1";
    return;
  }

  const input = resolveRevealAnimationInput(state, element);
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

function resolveRevealAnimationInput(
  state: PresentationTargetSceneState & {
    readonly paint: Extract<PresentationTargetSceneState["paint"], { kind: "transition" }>;
  },
  element: HTMLElement,
): VisualAnimationInput {
  const { paint } = state;
  if (paint.visual.kind !== "reveal" || paint.visual.transition.kind !== "fade") {
    throw new Error("Phase 1 visual renderer received an unsupported transition recipe.");
  }
  return Object.freeze({
    segmentId: paint.segmentId,
    element,
    durationMs: paint.visual.transition.durationMs,
    easing: resolvePresentationEasing(paint.visual.transition.easing),
    keyframes: Object.freeze([
      Object.freeze({ offset: 0, opacity: 0 }),
      Object.freeze({ offset: 1, opacity: 1 }),
    ]) as readonly [
      { readonly offset: 0; readonly opacity: 0 },
      { readonly offset: 1; readonly opacity: 1 },
    ],
  });
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
    }),
  );
}

function restoreElement(element: HTMLElement, baseline: ElementBaseline): void {
  restoreAttribute(
    element,
    PRESENTATION_AVAILABILITY_ATTRIBUTE,
    baseline.presentationAvailability,
  );
  restoreAttribute(element, "aria-hidden", baseline.ariaHidden);
  restoreAttribute(element, "inert", baseline.inert);
  element.style.pointerEvents = baseline.pointerEvents;
  element.style.opacity = baseline.opacity;
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
): void {
  const active = activeByTargetId.get(targetId);
  if (!active) return;
  active.handle.cancel();
  activeByTargetId.delete(targetId);
}
