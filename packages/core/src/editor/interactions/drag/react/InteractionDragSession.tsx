import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DndContextProps,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { createOwnerDocumentPointerTracker } from "../dom/owner-document-pointer-tracker";
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

export const INTERACTION_DRAG_REGISTRATION_DATA = "__scaffoldInteractionDragRegistration";

export interface InteractionDragRegistrationData {
  readonly activeData?: unknown;
  readonly label?: string;
  readonly overData?: unknown;
  readonly source: boolean;
  readonly target: boolean;
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
  readonly renderPreview?: (active: ActiveData) => ReactNode;
  readonly resolveCollision?: (
    input: InteractionFeatureCollisionInput<ActiveData, OverData>,
  ) => string | null;
  readonly sessionId: string;
  readonly sortableItems?: readonly string[];
}

export interface InteractionDragSessionAdapterContextValue {
  readonly accessibilityMode: DragAccessibilityMode;
  readonly activeId: string | null;
  readonly enabled: boolean;
  readonly reducedMotion: boolean;
  readonly snapshot: CoordinateSpaceSnapshot | null;
  readonly sourceRemoved: (id: string) => void;
}

const InteractionDragSessionAdapterContext =
  createContext<InteractionDragSessionAdapterContextValue | null>(null);

export function useInteractionDragSessionAdapter(): InteractionDragSessionAdapterContextValue {
  const context = useContext(InteractionDragSessionAdapterContext);
  if (!context)
    throw new Error("Drag registrations must be rendered inside InteractionDragSession.");
  return context;
}

interface ActiveSession<ActiveData, OverData> {
  readonly active: Readonly<InteractionDragEntity<ActiveData>>;
  readonly collisionBoundaryRect: ClientRectSnapshot;
  readonly environment: ReadyInteractionDragEnvironment;
  readonly focusTarget: HTMLElement | null;
  readonly input: DragInputKind;
  snapshot: CoordinateSpaceSnapshot;
  stopCoordinateSubscription: (() => void) | null;
  latestMove: {
    clientDelta: ClientDelta;
    over: Readonly<InteractionDragEntity<OverData>> | null;
  } | null;
}

interface ActivePresentation<ActiveData> {
  readonly data: ActiveData;
  readonly height: number;
  readonly id: string;
  readonly width: number;
}

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
  sortableItems,
}: InteractionDragSessionProps<ActiveData, OverData>) {
  const environmentResolution = useInteractionDragEnvironmentResolution();
  const environment =
    environmentResolution.status === "ready" ? environmentResolution.environment : null;
  const [activePresentation, setActivePresentation] =
    useState<ActivePresentation<ActiveData> | null>(null);
  const [snapshot, setSnapshot] = useState<CoordinateSpaceSnapshot | null>(null);
  const [contextGeneration, setContextGeneration] = useState(0);
  const activeSessionRef = useRef<ActiveSession<ActiveData, OverData> | null>(null);
  const pointerTrackerRef = useRef<ReturnType<typeof createOwnerDocumentPointerTracker> | null>(
    null,
  );
  const callbacksRef = useRef({ onCancel, onEnd, onMove, onStart });
  callbacksRef.current = { onCancel, onEnd, onMove, onStart };
  const reducedMotion = useReducedMotion(environment?.ownerWindow ?? null);

  useEffect(() => {
    if (!environment) {
      pointerTrackerRef.current = null;
      return;
    }
    const tracker = createOwnerDocumentPointerTracker(environment.ownerDocument);
    tracker.start();
    pointerTrackerRef.current = tracker;
    return () => {
      tracker.stop();
      if (pointerTrackerRef.current === tracker) pointerTrackerRef.current = null;
    };
  }, [environment]);

  const releaseActiveSession = useCallback((remountDndContext: boolean) => {
    const activeSession = activeSessionRef.current;
    if (!activeSession) return null;
    activeSessionRef.current = null;
    activeSession.stopCoordinateSubscription?.();
    activeSession.stopCoordinateSubscription = null;
    setActivePresentation(null);
    setSnapshot(null);
    if (remountDndContext) setContextGeneration((generation) => generation + 1);
    restoreFocus(activeSession.focusTarget);
    return activeSession;
  }, []);

  const cancelActiveSession = useCallback(
    (reason: DragCancellationReason, remountDndContext = true) => {
      if (!releaseActiveSession(remountDndContext)) return;
      callbacksRef.current.onCancel?.(reason);
    },
    [releaseActiveSession],
  );

  useEffect(() => {
    const activeSession = activeSessionRef.current;
    if (activeSession && activeSession.environment !== environment) {
      cancelActiveSession("environment-lost");
    }
  }, [cancelActiveSession, environment]);

  useEffect(() => {
    if (!activePresentation) return;
    const activeEnvironment = activeSessionRef.current?.environment;
    if (!activeEnvironment) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelActiveSession("escape");
    };
    const handleBlur = () => cancelActiveSession("owner-window-blur");
    activeEnvironment.ownerDocument.addEventListener("keydown", handleKeyDown, true);
    activeEnvironment.ownerWindow.addEventListener("blur", handleBlur);
    return () => {
      activeEnvironment.ownerDocument.removeEventListener("keydown", handleKeyDown, true);
      activeEnvironment.ownerWindow.removeEventListener("blur", handleBlur);
    };
  }, [activePresentation, cancelActiveSession]);

  useEffect(
    () => () => {
      const activeSession = activeSessionRef.current;
      if (!activeSession) return;
      activeSessionRef.current = null;
      activeSession.stopCoordinateSubscription?.();
      callbacksRef.current.onCancel?.("unmount");
      restoreFocus(activeSession.focusTarget);
    },
    [],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      if (!environment || activeSessionRef.current) return;
      const registration = registrationFromData(event.active.data.current);
      if (!registration?.source) return;
      const measuredSnapshot = environment.coordinateSpace.measure();
      if (!measuredSnapshot) return;
      const collisionRect = environment.collisionBoundary.getBoundingClientRect();
      const collisionBoundaryRect = createClientRectSnapshot(
        collisionRect.left,
        collisionRect.top,
        collisionRect.width,
        collisionRect.height,
      );
      if (!collisionBoundaryRect) return;
      const input = inputKindFromActivator(event.activatorEvent, environment.ownerWindow);
      const active = Object.freeze({
        id: String(event.active.id),
        data: registration.activeData as ActiveData,
      });
      const initialRect = event.active.rect.current.initial;
      const activeSession: ActiveSession<ActiveData, OverData> = {
        active,
        collisionBoundaryRect,
        environment,
        focusTarget: focusedHTMLElement(environment.ownerDocument),
        input,
        latestMove: null,
        snapshot: measuredSnapshot,
        stopCoordinateSubscription: null,
      };
      activeSessionRef.current = activeSession;
      activeSession.stopCoordinateSubscription = environment.coordinateSpace.subscribe(() => {
        if (activeSessionRef.current !== activeSession) return;
        const nextSnapshot = environment.coordinateSpace.measure();
        if (!nextSnapshot) {
          cancelActiveSession("environment-lost");
          return;
        }
        activeSession.snapshot = nextSnapshot;
        setSnapshot(nextSnapshot);
        if (activeSession.input !== "pointer" || !activeSession.latestMove) return;
        const clientPoint = pointerTrackerRef.current?.getLatestClientPoint() ?? null;
        callbacksRef.current.onMove?.(
          normalizedEvent(
            activeSession.active,
            activeSession.latestMove.over,
            "pointer",
            clientPoint,
            activeSession.latestMove.clientDelta,
            nextSnapshot,
          ),
        );
      });
      setSnapshot(measuredSnapshot);
      setActivePresentation({
        data: active.data,
        height: initialRect?.height ?? 0,
        id: active.id,
        width: initialRect?.width ?? 0,
      });
      callbacksRef.current.onStart?.(
        normalizedEvent(
          active,
          null,
          input,
          pointerPointForEvent(input, event.activatorEvent, pointerTrackerRef.current, environment),
          input === "pointer" ? createClientDelta(0, 0)! : null,
          measuredSnapshot,
        ),
      );
    },
    [cancelActiveSession, environment],
  );

  const handleDragMove = useCallback((event: DragMoveEvent) => {
    const activeSession = activeSessionRef.current;
    if (!activeSession) return;
    const over = overEntity<OverData>(event.over);
    if (activeSession.input === "keyboard") {
      callbacksRef.current.onMove?.(
        normalizedEvent(activeSession.active, over, "keyboard", null, null, activeSession.snapshot),
      );
      return;
    }
    const clientDelta = createClientDelta(event.delta.x, event.delta.y);
    if (!clientDelta) return;
    activeSession.latestMove = { clientDelta, over };
    callbacksRef.current.onMove?.(
      normalizedEvent(
        activeSession.active,
        over,
        "pointer",
        pointerTrackerRef.current?.getLatestClientPoint() ?? null,
        clientDelta,
        activeSession.snapshot,
      ),
    );
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeSession = activeSessionRef.current;
      if (!activeSession) return;
      const over = overEntity<OverData>(event.over);
      if (!over) {
        cancelActiveSession("invalid-drop", false);
        return;
      }
      const clientDelta =
        activeSession.input === "pointer" ? createClientDelta(event.delta.x, event.delta.y) : null;
      const normalized = normalizedEvent(
        activeSession.active,
        over,
        activeSession.input,
        activeSession.input === "pointer"
          ? (pointerTrackerRef.current?.getLatestClientPoint() ?? null)
          : null,
        clientDelta,
        activeSession.snapshot,
      );
      releaseActiveSession(false);
      callbacksRef.current.onEnd(normalized);
    },
    [cancelActiveSession, releaseActiveSession],
  );

  const handleDragCancel = useCallback(
    (_event: DragCancelEvent) => cancelActiveSession("dnd-kit", false),
    [cancelActiveSession],
  );
  const sourceRemoved = useCallback(
    (id: string) => {
      if (activeSessionRef.current?.active.id === id) cancelActiveSession("source-removed");
    },
    [cancelActiveSession],
  );
  const adapterContext = useMemo<InteractionDragSessionAdapterContextValue>(
    () => ({
      accessibilityMode,
      activeId: activePresentation?.id ?? null,
      enabled: environment !== null,
      reducedMotion,
      snapshot,
      sourceRemoved,
    }),
    [
      accessibilityMode,
      activePresentation?.id,
      environment,
      reducedMotion,
      snapshot,
      sourceRemoved,
    ],
  );
  const sensors = useInteractionSensors(profile, accessibilityMode);
  const collisionDetection = useCollisionDetection(
    collisionPolicy,
    resolveCollision,
    activeSessionRef,
  );
  const accessibility = useMemo<NonNullable<DndContextProps["accessibility"]>>(
    () => createAccessibility(accessibilityMode, labels, environment?.overlayHost),
    [accessibilityMode, environment?.overlayHost, labels],
  );
  const modifiers = useMemo<Modifier[]>(() => {
    if (profile === "sortable-vertical") return [restrictToVerticalAxis];
    if (profile === "sortable-horizontal") return [restrictToHorizontalAxis];
    return [];
  }, [profile]);

  const registeredChildren = (
    <InteractionDragSessionAdapterContext value={adapterContext}>
      {profile === "sortable-vertical" || profile === "sortable-horizontal" ? (
        <SortableContext
          items={[...(sortableItems ?? [])]}
          strategy={
            profile === "sortable-vertical"
              ? verticalListSortingStrategy
              : horizontalListSortingStrategy
          }
        >
          {children}
        </SortableContext>
      ) : (
        children
      )}
    </InteractionDragSessionAdapterContext>
  );

  return (
    <DndContext
      key={`${sessionId}:${contextGeneration}`}
      id={sessionId}
      accessibility={accessibility}
      collisionDetection={collisionDetection}
      modifiers={modifiers}
      sensors={sensors}
      onDragCancel={handleDragCancel}
      onDragEnd={handleDragEnd}
      onDragMove={handleDragMove}
      onDragStart={handleDragStart}
    >
      {registeredChildren}
      {environment && activePresentation && renderPreview
        ? createPortal(
            <DragOverlay
              adjustScale={false}
              dropAnimation={
                reducedMotion ? null : { duration: 160, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
              }
            >
              <InteractionDragPreview
                height={activePresentation.height}
                width={activePresentation.width}
              >
                {renderPreview(activePresentation.data)}
              </InteractionDragPreview>
            </DragOverlay>,
            environment.overlayHost,
          )
        : null}
    </DndContext>
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
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 4 } });
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  const keyboardEnabled =
    mode !== "selection-alternative" &&
    (profile === "sortable-vertical" || profile === "sortable-horizontal");
  return useSensors(...(keyboardEnabled ? [pointerSensor, keyboardSensor] : [pointerSensor]));
}

function useCollisionDetection<ActiveData, OverData>(
  policy: InteractionCollisionPolicy,
  resolveCollision: InteractionDragSessionProps<ActiveData, OverData>["resolveCollision"],
  activeSessionRef: React.RefObject<ActiveSession<ActiveData, OverData> | null>,
): CollisionDetection {
  return useCallback<CollisionDetection>(
    (input) => {
      const activeSession = activeSessionRef.current;
      if (!activeSession) return [];
      const constrainedInput = constrainCollisionInput(input, activeSession.collisionBoundaryRect);
      if (policy === "pointer") return pointerWithin(constrainedInput);
      if (policy === "closest-center") return closestCenter(constrainedInput);
      if (!resolveCollision) return [];
      const clientPoint = constrainedInput.pointerCoordinates
        ? createClientPoint(
            constrainedInput.pointerCoordinates.x,
            constrainedInput.pointerCoordinates.y,
          )
        : null;
      const candidates = constrainedInput.droppableContainers.flatMap((container) => {
        const registration = registrationFromData(container.data.current);
        const rect = constrainedInput.droppableRects.get(container.id);
        if (!registration?.target || !rect) return [];
        const clientRect: ClientRectSnapshot = Object.freeze({
          space: "client",
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        });
        return [
          Object.freeze({
            id: String(container.id),
            data: registration.overData as OverData,
            clientRect,
          }),
        ];
      });
      const resolvedId = resolveCollision({
        active: activeSession.active,
        clientPoint,
        candidates,
      });
      return resolvedId === null ? [] : [{ id: resolvedId }];
    },
    [activeSessionRef, policy, resolveCollision],
  );
}

function constrainCollisionInput(
  input: Parameters<CollisionDetection>[0],
  boundary: ClientRectSnapshot,
): Parameters<CollisionDetection>[0] {
  const droppableContainers = input.droppableContainers.filter((container) => {
    const rect = input.droppableRects.get(container.id);
    return rect ? rectsIntersect(rect, boundary) : false;
  });
  const droppableRects = new Map(
    droppableContainers.flatMap((container) => {
      const rect = input.droppableRects.get(container.id);
      return rect ? [[container.id, rect] as const] : [];
    }),
  );
  return { ...input, droppableContainers, droppableRects };
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

function createAccessibility(
  mode: DragAccessibilityMode,
  labels: DragAccessibilityLabels,
  container: HTMLElement | undefined,
): NonNullable<DndContextProps["accessibility"]> {
  const silentAnnouncements: Announcements = {
    onDragStart: () => undefined,
    onDragOver: () => undefined,
    onDragEnd: () => undefined,
    onDragCancel: () => undefined,
  };
  const announcements: Announcements =
    mode === "selection-alternative"
      ? silentAnnouncements
      : {
          onDragStart: ({ active }) =>
            labels.pickedUp ?? `Picked up ${labelFor(active.data.current)}.`,
          onDragMove: ({ active, over }) =>
            labels.moved ??
            (over
              ? `${labelFor(active.data.current)} is over ${labelFor(over.data.current)}.`
              : `${labelFor(active.data.current)} is moving.`),
          onDragOver: ({ active, over }) =>
            labels.moved ??
            (over
              ? `${labelFor(active.data.current)} is over ${labelFor(over.data.current)}.`
              : `${labelFor(active.data.current)} is no longer over a target.`),
          onDragEnd: ({ active, over }) =>
            labels.dropped ??
            (over
              ? `Dropped ${labelFor(active.data.current)} on ${labelFor(over.data.current)}.`
              : `Drop cancelled for ${labelFor(active.data.current)}.`),
          onDragCancel: ({ active }) =>
            labels.cancelled ?? `Cancelled moving ${labelFor(active.data.current)}.`,
        };
  return {
    announcements,
    ...(container ? { container } : {}),
    restoreFocus: mode !== "selection-alternative",
    screenReaderInstructions: {
      draggable: mode === "selection-alternative" ? "" : (labels.instructions ?? labels.draggable),
    },
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

function overEntity<OverData>(
  over: DragMoveEvent["over"],
): Readonly<InteractionDragEntity<OverData>> | null {
  if (!over) return null;
  const registration = registrationFromData(over.data.current);
  if (!registration?.target) return null;
  return Object.freeze({ id: String(over.id), data: registration.overData as OverData });
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

function inputKindFromActivator(event: Event, ownerWindow: Window): DragInputKind {
  const OwnerKeyboardEvent = (ownerWindow as Window & typeof globalThis).KeyboardEvent;
  return event instanceof OwnerKeyboardEvent || event.type.startsWith("key")
    ? "keyboard"
    : "pointer";
}

function pointerPointForEvent(
  input: DragInputKind,
  activatorEvent: Event,
  tracker: ReturnType<typeof createOwnerDocumentPointerTracker> | null,
  environment: ReadyInteractionDragEnvironment,
): ClientPoint | null {
  if (input === "keyboard") return null;
  const tracked = tracker?.getLatestClientPoint();
  if (tracked) return tracked;
  const eventTarget = activatorEvent.target as (EventTarget & { ownerDocument?: Document }) | null;
  if (eventTarget?.ownerDocument && eventTarget.ownerDocument !== environment.ownerDocument) {
    return null;
  }
  const event = activatorEvent as Event & { clientX?: unknown; clientY?: unknown };
  return typeof event.clientX === "number" && typeof event.clientY === "number"
    ? createClientPoint(event.clientX, event.clientY)
    : null;
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

const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const restrictToHorizontalAxis: Modifier = ({ transform }) => ({ ...transform, y: 0 });
