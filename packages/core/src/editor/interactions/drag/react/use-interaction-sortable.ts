import { useSortable } from "@dnd-kit/sortable";
import { useEffect, useId, useMemo, type HTMLAttributes } from "react";

import { createClientDelta, type CoordinateSpaceSnapshot } from "../model/coordinate-space";
import {
  INTERACTION_DRAG_REGISTRATION_DATA,
  useInteractionDragSessionAdapter,
  type InteractionDragRegistrationData,
} from "./InteractionDragSession";

export interface InteractionSortableRegistration<Data> {
  readonly data: Data;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
}

export interface InteractionSortableTransform {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
}

export interface InteractionSortableResult {
  readonly activatorProps: HTMLAttributes<HTMLElement>;
  readonly isDragging: boolean;
  readonly isOver: boolean;
  readonly isPlaceholder: boolean;
  readonly localTransform: InteractionSortableTransform | null;
  readonly setActivatorNodeRef: (element: HTMLElement | null) => void;
  readonly setNodeRef: (element: HTMLElement | null) => void;
  readonly sourceProps: HTMLAttributes<HTMLElement> & {
    readonly "data-interaction-drag-placeholder"?: "";
  };
  readonly transition: string | undefined;
}

export function useInteractionSortable<Data>({
  data,
  disabled = false,
  id,
  label,
}: InteractionSortableRegistration<Data>): InteractionSortableResult {
  const session = useInteractionDragSessionAdapter();
  const sourceRemoved = session.sourceRemoved;
  const fallbackId = useId();
  const valid = id.trim().length > 0 && label.trim().length > 0;
  const registration = useMemo<InteractionDragRegistrationData>(
    () => ({ activeData: data, label, overData: data, source: true, target: true }),
    [data, label],
  );
  const sortable = useSortable({
    id: valid ? id : `invalid-interaction-sortable:${fallbackId}`,
    data: { [INTERACTION_DRAG_REGISTRATION_DATA]: registration },
    disabled: disabled || !valid || !session.enabled,
  });
  const isPlaceholder = valid && session.activeId === id;

  useEffect(() => {
    if (import.meta.env.DEV && !valid) {
      console.error("Interaction sortables require non-empty id and label values.");
    }
  }, [valid]);
  useEffect(
    () => () => {
      if (valid) sourceRemoved(id);
    },
    [id, sourceRemoved, valid],
  );

  const activatorProps = useMemo<HTMLAttributes<HTMLElement>>(() => {
    if (session.accessibilityMode === "selection-alternative") {
      const onPointerDown = sortable.listeners?.onPointerDown;
      return onPointerDown ? { onPointerDown: onPointerDown as never } : {};
    }
    return {
      ...sortable.attributes,
      ...sortable.listeners,
      "aria-label": label,
    } as HTMLAttributes<HTMLElement>;
  }, [label, session.accessibilityMode, sortable.attributes, sortable.listeners]);

  return {
    activatorProps,
    isDragging: sortable.isDragging,
    isOver: sortable.isOver,
    isPlaceholder,
    localTransform: normalizeInteractionSortableTransform(sortable.transform, session.snapshot),
    setActivatorNodeRef: sortable.setActivatorNodeRef,
    setNodeRef: sortable.setNodeRef,
    sourceProps: isPlaceholder
      ? { "aria-hidden": true, "data-interaction-drag-placeholder": "" }
      : {},
    transition: session.reducedMotion ? undefined : sortable.transition,
  };
}

export function normalizeInteractionSortableTransform(
  transform: InteractionSortableTransform | null,
  snapshot: CoordinateSpaceSnapshot | null,
): InteractionSortableTransform | null {
  if (!transform || !snapshot) return null;
  if (!Number.isFinite(transform.scaleX) || !Number.isFinite(transform.scaleY)) return null;
  const clientDelta = createClientDelta(transform.x, transform.y);
  if (!clientDelta) return null;
  const localDelta = snapshot.clientDeltaToLocal(clientDelta);
  return Object.freeze({
    x: localDelta.x,
    y: localDelta.y,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
  });
}
