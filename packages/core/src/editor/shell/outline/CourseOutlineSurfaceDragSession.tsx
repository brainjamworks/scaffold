import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";
import { useId, useRef, type ReactNode } from "react";

import type { SurfaceDestination, SurfaceId } from "@/document/model/course-structure";
import type { InteractionDragEvent } from "@/editor/interactions/drag/model/interaction-drag-event";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionDropTarget } from "@/editor/interactions/drag/react/use-interaction-drop-target";
import { iconXs } from "@/ui/tokens/icon-sizes";

import type {
  CourseOutlineStructureAuthoringPort,
  CourseOutlineStructureResult,
} from "./course-outline-structure-authoring";

export interface CourseOutlineSurfaceDragData {
  readonly surfaceId: SurfaceId;
  readonly label: string;
}

interface SurfaceDropData {
  readonly destination: SurfaceDestination;
  readonly label: string;
}

export interface CourseOutlineSurfaceDragProjection {
  readonly destination: SurfaceDestination | null;
  readonly label: string;
  readonly sourceSize: Readonly<{ height: number; width: number }> | null;
  readonly surfaceId: SurfaceId;
}

export function CourseOutlineSurfaceDragSession({
  children,
  port,
  onResult,
  onProjectionChange,
}: {
  readonly children: ReactNode;
  readonly port: CourseOutlineStructureAuthoringPort;
  readonly onResult: (result: CourseOutlineStructureResult, message: string) => void;
  readonly onProjectionChange: (projection: CourseOutlineSurfaceDragProjection | null) => void;
}) {
  const id = useId();
  const projectionKeyRef = useRef("");
  const sourceSizeRef = useRef<CourseOutlineSurfaceDragProjection["sourceSize"]>(null);
  const publishProjection = (projection: CourseOutlineSurfaceDragProjection | null) => {
    const key = projection
      ? `${projection.surfaceId}:${destinationKey(projection.destination)}`
      : "";
    if (key === projectionKeyRef.current) return;
    projectionKeyRef.current = key;
    onProjectionChange(projection);
  };
  const end = (event: InteractionDragEvent<CourseOutlineSurfaceDragData, SurfaceDropData>) => {
    publishProjection(null);
    sourceSizeRef.current = null;
    const destination = event.over?.data.destination;
    if (!destination) {
      onResult({ ok: false, message: "The Surface move was cancelled." }, "");
      return;
    }
    const result = port.moveSurface({ surfaceId: event.active.data.surfaceId, destination });
    onResult(result, result.ok ? `Moved ${event.active.data.label}.` : "");
    if (result.ok) {
      restoreSurfaceHandleFocus(event.active.data.surfaceId);
    }
  };

  return (
    <InteractionDragSession<CourseOutlineSurfaceDragData, SurfaceDropData>
      accessibilityMode="draggable"
      collisionPolicy="closest-center"
      labels={{
        draggable: "Surface",
        instructions: "Use the up and down arrow keys to choose a destination, then press Enter.",
      }}
      onCancel={(reason) => {
        publishProjection(null);
        sourceSizeRef.current = null;
        onResult({ ok: false, message: `Surface move cancelled (${reason}).` }, "");
      }}
      onEnd={end}
      onMove={(event) => {
        const destination = event.over?.data.destination;
        publishProjection({
          destination:
            destination && port.canMoveSurface(event.active.data.surfaceId, destination)
              ? destination
              : null,
          label: event.active.data.label,
          sourceSize: sourceSizeRef.current,
          surfaceId: event.active.data.surfaceId,
        });
      }}
      onStart={(event) => {
        sourceSizeRef.current = measureSurfaceCard(event.active.data.surfaceId);
        publishProjection({
          destination: null,
          label: event.active.data.label,
          sourceSize: sourceSizeRef.current,
          surfaceId: event.active.data.surfaceId,
        });
      }}
      profile="pointer-keyboard"
      renderPreview={(active) => (
        <CourseOutlineSurfaceGhost label={active.label} variant="overlay" />
      )}
      sessionId={`course-outline-surface-${id}`}
    >
      {children}
    </InteractionDragSession>
  );
}

export function CourseOutlineSurfaceDragHandle({
  handleRef,
  isDragging,
  label,
  surfaceId,
}: {
  readonly handleRef: (element: Element | null) => void;
  readonly isDragging: boolean;
  readonly label: string;
  readonly surfaceId: SurfaceId;
}) {
  return (
    <InteractionDragActivationArea
      ref={handleRef}
      aria-label={`Move Surface ${label}`}
      className="sc-document-outline-drag-handle"
      data-course-outline-surface-drag-id={surfaceId}
      data-dragging={isDragging ? "true" : undefined}
      safeLocalHeight={44}
      safeLocalWidth={44}
      type="button"
      onClick={(event) => event.stopPropagation()}
    >
      <DotsSixVertical aria-hidden size={iconXs} weight="bold" />
    </InteractionDragActivationArea>
  );
}

export function CourseOutlineSurfaceGhost({
  label,
  sourceSize,
  surfaceId,
  variant,
}: {
  readonly label: string;
  readonly sourceSize?: CourseOutlineSurfaceDragProjection["sourceSize"];
  readonly surfaceId?: SurfaceId;
  readonly variant: "overlay" | "projection";
}) {
  return (
    <article
      aria-hidden="true"
      className={`sc-course-outline-slide-ghost sc-course-outline-slide-ghost--${variant}`}
      data-course-outline-surface-projection={variant === "projection" ? surfaceId : undefined}
      style={
        variant === "projection" && sourceSize
          ? { height: sourceSize.height, width: sourceSize.width }
          : undefined
      }
    >
      <span className="sc-course-outline-slide-ghost__canvas" />
      <span className="sc-course-outline-slide-ghost__label">{label}</span>
      <span className="sc-course-outline-slide-ghost__footer" />
    </article>
  );
}

export function CourseOutlineSurfaceDropTarget({
  destination,
  label,
  level,
  targetId,
}: {
  readonly destination: SurfaceDestination;
  readonly label: string;
  readonly level?: number;
  readonly targetId?: string;
}) {
  const isSectionDestination = "intoCourseSectionId" in destination;
  const key =
    "beforeSurfaceId" in destination
      ? `before:${destination.beforeSurfaceId}`
      : "afterSurfaceId" in destination
        ? `after:${destination.afterSurfaceId}`
        : `section:${destination.intoCourseSectionId}:${destination.edge}`;
  const drop = useInteractionDropTarget<SurfaceDropData>({
    data: { destination, label },
    id: `course-outline-drop:${targetId ?? key}`,
  });
  return (
    <span
      ref={drop.targetRef}
      aria-hidden="true"
      className={`sc-document-outline-drop-target sc-document-outline-drop-target--${isSectionDestination ? "section" : "insertion"}`}
      data-active={drop.isDropTarget ? "true" : undefined}
      data-destination={key}
      style={
        level === undefined
          ? undefined
          : ({ "--sc-document-outline-level": level } as React.CSSProperties)
      }
    />
  );
}

function destinationKey(destination: SurfaceDestination | null): string {
  if (!destination) return "none";
  if ("beforeSurfaceId" in destination) return `before:${destination.beforeSurfaceId}`;
  if ("afterSurfaceId" in destination) return `after:${destination.afterSurfaceId}`;
  return `section:${destination.intoCourseSectionId}:${destination.edge}`;
}

function measureSurfaceCard(
  surfaceId: SurfaceId,
): CourseOutlineSurfaceDragProjection["sourceSize"] {
  const card = globalThis.document.querySelector<HTMLElement>(
    `[data-course-outline-surface-card-id="${surfaceId}"]`,
  );
  if (!card) return null;
  const rect = card.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return Object.freeze({ height: rect.height, width: rect.width });
}

function restoreSurfaceHandleFocus(surfaceId: SurfaceId): void {
  let remainingFrames = 16;
  const restore = () => {
    const handle = globalThis.document.querySelector<HTMLElement>(
      `[data-course-outline-surface-drag-id="${surfaceId}"]`,
    );
    if (handle && handle.ownerDocument.activeElement !== handle) handle.focus();
    remainingFrames -= 1;
    if (remainingFrames > 0) globalThis.requestAnimationFrame(restore);
  };
  globalThis.queueMicrotask(() => globalThis.requestAnimationFrame(restore));
}
