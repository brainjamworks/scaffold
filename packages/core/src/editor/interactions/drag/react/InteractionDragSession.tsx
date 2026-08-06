import {
  CollisionPriority,
  CollisionType,
  Plugin,
  configure,
  type CollisionDetector,
} from "@dnd-kit/abstract";
import {
  RestrictToHorizontalAxis,
  RestrictToVerticalAxis,
} from "@dnd-kit/abstract/modifiers";
import { closestCenter, pointerIntersection } from "@dnd-kit/collision";
import {
  Accessibility,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from "@dnd-kit/dom";
import {
  DragDropProvider,
  DragOverlay,
  type CollisionEvent,
  type DragDropManager,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UseDroppableInput,
} from "@dnd-kit/react";
import { isSortable } from "@dnd-kit/react/sortable";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  createClientDelta,
  createClientPoint,
  createClientRectSnapshot,
  type ClientDelta,
  type ClientPoint,
  type ClientRectSnapshot,
  type CoordinateSpaceSnapshot,
} from "../model/coordinate-space";
import type {
  DragAccessibilityLabels,
  DragAccessibilityMode,
  DragCancellationReason,
  DragInputKind,
  DragInputProfile,
  InteractionCollisionPolicy,
  InteractionDragEntity,
  InteractionDragEvent,
} from "../model/interaction-drag-event";
import {
  useInteractionDragEnvironmentResolution,
  type ReadyInteractionDragEnvironment,
} from "./interaction-drag-environment";

import "./interaction-drag.css";

const INTERACTION_DRAG_REGISTRATION_DATA = "__scaffoldInteractionDragRegistration";

export interface InteractionDragRegistrationData {
  readonly activeData?: unknown;
  readonly label?: string;
  readonly overData?: unknown;
  readonly source: boolean;
  readonly target: boolean;
}

export function createInteractionDragData(
  registration: InteractionDragRegistrationData,
): Record<string, unknown> {
  return { [INTERACTION_DRAG_REGISTRATION_DATA]: registration };
}

export interface InteractionCollisionCandidate<OverData> {
  readonly id: string;
  readonly data: OverData;
  readonly clientRect: ClientRectSnapshot;
}

export interface InteractionFeatureCollisionInput<ActiveData, OverData> {
  readonly active: Readonly<InteractionDragEntity<ActiveData>>;
  readonly clientPoint: ClientPoint | null;
  readonly candidates: readonly InteractionCollisionCandidate<OverData>[];
}

export interface InteractionDragSessionProps<ActiveData, OverData> {
  readonly accessibilityMode: DragAccessibilityMode;
  readonly children: ReactNode;
  readonly collisionPolicy: InteractionCollisionPolicy;
  readonly labels: DragAccessibilityLabels;
  readonly onCancel?: (reason: DragCancellationReason) => void;
  readonly onEnd: (event: InteractionDragEvent<ActiveData, OverData>) => void;
  readonly onMove?: (event: InteractionDragEvent<ActiveData, OverData>) => void;
  readonly onStart?: (event: InteractionDragEvent<ActiveData, OverData>) => void;
  readonly profile: DragInputProfile;
  readonly renderPreview: (active: ActiveData) => ReactNode;
  readonly resolveCollision?: (
    input: InteractionFeatureCollisionInput<ActiveData, OverData>,
  ) => string | null;
  readonly sessionId: string;
}

export interface InteractionDragSessionContextValue {
  readonly accessibilityMode: DragAccessibilityMode;
  readonly collisionDetector: NonNullable<UseDroppableInput["collisionDetector"]>;
  readonly enabled: boolean;
  readonly reducedMotion: boolean;
  readonly sourceRemoved: (id: string) => void;
}

const InteractionDragSessionContext = createContext<InteractionDragSessionContextValue | null>(
  null,
);

export function useInteractionDragSession(): InteractionDragSessionContextValue {
  const context = useContext(InteractionDragSessionContext);
  if (!context)
    throw new Error("Drag registrations must be rendered inside InteractionDragSession.");
  return context;
}

interface ActiveSession<ActiveData, OverData> {
  readonly active: Readonly<InteractionDragEntity<ActiveData>>;
  collisionBoundaryRect: ClientRectSnapshot;
  readonly environment: ReadyInteractionDragEnvironment;
  readonly focusTarget: HTMLElement | null;
  readonly input: DragInputKind;
  latestMove: {
    clientDelta: ClientDelta | null;
    clientPoint: ClientPoint | null;
    over: Readonly<InteractionDragEntity<OverData>> | null;
  } | null;
  readonly manager: DragDropManager;
  snapshot: CoordinateSpaceSnapshot;
  stopCoordinateSubscription: (() => void) | null;
  stopLifecycleListeners: (() => void) | null;
}

const configuredPointerSensor = PointerSensor.configure({
  activationConstraints: () => [new PointerActivationConstraints.Distance({ value: 4 })],
});

export function InteractionDragSession<ActiveData, OverData>({
  accessibilityMode,
  children,
  collisionPolicy,
  labels,
  onCancel,
  onEnd,
  onMove,
  onStart,
  profile,
  renderPreview,
  resolveCollision,
  sessionId,
}: InteractionDragSessionProps<ActiveData, OverData>) {
  const environmentResolution = useInteractionDragEnvironmentResolution();
  const environment =
    environmentResolution.status === "ready" ? environmentResolution.environment : null;
  const activeSessionRef = useRef<ActiveSession<ActiveData, OverData> | null>(null);
  const pendingCancellationReasonRef = useRef<DragCancellationReason | null>(null);
  const callbacksRef = useRef({ onCancel, onEnd, onMove, onStart });
  callbacksRef.current = { onCancel, onEnd, onMove, onStart };
  const reducedMotion = useReducedMotion(environment?.ownerWindow ?? null);

  const releaseActiveSession = useCallback(() => {
    const activeSession = activeSessionRef.current;
    if (!activeSession) return null;
    activeSessionRef.current = null;
    activeSession.stopCoordinateSubscription?.();
    activeSession.stopCoordinateSubscription = null;
    activeSession.stopLifecycleListeners?.();
    activeSession.stopLifecycleListeners = null;
    restoreFocus(activeSession.focusTarget);
    return activeSession;
  }, []);

  const finishCancellation = useCallback(
    (reason: DragCancellationReason) => {
      pendingCancellationReasonRef.current = null;
      if (!releaseActiveSession()) return;
      callbacksRef.current.onCancel?.(reason);
    },
    [releaseActiveSession],
  );

  const cancelActiveSession = useCallback(
    (reason: DragCancellationReason) => {
      const activeSession = activeSessionRef.current;
      if (!activeSession) return;
      pendingCancellationReasonRef.current = reason;
      activeSession.manager.actions.stop({ canceled: true });
      if (activeSessionRef.current === activeSession) finishCancellation(reason);
    },
    [finishCancellation],
  );

  useEffect(() => {
    const activeSession = activeSessionRef.current;
    if (activeSession && activeSession.environment !== environment) {
      cancelActiveSession("environment-lost");
    }
  }, [cancelActiveSession, environment]);

  useEffect(
    () => () => {
      const activeSession = activeSessionRef.current;
      if (!activeSession) return;
      activeSessionRef.current = null;
      activeSession.stopCoordinateSubscription?.();
      activeSession.stopLifecycleListeners?.();
      callbacksRef.current.onCancel?.("unmount");
      restoreFocus(activeSession.focusTarget);
    },
    [],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent, manager: DragDropManager) => {
      if (activeSessionRef.current) return;
      if (!environment || !environmentElementsAreLive(environment)) {
        manager.actions.stop({ canceled: true });
        return;
      }
      const source = event.operation.source;
      const registration = registrationFromData(source?.data);
      if (!source || !registration?.source) {
        manager.actions.stop({ canceled: true });
        return;
      }
      const measuredSnapshot = environment.coordinateSpace.measure();
      const collisionBoundaryRect = measureCollisionBoundary(environment);
      if (!measuredSnapshot || !collisionBoundaryRect || !positiveSourceSize(source.element)) {
        manager.actions.stop({ canceled: true });
        return;
      }
      const input = inputKindFromActivator(event.operation.activatorEvent, environment.ownerWindow);
      const active = entityFromSource<ActiveData>(source);
      if (!active) {
        manager.actions.stop({ canceled: true });
        return;
      }
      const clientPoint =
        input === "pointer" ? clientPointFromCoordinates(event.operation.position.current) : null;
      const activeSession: ActiveSession<ActiveData, OverData> = {
        active,
        collisionBoundaryRect,
        environment,
        focusTarget: focusedHTMLElement(environment.ownerDocument),
        input,
        latestMove:
          input === "pointer"
            ? { clientDelta: createClientDelta(0, 0), clientPoint, over: null }
            : null,
        manager,
        snapshot: measuredSnapshot,
        stopCoordinateSubscription: null,
        stopLifecycleListeners: null,
      };
      activeSessionRef.current = activeSession;

      const handleBlur = () => cancelActiveSession("owner-window-blur");
      environment.ownerWindow.addEventListener("blur", handleBlur);
      activeSession.stopLifecycleListeners = () =>
        environment.ownerWindow.removeEventListener("blur", handleBlur);

      activeSession.stopCoordinateSubscription = environment.coordinateSpace.subscribe(() => {
        if (activeSessionRef.current !== activeSession) return;
        if (!environmentElementsAreLive(environment)) {
          cancelActiveSession("environment-lost");
          return;
        }
        const nextCollisionBoundaryRect = measureCollisionBoundary(environment);
        const nextSnapshot = environment.coordinateSpace.measure();
        if (!nextCollisionBoundaryRect || !nextSnapshot) {
          cancelActiveSession("environment-lost");
          return;
        }
        activeSession.collisionBoundaryRect = nextCollisionBoundaryRect;
        activeSession.snapshot = nextSnapshot;
        if (!activeSession.latestMove) return;
        callbacksRef.current.onMove?.(
          normalizedEvent(
            activeSession.active,
            activeSession.latestMove.over,
            activeSession.input,
            activeSession.latestMove.clientPoint,
            activeSession.latestMove.clientDelta,
            nextSnapshot,
          ),
        );
      });

      callbacksRef.current.onStart?.(
        normalizedEvent(
          active,
          null,
          input,
          clientPoint,
          input === "pointer" ? createClientDelta(0, 0) : null,
          measuredSnapshot,
        ),
      );
    },
    [cancelActiveSession, environment],
  );

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const activeSession = activeSessionRef.current;
      if (!activeSession) return;
      if (!environmentElementsAreLive(activeSession.environment)) {
        cancelActiveSession("environment-lost");
        return;
      }
      const over = entityFromTarget<OverData>(event.operation.target);
      if (activeSession.input === "keyboard") {
        callbacksRef.current.onMove?.(
          normalizedEvent(
            activeSession.active,
            over,
            "keyboard",
            null,
            null,
            activeSession.snapshot,
          ),
        );
        return;
      }
      const coordinates = moveCoordinates(event);
      const clientPoint = clientPointFromCoordinates(coordinates);
      const clientDelta = createClientDelta(
        coordinates.x - event.operation.position.initial.x,
        coordinates.y - event.operation.position.initial.y,
      );
      if (!clientPoint || !clientDelta) return;
      activeSession.latestMove = { clientDelta, clientPoint, over };
      callbacksRef.current.onMove?.(
        normalizedEvent(
          activeSession.active,
          over,
          "pointer",
          clientPoint,
          clientDelta,
          activeSession.snapshot,
        ),
      );
    },
    [cancelActiveSession],
  );

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const activeSession = activeSessionRef.current;
    if (!activeSession) return;
    const over = entityFromTarget<OverData>(event.operation.target);
    if (activeSession.input === "keyboard") {
      callbacksRef.current.onMove?.(
        normalizedEvent(
          activeSession.active,
          over,
          "keyboard",
          null,
          null,
          activeSession.snapshot,
        ),
      );
      return;
    }
    if (!activeSession.latestMove) return;
    activeSession.latestMove = { ...activeSession.latestMove, over };
    callbacksRef.current.onMove?.(
      normalizedEvent(
        activeSession.active,
        over,
        "pointer",
        activeSession.latestMove.clientPoint,
        activeSession.latestMove.clientDelta,
        activeSession.snapshot,
      ),
    );
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeSession = activeSessionRef.current;
      if (!activeSession) return;
      if (event.canceled) {
        finishCancellation(
          pendingCancellationReasonRef.current ?? cancellationReasonFromEvent(event.nativeEvent),
        );
        return;
      }
      if (!environmentElementsAreLive(activeSession.environment)) {
        finishCancellation("environment-lost");
        return;
      }
      const active = entityFromSource<ActiveData>(event.operation.source) ?? activeSession.active;
      const over = entityFromTarget<OverData>(event.operation.target);
      if (!over) {
        finishCancellation("invalid-drop");
        return;
      }
      const clientPoint =
        activeSession.input === "pointer"
          ? clientPointFromCoordinates(event.operation.position.current)
          : null;
      const clientDelta =
        activeSession.input === "pointer"
          ? createClientDelta(event.operation.position.delta.x, event.operation.position.delta.y)
          : null;
      const normalized = normalizedEvent(
        active,
        over,
        activeSession.input,
        clientPoint,
        clientDelta,
        activeSession.snapshot,
      );
      pendingCancellationReasonRef.current = null;
      releaseActiveSession();
      callbacksRef.current.onEnd(normalized);
    },
    [finishCancellation, releaseActiveSession],
  );

  const sourceRemoved = useCallback(
    (id: string) => {
      if (activeSessionRef.current?.active.id === id) cancelActiveSession("source-removed");
    },
    [cancelActiveSession],
  );
  const collisionDetector = useInteractionCollisionDetector(collisionPolicy, activeSessionRef);
  const handleCollision = useFeatureCollision(
    collisionPolicy,
    resolveCollision,
    activeSessionRef,
  );
  const context = useMemo<InteractionDragSessionContextValue>(
    () => ({
      accessibilityMode,
      collisionDetector,
      enabled: environment !== null,
      reducedMotion,
      sourceRemoved,
    }),
    [accessibilityMode, collisionDetector, environment, reducedMotion, sourceRemoved],
  );
  const sensors = useInteractionSensors(profile, accessibilityMode);
  const modifiers = useInteractionModifiers(profile);
  const accessibilityContainer =
    environment?.overlayHost ?? (typeof document === "undefined" ? null : document.body);
  const plugins = useInteractionPlugins(accessibilityMode, accessibilityContainer, labels, sessionId);

  return (
    <DragDropProvider
      modifiers={modifiers}
      plugins={plugins}
      sensors={sensors}
      onCollision={handleCollision}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragStart={handleDragStart}
    >
      <InteractionDragSessionContext value={context}>{children}</InteractionDragSessionContext>
      {environment
        ? createPortal(
            <DragOverlay
              dropAnimation={
                reducedMotion || !supportsWebAnimations(environment.ownerWindow)
                  ? null
                  : { duration: 160, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
              }
            >
              {(source) => {
                const registration = registrationFromData(source.data);
                const sourceSize = positiveSourceSize(source.element);
                if (!registration?.source || !sourceSize) return null;
                return (
                  <InteractionDragPreview height={sourceSize.height} width={sourceSize.width}>
                    {renderPreview(registration.activeData as ActiveData)}
                  </InteractionDragPreview>
                );
              }}
            </DragOverlay>,
            environment.overlayHost,
          )
        : null}
    </DragDropProvider>
  );
}

function InteractionDragPreview({
  children,
  height,
  width,
}: {
  children: ReactNode;
  height: number;
  width: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const preview = ref.current;
    if (!preview) return;
    for (const element of preview.querySelectorAll<HTMLElement>(
      "button, input, select, textarea, a[href], [tabindex]",
    )) {
      element.tabIndex = -1;
    }
  }, [children]);
  return (
    <div
      ref={ref}
      aria-hidden
      inert
      data-interaction-drag-overlay=""
      data-interaction-drag-position-strategy="fixed"
      className="sc-interaction-drag-overlay"
      style={{ height, width }}
    >
      {children}
    </div>
  );
}

function useInteractionSensors(profile: DragInputProfile, mode: DragAccessibilityMode) {
  return useMemo(
    () =>
      mode !== "selection-alternative" &&
      (profile === "sortable-vertical" || profile === "sortable-horizontal")
        ? [configuredPointerSensor, KeyboardSensor]
        : [configuredPointerSensor],
    [mode, profile],
  );
}

function useInteractionModifiers(profile: DragInputProfile) {
  return useMemo(() => {
    if (profile === "sortable-vertical") return [RestrictToVerticalAxis];
    if (profile === "sortable-horizontal") return [RestrictToHorizontalAxis];
    return [];
  }, [profile]);
}

function useInteractionCollisionDetector<ActiveData, OverData>(
  policy: InteractionCollisionPolicy,
  activeSessionRef: RefObject<ActiveSession<ActiveData, OverData> | null>,
): CollisionDetector {
  return useCallback<CollisionDetector>(
    (input) => {
      const activeSession = activeSessionRef.current;
      const rect = input.droppable.shape?.boundingRectangle;
      if (!activeSession || !rect || !rectsIntersect(rect, activeSession.collisionBoundaryRect)) {
        return null;
      }
      if (policy === "pointer") return pointerIntersection(input);
      if (policy === "closest-center") return closestCenter(input);
      return {
        id: input.droppable.id,
        priority: CollisionPriority.Normal,
        type: CollisionType.Collision,
        value: 1,
      };
    },
    [activeSessionRef, policy],
  );
}

function useFeatureCollision<ActiveData, OverData>(
  policy: InteractionCollisionPolicy,
  resolveCollision: InteractionDragSessionProps<ActiveData, OverData>["resolveCollision"],
  activeSessionRef: RefObject<ActiveSession<ActiveData, OverData> | null>,
): NonNullable<ComponentProps<typeof DragDropProvider>["onCollision"]> {
  return useCallback(
    (event: CollisionEvent, manager: DragDropManager) => {
      if (policy !== "feature-resolver") return;
      event.preventDefault();
      const activeSession = activeSessionRef.current;
      if (!activeSession || !resolveCollision) {
        void manager.actions.setDropTarget(null);
        return;
      }
      const candidates = event.collisions.flatMap((collision) => {
        const droppable = manager.registry.droppables.get(collision.id);
        const registration = registrationFromData(droppable?.data);
        const rect = droppable?.shape?.boundingRectangle;
        if (!registration?.target || !rect) return [];
        const clientRect = createClientRectSnapshot(rect.left, rect.top, rect.width, rect.height);
        if (!clientRect) return [];
        return [
          Object.freeze({
            id: String(collision.id),
            data: registration.overData as OverData,
            clientRect,
          }),
        ];
      });
      const resolvedId = resolveCollision({
        active: activeSession.active,
        clientPoint:
          activeSession.input === "pointer"
            ? clientPointFromCoordinates(manager.dragOperation.position.current)
            : null,
        candidates,
      });
      if (String(manager.dragOperation.target?.id ?? "") !== String(resolvedId ?? "")) {
        void manager.actions.setDropTarget(resolvedId);
      }
    },
    [activeSessionRef, policy, resolveCollision],
  );
}

function useInteractionPlugins(
  mode: DragAccessibilityMode,
  container: HTMLElement | null,
  labels: DragAccessibilityLabels,
  sessionId: string,
): NonNullable<ComponentProps<typeof DragDropProvider>["plugins"]> {
  return useMemo(
    () => (defaults) => {
      const withoutDefaultAccessibility = defaults.filter(
        (entry) => pluginConstructor(entry) !== Accessibility,
      );
      if (mode === "selection-alternative") return withoutDefaultAccessibility;
      const accessibility = configure(InteractionDragAccessibility, {
        container,
        labels,
        sessionId,
      });
      return [...withoutDefaultAccessibility, accessibility];
    },
    [container, labels, mode, sessionId],
  );
}

function pluginConstructor(entry: unknown): unknown {
  if (typeof entry === "function") return entry;
  if (entry && typeof entry === "object" && "plugin" in entry) return entry.plugin;
  return null;
}

interface InteractionDragAccessibilityOptions {
  readonly container?: HTMLElement | null;
  readonly labels?: DragAccessibilityLabels;
  readonly sessionId?: string;
}

class InteractionDragAccessibility extends Plugin<
  DragDropManager,
  InteractionDragAccessibilityOptions
> {
  private readonly description: HTMLElement | null;
  private readonly liveRegion: HTMLElement | null;
  private announcementFrame: number | null = null;

  constructor(manager: DragDropManager, options?: InteractionDragAccessibilityOptions) {
    super(manager, options);
    const ownerDocument = options?.container?.ownerDocument ?? null;
    this.description = ownerDocument?.createElement("div") ?? null;
    this.liveRegion = ownerDocument?.createElement("div") ?? null;
    if (
      this.description &&
      this.liveRegion &&
      options?.container &&
      options.labels &&
      options.sessionId
    ) {
      this.description.id = `scaffold-dnd-description-${options.sessionId}`;
      this.description.hidden = true;
      this.description.textContent = options.labels.instructions ?? options.labels.draggable;
      this.liveRegion.id = `scaffold-dnd-announcement-${options.sessionId}`;
      this.liveRegion.setAttribute("role", "status");
      this.liveRegion.setAttribute("aria-live", "polite");
      this.liveRegion.setAttribute("aria-atomic", "true");
      visuallyHide(this.liveRegion);
      options.container.append(this.description, this.liveRegion);
    }

    this.registerEffect(() => {
      const cleanups: Array<() => void> = [];
      for (const draggable of manager.registry.draggables.value) {
        const handle = draggable.handle ?? draggable.element;
        if (!handle) continue;
        if (!draggable.disabled) {
          if (!isNaturallyFocusable(handle) && !handle.hasAttribute("tabindex")) {
            cleanups.push(setManagedAttribute(handle, "tabindex", "0"));
          }
          if (handle.tagName.toLowerCase() !== "button" && !handle.hasAttribute("role")) {
            cleanups.push(setManagedAttribute(handle, "role", "button"));
          }
          if (!handle.hasAttribute("aria-roledescription")) {
            cleanups.push(setManagedAttribute(handle, "aria-roledescription", "draggable"));
          }
          if (this.description && !handle.hasAttribute("aria-describedby")) {
            cleanups.push(setManagedAttribute(handle, "aria-describedby", this.description.id));
          }
          if (!handle.hasAttribute("aria-pressed")) {
            cleanups.push(
              setManagedAttribute(handle, "aria-pressed", String(draggable.isDragging)),
            );
          }
          if (!handle.hasAttribute("aria-grabbed")) {
            cleanups.push(
              setManagedAttribute(handle, "aria-grabbed", String(draggable.isDragging)),
            );
          }
        }
        if (!handle.hasAttribute("aria-disabled")) {
          cleanups.push(setManagedAttribute(handle, "aria-disabled", String(draggable.disabled)));
        }
      }
      return () => cleanups.reverse().forEach((cleanup) => cleanup());
    });

    const listeners = [
      manager.monitor.addEventListener("dragstart", (event) => {
        const source = event.operation.source;
        if (!source) return;
        this.announce(
          this.options?.labels?.pickedUp ?? `Picked up ${labelFor(source.data)}.`,
        );
      }),
      manager.monitor.addEventListener("dragmove", (event) => {
        const { source, target } = event.operation;
        if (!source) return;
        this.announce(this.options?.labels?.moved ?? movementAnnouncement(source, target));
      }),
      manager.monitor.addEventListener("dragover", (event) => {
        const { source, target } = event.operation;
        if (!source) return;
        this.announce(this.options?.labels?.moved ?? movementAnnouncement(source, target));
      }),
      manager.monitor.addEventListener("dragend", (event) => {
        const { source, target } = event.operation;
        if (!source) return;
        if (event.canceled) {
          this.announce(
            this.options?.labels?.cancelled ?? `Cancelled moving ${labelFor(source.data)}.`,
          );
          return;
        }
        this.announce(this.options?.labels?.dropped ?? dropAnnouncement(source, target));
      }),
    ];

    const destroy = this.destroy.bind(this);
    this.destroy = () => {
      destroy();
      listeners.forEach((remove) => remove());
      const ownerWindow = this.liveRegion?.ownerDocument.defaultView;
      if (ownerWindow && this.announcementFrame !== null) {
        ownerWindow.cancelAnimationFrame(this.announcementFrame);
      }
      this.description?.remove();
      this.liveRegion?.remove();
    };
  }

  override configure(options?: InteractionDragAccessibilityOptions): void {
    super.configure(options);
    if (!options) return;
    if (this.description && options.labels) {
      this.description.textContent = options.labels.instructions ?? options.labels.draggable;
    }
    if (this.description && this.liveRegion && options.container) {
      options.container.append(this.description, this.liveRegion);
    }
  }

  private announce(message: string | undefined): void {
    if (!message || !this.liveRegion) return;
    const ownerWindow = this.liveRegion.ownerDocument.defaultView;
    if (!ownerWindow) return;
    if (this.announcementFrame !== null) ownerWindow.cancelAnimationFrame(this.announcementFrame);
    this.liveRegion.textContent = "";
    this.announcementFrame = ownerWindow.requestAnimationFrame(() => {
      this.announcementFrame = null;
      if (this.liveRegion) this.liveRegion.textContent = message;
    });
  }
}

function visuallyHide(element: HTMLElement): void {
  element.style.position = "fixed";
  element.style.width = "1px";
  element.style.height = "1px";
  element.style.margin = "-1px";
  element.style.padding = "0";
  element.style.border = "0";
  element.style.overflow = "hidden";
  element.style.clip = "rect(0 0 0 0)";
  element.style.clipPath = "inset(100%)";
  element.style.whiteSpace = "nowrap";
}

function setManagedAttribute(element: Element, name: string, value: string): () => void {
  const previous = element.getAttribute(name);
  element.setAttribute(name, value);
  return () => {
    if (previous === null) element.removeAttribute(name);
    else element.setAttribute(name, previous);
  };
}

function isNaturallyFocusable(element: Element): boolean {
  return ["button", "input", "select", "textarea", "a"].includes(
    element.tagName.toLowerCase(),
  );
}

function movementAnnouncement(
  source: NonNullable<DragMoveEvent["operation"]["source"]>,
  target: DragMoveEvent["operation"]["target"],
): string {
  const label = labelFor(source.data);
  if (isSortable(source) && source.id === target?.id) {
    return `${label} moved to position ${source.index + 1}.`;
  }
  return target
    ? `${label} is over ${labelFor(target.data)}.`
    : `${label} is no longer over a target.`;
}

function dropAnnouncement(
  source: NonNullable<DragEndEvent["operation"]["source"]>,
  target: DragEndEvent["operation"]["target"],
): string {
  const label = labelFor(source.data);
  if (isSortable(source)) return `Dropped ${label} at position ${source.index + 1}.`;
  return target ? `Dropped ${label} on ${labelFor(target.data)}.` : `Drop cancelled for ${label}.`;
}

function moveCoordinates(event: DragMoveEvent): Readonly<{ x: number; y: number }> {
  if (event.to) return event.to;
  const current = event.operation.position.current;
  return {
    x: current.x + (event.by?.x ?? 0),
    y: current.y + (event.by?.y ?? 0),
  };
}

function normalizedEvent<ActiveData, OverData>(
  active: Readonly<InteractionDragEntity<ActiveData>>,
  over: Readonly<InteractionDragEntity<OverData>> | null,
  input: DragInputKind,
  clientPoint: ClientPoint | null,
  clientDelta: ClientDelta | null,
  snapshot: CoordinateSpaceSnapshot,
): InteractionDragEvent<ActiveData, OverData> {
  return Object.freeze({
    active,
    over,
    input,
    clientPoint: input === "pointer" ? clientPoint : null,
    clientDelta: input === "pointer" ? clientDelta : null,
    localDelta:
      input === "pointer" && clientDelta ? snapshot.clientDeltaToLocal(clientDelta) : null,
  });
}

function entityFromSource<Data>(
  source: DragStartEvent["operation"]["source"],
): Readonly<InteractionDragEntity<Data>> | null {
  if (!source) return null;
  const registration = registrationFromData(source.data);
  if (!registration?.source) return null;
  return Object.freeze({
    id: String(source.id),
    data: registration.activeData as Data,
    ...(isSortable(source)
      ? {
          sortable: Object.freeze({
            index: source.index,
            initialIndex: source.initialIndex,
          }),
        }
      : {}),
  });
}

function entityFromTarget<Data>(
  target: DragMoveEvent["operation"]["target"],
): Readonly<InteractionDragEntity<Data>> | null {
  if (!target) return null;
  const registration = registrationFromData(target.data);
  if (!registration?.target) return null;
  return Object.freeze({ id: String(target.id), data: registration.overData as Data });
}

function registrationFromData(data: Record<string, unknown> | undefined) {
  const registration = data?.[INTERACTION_DRAG_REGISTRATION_DATA];
  return isInteractionDragRegistrationData(registration) ? registration : null;
}

function isInteractionDragRegistrationData(
  value: unknown,
): value is InteractionDragRegistrationData {
  if (!value || typeof value !== "object") return false;
  const registration = value as Partial<InteractionDragRegistrationData>;
  return typeof registration.source === "boolean" && typeof registration.target === "boolean";
}

function labelFor(data: Record<string, unknown> | undefined): string {
  return registrationFromData(data)?.label ?? "item";
}

function inputKindFromActivator(event: Event | null, ownerWindow: Window): DragInputKind {
  if (!event) return "pointer";
  const OwnerKeyboardEvent = (ownerWindow as Window & typeof globalThis).KeyboardEvent;
  return event instanceof OwnerKeyboardEvent || event.type.startsWith("key")
    ? "keyboard"
    : "pointer";
}

function cancellationReasonFromEvent(event: Event | undefined): DragCancellationReason {
  return event?.type.startsWith("key") && "key" in event && event.key === "Escape"
    ? "escape"
    : "dnd-kit";
}

function clientPointFromCoordinates(
  coordinates: Readonly<{ x: number; y: number }>,
): ClientPoint | null {
  return createClientPoint(coordinates.x, coordinates.y);
}

function positiveSourceSize(
  element: Element | undefined,
): Readonly<{ width: number; height: number }> | null {
  if (!element?.isConnected) return null;
  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || !Number.isFinite(rect.height)) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  return Object.freeze({ width: rect.width, height: rect.height });
}

function rectsIntersect(
  rect: Readonly<{ left: number; top: number; right: number; bottom: number }>,
  boundary: ClientRectSnapshot,
): boolean {
  const boundaryRight = boundary.left + boundary.width;
  const boundaryBottom = boundary.top + boundary.height;
  return (
    rect.right >= boundary.left &&
    rect.left <= boundaryRight &&
    rect.bottom >= boundary.top &&
    rect.top <= boundaryBottom
  );
}

function focusedHTMLElement(ownerDocument: Document): HTMLElement | null {
  const activeElement = ownerDocument.activeElement;
  return activeElement instanceof (ownerDocument.defaultView?.HTMLElement ?? HTMLElement)
    ? activeElement
    : null;
}

function restoreFocus(element: HTMLElement | null): void {
  if (!element?.isConnected) return;
  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

function environmentElementsAreLive(environment: ReadyInteractionDragEnvironment): boolean {
  const { collisionBoundary, coordinateRoot, overlayHost, ownerDocument, ownerWindow } =
    environment;
  return (
    coordinateRoot.isConnected &&
    overlayHost.isConnected &&
    collisionBoundary.isConnected &&
    coordinateRoot.ownerDocument === ownerDocument &&
    overlayHost.ownerDocument === ownerDocument &&
    collisionBoundary.ownerDocument === ownerDocument &&
    ownerDocument.defaultView === ownerWindow
  );
}

function measureCollisionBoundary(
  environment: ReadyInteractionDragEnvironment,
): ClientRectSnapshot | null {
  if (!environmentElementsAreLive(environment)) return null;
  try {
    const rect = environment.collisionBoundary.getBoundingClientRect();
    return createClientRectSnapshot(rect.left, rect.top, rect.width, rect.height);
  } catch {
    return null;
  }
}

function useReducedMotion(ownerWindow: Window | null): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (!ownerWindow?.matchMedia) {
      setReducedMotion(false);
      return;
    }
    const query = ownerWindow.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [ownerWindow]);
  return reducedMotion;
}

function supportsWebAnimations(ownerWindow: Window): boolean {
  return typeof ownerWindow.document.documentElement.animate === "function";
}
