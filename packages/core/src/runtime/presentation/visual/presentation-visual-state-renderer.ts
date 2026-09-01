import {
  PresentationContentLayout,
  type EmbeddedDataId,
  type EmbeddedNodeId,
  type PresentationEasingV1,
} from "@scaffold/contracts";

import type {
  CompiledVisualIntent,
  PresentationFlowSceneState,
  PresentationSequenceSceneState,
  PresentationTargetSceneState,
  PresentationVisualScene,
} from "@/presentation/model";

import {
  createAnimePresentationLayoutAnimation,
  type PresentationLayoutAnimationFactory,
  type PresentationLayoutAnimationHandle,
} from "./anime-visual-animation-driver";
import type {
  PresentationContentLayoutError,
  PresentationContentLayoutPort,
  PresentationContentLayoutRequest,
} from "./presentation-content-layout-port";
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
  readonly contentLayoutError?: PresentationContentLayoutError;
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
  readonly clipPath: string;
  readonly outline: string;
  readonly outlineOffset: string;
}

interface ActiveHandle {
  readonly segmentId: EmbeddedDataId;
  readonly element: HTMLElement;
  readonly handle: VisualAnimationHandle;
}

interface ActiveLayoutHandle {
  readonly key: string;
  readonly root: HTMLElement;
  readonly durationMs: number;
  readonly handle: PresentationLayoutAnimationHandle;
}

export function createPresentationVisualStateRenderer({
  resolver,
  driver,
  contentLayoutPort,
  createLayoutAnimation = createAnimePresentationLayoutAnimation,
}: {
  readonly resolver: VisualTargetResolver;
  readonly driver: VisualAnimationDriver;
  readonly contentLayoutPort?: PresentationContentLayoutPort;
  readonly createLayoutAnimation?: PresentationLayoutAnimationFactory;
}): PresentationVisualStateRenderer {
  const baselines = new Map<HTMLElement, ElementBaseline>();
  const activeByTargetId = new Map<EmbeddedNodeId, ActiveHandle>();
  let surfaceId: EmbeddedNodeId | null = null;
  let activeLayout: ActiveLayoutHandle | null = null;
  let contentLayoutApplied = false;
  let disposed = false;

  function clear(): void {
    if (activeLayout) {
      activeLayout.handle.cancel();
      activeLayout.handle.dispose();
      activeLayout = null;
    }
    if (contentLayoutApplied) {
      contentLayoutPort?.clear();
      contentLayoutApplied = false;
    }
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
      const contentLayoutError = applyContentLayout({
        scene,
        resolver,
        contentLayoutPort,
        createLayoutAnimation,
        getActiveLayout: () => activeLayout,
        setActiveLayout: (next) => {
          activeLayout = next;
        },
        markContentLayoutApplied: () => {
          contentLayoutApplied = true;
        },
        unavailableTargets,
      });

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
        timeMs: scene.timeMs,
        unavailableTargets: Object.freeze(unavailableTargets),
        ...(contentLayoutError ? { contentLayoutError } : {}),
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

function applyContentLayout({
  scene,
  resolver,
  contentLayoutPort,
  createLayoutAnimation,
  getActiveLayout,
  setActiveLayout,
  markContentLayoutApplied,
  unavailableTargets,
}: {
  readonly scene: PresentationVisualScene;
  readonly resolver: VisualTargetResolver;
  readonly contentLayoutPort: PresentationContentLayoutPort | undefined;
  readonly createLayoutAnimation: PresentationLayoutAnimationFactory;
  readonly getActiveLayout: () => ActiveLayoutHandle | null;
  readonly setActiveLayout: (next: ActiveLayoutHandle | null) => void;
  readonly markContentLayoutApplied: () => void;
  readonly unavailableTargets: VisualTargetUnavailable[];
}): PresentationContentLayoutError | undefined {
  const flowStates = scene.flowStates ?? [];
  if (flowStates.length === 0 && scene.sequenceStates.length === 0) return undefined;
  if (!contentLayoutPort) {
    throw new Error("Presentation content-layout state requires its runtime projection port.");
  }

  const currentRequest = createContentLayoutRequest(scene, flowStates, scene.sequenceStates, false);
  const transitions = [
    ...flowStates.flatMap((state) => (state.transition ? [state.transition] : [])),
    ...scene.sequenceStates.flatMap((state) => (state.transition ? [state.transition] : [])),
  ];
  if (transitions.length === 0) {
    settleActiveLayout(getActiveLayout(), setActiveLayout);
    const result = contentLayoutPort.apply(currentRequest);
    if (result.isErr()) return result.error;
    markContentLayoutApplied();
    return undefined;
  }

  const startMs = Math.min(...transitions.map(({ startMs }) => startMs));
  const endMs = Math.max(...transitions.map(({ endMs }) => endMs));
  const durationMs = endMs - startMs;
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new Error("Presentation Layout transition has invalid time bounds.");
  }
  const segmentIds = transitions.flatMap(({ segmentIds }) => segmentIds);
  const key = segmentIds.join("\u0000");
  const rootResolution = resolver.resolve(scene.surfaceId);
  if (rootResolution.kind === "unavailable") {
    settleActiveLayout(getActiveLayout(), setActiveLayout);
    unavailableTargets.push(
      Object.freeze({ targetId: scene.surfaceId, reason: rootResolution.reason }),
    );
    const result = contentLayoutPort.apply(currentRequest);
    if (result.isErr()) return result.error;
    markContentLayoutApplied();
    return undefined;
  }

  const localTimeMs = Math.min(durationMs, Math.max(0, scene.timeMs - startMs));
  const active = getActiveLayout();
  if (active?.key === key && active.root === rootResolution.element) {
    active.handle.apply(localTimeMs);
    return undefined;
  }
  cancelActiveLayout(active, setActiveLayout);

  const previousRequest = createContentLayoutRequest(scene, flowStates, scene.sequenceStates, true);
  const previousResult = contentLayoutPort.apply(previousRequest);
  if (previousResult.isErr()) return previousResult.error;
  markContentLayoutApplied();

  let currentError: PresentationContentLayoutError | undefined;
  const handle = createLayoutAnimation({
    root: rootResolution.element,
    durationMs,
    easing: resolveLayoutEasing(scene, segmentIds),
    applyLayout() {
      const result = contentLayoutPort.apply(currentRequest);
      if (result.isErr()) {
        currentError = result.error;
        return;
      }
      markContentLayoutApplied();
    },
  });
  if (currentError) {
    handle.cancel();
    handle.dispose();
    return currentError;
  }
  const next = Object.freeze({
    key,
    root: rootResolution.element,
    durationMs,
    handle,
  });
  setActiveLayout(next);
  handle.apply(localTimeMs);
  return undefined;
}

function createContentLayoutRequest(
  scene: PresentationVisualScene,
  flowStates: readonly PresentationFlowSceneState[],
  sequenceStates: readonly PresentationSequenceSceneState[],
  previous: boolean,
): PresentationContentLayoutRequest {
  return Object.freeze({
    surfaceId: scene.surfaceId,
    containers: Object.freeze([
      ...flowStates.map((state) =>
        Object.freeze({
          containerId: state.boundaryId,
          contentLayout: PresentationContentLayout.Flow,
          directChildIds: state.directChildIds,
          activeChildId: null,
          withheldChildIds:
            previous && state.transition
              ? state.transition.previousWithheldChildIds
              : state.withheldChildIds,
        }),
      ),
      ...sequenceStates.map((state) =>
        Object.freeze({
          containerId: state.boundaryId,
          contentLayout: PresentationContentLayout.Sequence,
          directChildIds: state.directChildIds,
          activeChildId:
            previous && state.transition
              ? state.transition.previousActiveChildId
              : state.activeChildId,
          withheldChildIds: Object.freeze([]),
        }),
      ),
    ]),
  });
}

function resolveLayoutEasing(
  scene: PresentationVisualScene,
  segmentIds: readonly EmbeddedDataId[],
): string {
  for (const segmentId of segmentIds) {
    for (const state of scene.targetStates.values()) {
      if (state.paint.kind !== "transition" || state.paint.segmentId !== segmentId) continue;
      const visual = state.paint.visual;
      if (
        (visual.kind === "reveal" || visual.kind === "hide") &&
        visual.transition.kind !== "instant"
      ) {
        return resolvePresentationEasing(visual.transition.easing);
      }
    }
  }
  throw new Error("Presentation Layout transition has no active visibility recipe.");
}

function cancelActiveLayout(
  active: ActiveLayoutHandle | null,
  setActiveLayout: (next: ActiveLayoutHandle | null) => void,
): void {
  if (!active) return;
  active.handle.cancel();
  active.handle.dispose();
  setActiveLayout(null);
}

function settleActiveLayout(
  active: ActiveLayoutHandle | null,
  setActiveLayout: (next: ActiveLayoutHandle | null) => void,
): void {
  if (!active) return;
  active.handle.finish();
  active.handle.dispose();
  setActiveLayout(null);
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
    applySettledMove(element, state, baseline);
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
): VisualAnimationInput {
  const { paint } = state;
  switch (paint.visual.kind) {
    case "reveal":
    case "hide":
      return resolveVisibilityAnimationInput(paint.segmentId, paint.visual, element);
    case "emphasize":
      if (paint.visual.effect !== "pulse") {
        throw new Error("Presentation outline emphasis must not create an animation handle.");
      }
      return Object.freeze({
        segmentId: paint.segmentId,
        element,
        durationMs: paint.visual.durationMs,
        easing: resolvePresentationEasing(paint.visual.easing),
        keyframes: freezeKeyframes(
          { offset: 0, transform: Object.freeze({ scale: 1 }) },
          { offset: 0.5, transform: Object.freeze({ scale: 1.06 }) },
          { offset: 1, transform: Object.freeze({ scale: 1 }) },
        ),
      });
    case "move":
      return resolveMoveAnimationInput(state, element);
  }
}

function resolveVisibilityAnimationInput(
  segmentId: EmbeddedDataId,
  visual: Extract<CompiledVisualIntent, { readonly kind: "reveal" | "hide" }>,
  element: HTMLElement,
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
    keyframes: freezeKeyframes(
      { ...keyframes[0], offset: 0 },
      { ...keyframes[1], offset: 1 },
    ),
  });
}

function visibilityKeyframes(
  kind: "fade" | "path-fade" | "slide" | "float" | "scale" | "wipe",
  direction: "up" | "right" | "down" | "left" | undefined,
): readonly [Omit<VisualAnimationInput["keyframes"][number], "offset">, Omit<VisualAnimationInput["keyframes"][number], "offset">] {
  const visible = Object.freeze({ opacity: 1 });
  switch (kind) {
    case "fade":
    case "path-fade":
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

function directionalTransform(
  direction: "up" | "right" | "down" | "left",
  distance: number,
) {
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

function resolveMoveAnimationInput(
  state: PresentationTargetSceneState & {
    readonly paint: Extract<PresentationTargetSceneState["paint"], { kind: "transition" }>;
  },
  element: HTMLElement,
): VisualAnimationInput {
  const paint = state.paint;
  if (paint.visual.kind !== "move") throw new Error("Expected an active Move recipe.");
  const activeIndex = state.moveContributions.findIndex(
    ({ segmentId }) => segmentId === paint.segmentId,
  );
  if (activeIndex < 0) throw new Error("Active Move has no scene contribution.");
  const start = accumulatedMoveOffset(state.moveContributions.slice(0, activeIndex));
  const endpoint = pathEndpoint(paint.visual.pathData);
  return Object.freeze({
    segmentId: paint.segmentId,
    element,
    durationMs: paint.visual.durationMs,
    easing: resolvePresentationEasing(paint.visual.easing),
    keyframes: freezeKeyframes(
      {
        offset: 0,
        transform: Object.freeze({ translateX: start.x, translateY: start.y }),
      },
      {
        offset: 1,
        transform: Object.freeze({
          translateX: start.x + endpoint.x,
          translateY: start.y + endpoint.y,
        }),
      },
    ),
  });
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

function accumulatedMoveOffset(
  contributions: readonly PresentationTargetSceneState["moveContributions"][number][],
): { readonly x: number; readonly y: number } {
  let x = 0;
  let y = 0;
  for (const contribution of contributions) {
    const endpoint = pathEndpoint(contribution.visual.pathData);
    x += endpoint.x * contribution.progress;
    y += endpoint.y * contribution.progress;
  }
  return { x, y };
}

function pathEndpoint(pathData: string): { readonly x: number; readonly y: number } {
  const values = pathData.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  if (values.length < 2 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Presentation Move path has no finite endpoint.");
  }
  return { x: values.at(-2)!, y: values.at(-1)! };
}

function applySettledMove(
  element: HTMLElement,
  state: PresentationTargetSceneState,
  baseline: ElementBaseline,
): void {
  if (state.moveContributions.length === 0) {
    element.style.transform = baseline.transform;
    return;
  }
  const offset = accumulatedMoveOffset(state.moveContributions);
  element.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
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
      clipPath: element.style.clipPath,
      outline: element.style.outline,
      outlineOffset: element.style.outlineOffset,
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
): void {
  const active = activeByTargetId.get(targetId);
  if (!active) return;
  active.handle.cancel();
  activeByTargetId.delete(targetId);
}
