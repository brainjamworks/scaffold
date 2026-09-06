import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type { EmbeddedDataId } from "@scaffold/contracts";

import type { SpatialImagePoint } from "@/editor/assessment/shared/spatial";
import type { ReadyInteractionDragEnvironment } from "@/editor/interactions/drag/react/interaction-drag-environment";

import type { DragDropPresentation } from "./drag-drop-course-interaction";

const POINTER_ACTIVATION_DISTANCE = 4;
const POINTER_PREVIEW_SIZE = 44;

export interface SpatialMarkerPointerSource {
  readonly markerId: EmbeddedDataId;
  readonly origin: "shelf" | "canvas";
  readonly presentation: DragDropPresentation;
}

interface ClientPoint {
  readonly x: number;
  readonly y: number;
}

interface PointerSession {
  active: boolean;
  canvasPoint: SpatialImagePoint | null;
  readonly capture:
    | Readonly<{ status: "captured" }>
    | Readonly<{ status: "unavailable"; pointerId: number; reason: "inactive-pointer" }>;
  currentPoint: ClientPoint;
  readonly environment: ReadyInteractionDragEnvironment;
  readonly handle: HTMLElement;
  readonly pointerId: number;
  overReturnTarget: boolean;
  readonly source: SpatialMarkerPointerSource;
  readonly startPoint: ClientPoint;
  stopListeners: (() => void) | null;
}

export interface SpatialMarkerPointerDragController {
  readonly active: SpatialMarkerPointerDragState | null;
  readonly overlay: ReactNode;
  readonly start: (
    source: SpatialMarkerPointerSource,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
}

export interface SpatialMarkerPointerDragState {
  readonly canvasPoint: SpatialImagePoint | null;
  readonly overReturnTarget: boolean;
  readonly source: SpatialMarkerPointerSource;
}

export function useSpatialMarkerPointerDrag({
  disabled,
  environment,
  isOverReturnTarget,
  onCancel,
  onDrop,
  onStart,
  renderPreview,
  resolveCanvasPoint,
}: {
  readonly disabled: boolean;
  readonly environment: ReadyInteractionDragEnvironment | null;
  readonly isOverReturnTarget: (source: SpatialMarkerPointerSource, point: ClientPoint) => boolean;
  readonly onCancel: (source: SpatialMarkerPointerSource) => void;
  readonly onDrop: (
    source: SpatialMarkerPointerSource,
    point: ClientPoint,
    overReturnTarget: boolean,
  ) => void;
  readonly onStart: (source: SpatialMarkerPointerSource) => void;
  readonly renderPreview: (source: SpatialMarkerPointerSource) => ReactNode;
  readonly resolveCanvasPoint: (
    source: SpatialMarkerPointerSource,
    point: ClientPoint,
  ) => SpatialImagePoint | null;
}): SpatialMarkerPointerDragController {
  const sessionRef = useRef<PointerSession | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const callbacksRef = useRef({
    isOverReturnTarget,
    onCancel,
    onDrop,
    onStart,
    resolveCanvasPoint,
  });
  callbacksRef.current = {
    isOverReturnTarget,
    onCancel,
    onDrop,
    onStart,
    resolveCanvasPoint,
  };
  const [active, setActive] = useState<SpatialMarkerPointerDragState | null>(null);

  const positionPreview = useCallback((point: ClientPoint) => {
    previewRef.current?.style.setProperty(
      "transform",
      `translate3d(${point.x - POINTER_PREVIEW_SIZE / 2}px, ${point.y - POINTER_PREVIEW_SIZE / 2}px, 0)`,
    );
  }, []);

  const stopSession = useCallback((terminal: "cancel" | "drop" | "silent", point?: ClientPoint) => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    session.stopListeners?.();
    session.stopListeners = null;
    if (
      session.capture.status === "captured" &&
      session.handle.hasPointerCapture(session.pointerId)
    ) {
      session.handle.releasePointerCapture(session.pointerId);
    }
    if (!session.active) return;

    setActive(null);
    if (terminal === "silent") return;
    suppressNextClick(session.environment);
    if (terminal === "drop") {
      if (!point) throw new Error("A completed marker drag requires a client point.");
      callbacksRef.current.onDrop(session.source, point, session.overReturnTarget);
    } else {
      callbacksRef.current.onCancel(session.source);
    }
  }, []);

  const start = useCallback(
    (source: SpatialMarkerPointerSource, event: ReactPointerEvent<HTMLElement>) => {
      if (disabled || !environment || !event.isPrimary || event.button !== 0) return;
      if (sessionRef.current) return;

      const handle = event.currentTarget;
      const startPoint = { x: event.clientX, y: event.clientY };
      const session: PointerSession = {
        active: false,
        canvasPoint: null,
        capture: requestPointerCapture(handle, event.pointerId),
        currentPoint: startPoint,
        environment,
        handle,
        pointerId: event.pointerId,
        overReturnTarget: false,
        source,
        startPoint,
        stopListeners: null,
      };
      sessionRef.current = session;

      const { ownerDocument, ownerWindow } = environment;
      const updateDestination = (point: ClientPoint) => {
        session.currentPoint = point;
        session.overReturnTarget = callbacksRef.current.isOverReturnTarget(session.source, point);
        session.canvasPoint = session.overReturnTarget
          ? null
          : callbacksRef.current.resolveCanvasPoint(session.source, point);
      };
      const move = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== session.pointerId || sessionRef.current !== session) return;
        const point = latestClientPoint(moveEvent);
        updateDestination(point);
        if (!session.active) {
          if (
            Math.hypot(point.x - session.startPoint.x, point.y - session.startPoint.y) <
            POINTER_ACTIVATION_DISTANCE
          ) {
            return;
          }
          session.active = true;
          moveEvent.preventDefault();
          callbacksRef.current.onStart(session.source);
          setActive({
            canvasPoint: session.canvasPoint,
            overReturnTarget: session.overReturnTarget,
            source: session.source,
          });
          return;
        }
        moveEvent.preventDefault();
        setActive({
          canvasPoint: session.canvasPoint,
          overReturnTarget: session.overReturnTarget,
          source: session.source,
        });
      };
      const up = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== session.pointerId || sessionRef.current !== session) return;
        const point = latestClientPoint(upEvent);
        updateDestination(point);
        if (session.active) upEvent.preventDefault();
        stopSession(session.active ? "drop" : "silent", point);
      };
      const cancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== session.pointerId || sessionRef.current !== session) return;
        stopSession(session.active ? "cancel" : "silent");
      };
      const lostCapture = (lostEvent: PointerEvent) => {
        if (lostEvent.pointerId !== session.pointerId || sessionRef.current !== session) return;
        stopSession(session.active ? "cancel" : "silent");
      };
      const keyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key !== "Escape" || sessionRef.current !== session) return;
        if (session.active) {
          keyEvent.preventDefault();
          keyEvent.stopPropagation();
        }
        stopSession(session.active ? "cancel" : "silent");
      };
      const blur = () => {
        if (sessionRef.current === session) stopSession(session.active ? "cancel" : "silent");
      };
      const selectStart = (selectEvent: Event) => {
        if (session.active) selectEvent.preventDefault();
      };
      session.stopListeners = () => {
        ownerDocument.removeEventListener("pointermove", move, true);
        ownerDocument.removeEventListener("pointerup", up, true);
        ownerDocument.removeEventListener("pointercancel", cancel, true);
        ownerDocument.removeEventListener("keydown", keyDown, true);
        ownerDocument.removeEventListener("selectstart", selectStart, true);
        handle.removeEventListener("lostpointercapture", lostCapture);
        ownerWindow.removeEventListener("blur", blur);
      };
      ownerDocument.addEventListener("pointermove", move, true);
      ownerDocument.addEventListener("pointerup", up, true);
      ownerDocument.addEventListener("pointercancel", cancel, true);
      ownerDocument.addEventListener("keydown", keyDown, true);
      ownerDocument.addEventListener("selectstart", selectStart, true);
      handle.addEventListener("lostpointercapture", lostCapture);
      ownerWindow.addEventListener("blur", blur);
    },
    [disabled, environment, stopSession],
  );

  useLayoutEffect(() => {
    const session = sessionRef.current;
    if (active && !active.canvasPoint && session?.active) positionPreview(session.currentPoint);
  }, [active, positionPreview]);

  useEffect(() => {
    const session = sessionRef.current;
    if (session && (disabled || environment !== session.environment)) {
      stopSession(session.active ? "cancel" : "silent");
    }
  }, [disabled, environment, stopSession]);

  useEffect(
    () => () => {
      stopSession("silent");
    },
    [stopSession],
  );

  const overlay =
    active && !active.canvasPoint && environment
      ? createPortal(
          <div
            ref={previewRef}
            aria-hidden
            className="sc-course-drag-drop-pointer-preview"
            data-drag-drop-active-preview=""
            data-drag-drop-pointer-preview=""
            style={{ height: POINTER_PREVIEW_SIZE, width: POINTER_PREVIEW_SIZE }}
          >
            {renderPreview(active.source)}
          </div>,
          environment.overlayHost,
        )
      : null;

  return { active, overlay, start };
}

function latestClientPoint(event: PointerEvent): ClientPoint {
  const coalesced = event.getCoalescedEvents?.() ?? [];
  const latest = coalesced.length > 0 ? coalesced[coalesced.length - 1]! : event;
  return { x: latest.clientX, y: latest.clientY };
}

function requestPointerCapture(handle: HTMLElement, pointerId: number): PointerSession["capture"] {
  try {
    handle.setPointerCapture(pointerId);
    return { status: "captured" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      // Synthetic events and a pointer that ended just before capture can both
      // reach this expected DOM boundary. Document listeners retain ownership.
      return { status: "unavailable", pointerId, reason: "inactive-pointer" };
    }
    throw error;
  }
}

function suppressNextClick(environment: ReadyInteractionDragEnvironment): void {
  const { ownerDocument, ownerWindow } = environment;
  let timeout = 0;
  const stop = () => {
    ownerDocument.removeEventListener("click", suppress, true);
    ownerWindow.clearTimeout(timeout);
  };
  const suppress = (event: MouseEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    stop();
  };
  ownerDocument.addEventListener("click", suppress, true);
  timeout = ownerWindow.setTimeout(stop, 0);
}
