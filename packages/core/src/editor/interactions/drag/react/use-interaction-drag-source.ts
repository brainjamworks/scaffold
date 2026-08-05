import { useDraggable } from "@dnd-kit/core";
import { useEffect, useId, useMemo, type HTMLAttributes } from "react";

import {
  INTERACTION_DRAG_REGISTRATION_DATA,
  useInteractionDragSessionAdapter,
  type InteractionDragRegistrationData,
} from "./InteractionDragSession";

export interface InteractionDragSourceRegistration<Data> {
  readonly data: Data;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
}

export interface InteractionDragSourceResult {
  readonly activatorProps: HTMLAttributes<HTMLElement>;
  readonly isDragging: boolean;
  readonly isPlaceholder: boolean;
  readonly setActivatorNodeRef: (element: HTMLElement | null) => void;
  readonly setNodeRef: (element: HTMLElement | null) => void;
  readonly sourceProps: HTMLAttributes<HTMLElement> & {
    readonly "data-interaction-drag-placeholder"?: "";
  };
}

export function useInteractionDragSource<Data>({
  data,
  disabled = false,
  id,
  label,
}: InteractionDragSourceRegistration<Data>): InteractionDragSourceResult {
  const session = useInteractionDragSessionAdapter();
  const sourceRemoved = session.sourceRemoved;
  const fallbackId = useId();
  const valid = id.trim().length > 0 && label.trim().length > 0;
  const registration = useMemo<InteractionDragRegistrationData>(
    () => ({ activeData: data, label, source: true, target: false }),
    [data, label],
  );
  const draggable = useDraggable({
    id: valid ? id : `invalid-interaction-drag-source:${fallbackId}`,
    data: { [INTERACTION_DRAG_REGISTRATION_DATA]: registration },
    disabled: disabled || !valid || !session.enabled,
  });
  const isPlaceholder = valid && session.activeId === id;

  useEffect(() => {
    if (import.meta.env.DEV && !valid) {
      console.error("Interaction drag sources require non-empty id and label values.");
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
      const onPointerDown = draggable.listeners?.onPointerDown;
      return onPointerDown ? { onPointerDown: onPointerDown as never } : {};
    }
    return {
      ...draggable.attributes,
      ...draggable.listeners,
      "aria-label": label,
    } as HTMLAttributes<HTMLElement>;
  }, [draggable.attributes, draggable.listeners, label, session.accessibilityMode]);

  return {
    activatorProps,
    isDragging: draggable.isDragging,
    isPlaceholder,
    setActivatorNodeRef: draggable.setActivatorNodeRef,
    setNodeRef: draggable.setNodeRef,
    sourceProps: isPlaceholder
      ? { "aria-hidden": true, "data-interaction-drag-placeholder": "" }
      : {},
  };
}
