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

interface ActiveLayoutHandle {
  readonly segmentId: EmbeddedDataId;
  readonly root: HTMLElement;
  readonly durationMs: number;
  readonly handle: PresentationLayoutAnimationHandle;
}

type ActiveLayoutTransition =
  | {
      readonly kind: "flow";
      readonly state: PresentationFlowSceneState;
      readonly transition: NonNullable<PresentationFlowSceneState["transition"]>;
    }
  | {
      readonly kind: "sequence";
      readonly state: PresentationSequenceSceneState;
      readonly transition: NonNullable<PresentationSequenceSceneState["transition"]>;
    };

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
  let activeLayout: ActiveLayoutHandle | null = null;
  let surfaceId: EmbeddedNodeId | null = null;
  let contentLayoutApplied = false;
  let disposed = false;

  function clear(): void {
    cancelActiveLayout(activeLayout, (next) => {
      activeLayout = next;
    });
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

  const currentRequest = createContentLayoutRequest(scene, flowStates, scene.sequenceStates);
  const activeTransition = collectActiveLayoutTransition(flowStates, scene.sequenceStates);
  if (!activeTransition) {
    settleActiveLayout(getActiveLayout(), setActiveLayout);
    const result = contentLayoutPort.apply(currentRequest);
    if (result.isErr()) return result.error;
    markContentLayoutApplied();
    return undefined;
  }

  const { transition } = activeTransition;
  const durationMs = transition.endMs - transition.startMs;
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new Error("Presentation Layout transition has invalid time bounds.");
  }
  const rootResolution = resolver.resolve(scene.surfaceId);
  if (rootResolution.kind === "unavailable") {
    cancelActiveLayout(getActiveLayout(), setActiveLayout);
    unavailableTargets.push(
      Object.freeze({ targetId: scene.surfaceId, reason: rootResolution.reason }),
    );
    const result = contentLayoutPort.apply(currentRequest);
    if (result.isErr()) return result.error;
    markContentLayoutApplied();
    return undefined;
  }

  const localTimeMs = Math.min(durationMs, Math.max(0, scene.timeMs - transition.startMs));
  const active = getActiveLayout();
  if (
    active?.segmentId === transition.segmentId &&
    active.root === rootResolution.element &&
    active.durationMs === durationMs
  ) {
    active.handle.apply(localTimeMs);
    return undefined;
  }
  cancelActiveLayout(active, setActiveLayout);

  const previousResult = contentLayoutPort.apply(
    createContentLayoutRequest(
      scene,
      flowStates,
      scene.sequenceStates,
      activeTransition,
      "previous",
    ),
  );
  if (previousResult.isErr()) return previousResult.error;
  markContentLayoutApplied();

  let nextError: PresentationContentLayoutError | undefined;
  const handle = createLayoutAnimation({
    root: rootResolution.element,
    durationMs,
    easing: resolveLayoutEasing(transition),
    applyLayout() {
      const result = contentLayoutPort.apply(
        createContentLayoutRequest(
          scene,
          flowStates,
          scene.sequenceStates,
          activeTransition,
          "next",
        ),
      );
      if (result.isErr()) {
        nextError = result.error;
        return;
      }
      markContentLayoutApplied();
    },
  });
  if (nextError) {
    handle.cancel();
    handle.dispose();
    return nextError;
  }
  setActiveLayout(
    Object.freeze({
      segmentId: transition.segmentId,
      root: rootResolution.element,
      durationMs,
      handle,
    }),
  );
  handle.apply(localTimeMs);
  return undefined;
}

function collectActiveLayoutTransition(
  flowStates: readonly PresentationFlowSceneState[],
  sequenceStates: readonly PresentationSequenceSceneState[],
): ActiveLayoutTransition | undefined {
  const active = [
    ...flowStates.flatMap((state) =>
      state.transition ? [{ kind: "flow" as const, state, transition: state.transition }] : [],
    ),
    ...sequenceStates.flatMap((state) =>
      state.transition ? [{ kind: "sequence" as const, state, transition: state.transition }] : [],
    ),
  ];
  if (active.length > 1) {
    throw new Error("Presentation Surface has overlapping active Layout transitions.");
  }
  return active[0];
}

function createContentLayoutRequest(
  scene: PresentationVisualScene,
  flowStates: readonly PresentationFlowSceneState[],
  sequenceStates: readonly PresentationSequenceSceneState[],
  override?: ActiveLayoutTransition,
  phase: "previous" | "next" = "next",
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
          withheldChildIds: resolveFlowWithheldChildIds(state, override, phase),
        }),
      ),
      ...sequenceStates.map((state) =>
        Object.freeze({
          containerId: state.boundaryId,
          contentLayout: PresentationContentLayout.Sequence,
          directChildIds: state.directChildIds,
          activeChildId: resolveSequenceActiveChildId(state, override, phase),
          withheldChildIds: Object.freeze([]),
        }),
      ),
    ]),
  });
}

function resolveFlowWithheldChildIds(
  state: PresentationFlowSceneState,
  override: ActiveLayoutTransition | undefined,
  phase: "previous" | "next",
): readonly EmbeddedNodeId[] {
  if (override?.kind !== "flow" || override.state !== state) return state.withheldChildIds;
  return phase === "previous"
    ? override.transition.previousWithheldChildIds
    : override.transition.nextWithheldChildIds;
}

function resolveSequenceActiveChildId(
  state: PresentationSequenceSceneState,
  override: ActiveLayoutTransition | undefined,
  phase: "previous" | "next",
): EmbeddedNodeId | null {
  if (override?.kind !== "sequence" || override.state !== state) return state.activeChildId;
  return phase === "previous"
    ? override.transition.previousActiveChildId
    : override.transition.nextActiveChildId;
}

function resolveLayoutEasing(
  transition:
    | NonNullable<PresentationFlowSceneState["transition"]>
    | NonNullable<PresentationSequenceSceneState["transition"]>,
): string {
  if (transition.visual.transition.kind === "instant") {
    throw new Error("Presentation Layout transition cannot use an instant visibility recipe.");
  }
  return resolvePresentationEasing(transition.visual.transition.easing);
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
    case "move":
      return resolveMoveAnimationInput(state, element, baseline);
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
  kind: "fade" | "path-fade" | "slide" | "float" | "scale" | "wipe",
  direction: "up" | "right" | "down" | "left" | undefined,
): readonly [
  Omit<VisualAnimationInput["keyframes"][number], "offset">,
  Omit<VisualAnimationInput["keyframes"][number], "offset">,
] {
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

function resolveMoveAnimationInput(
  state: PresentationTargetSceneState & {
    readonly paint: Extract<PresentationTargetSceneState["paint"], { kind: "transition" }>;
  },
  element: HTMLElement,
  baseline: ElementBaseline,
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
    ...(baseline.authoredTransform ? { baseTransform: baseline.authoredTransform } : {}),
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
  element.style.transform = composeTransforms(
    baseline.authoredTransform,
    `translate(${offset.x}px, ${offset.y}px)`,
  );
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

function composeTransforms(...transforms: readonly string[]): string {
  return transforms.filter(Boolean).join(" ");
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
): void {
  const active = activeByTargetId.get(targetId);
  if (!active) return;
  active.handle.cancel();
  activeByTargetId.delete(targetId);
}
