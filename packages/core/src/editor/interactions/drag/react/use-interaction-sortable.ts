import { useSortable } from "@dnd-kit/react/sortable";
import { useEffect, useId, useMemo } from "react";

import {
  createInteractionDragData,
  useInteractionDragSession,
  type InteractionDragRegistrationData,
} from "./InteractionDragSession";

export interface InteractionSortableRegistration<Data> {
  readonly data: Data;
  readonly disabled?: boolean;
  readonly id: string;
  readonly index: number;
  readonly label: string;
}

export interface InteractionSortableResult {
  readonly handleRef: (element: Element | null) => void;
  readonly isDragging: boolean;
  readonly isDropTarget: boolean;
  readonly isPlaceholder: boolean;
  readonly sourceRef: (element: Element | null) => void;
}

export function useInteractionSortable<Data>({
  data,
  disabled = false,
  id,
  index,
  label,
}: InteractionSortableRegistration<Data>): InteractionSortableResult {
  const session = useInteractionDragSession();
  const sourceRemoved = session.sourceRemoved;
  const fallbackId = useId();
  const valid = id.trim().length > 0 && label.trim().length > 0 && Number.isInteger(index);
  const registration = useMemo<InteractionDragRegistrationData>(
    () => ({ activeData: data, label, overData: data, source: true, target: true }),
    [data, label],
  );
  const sortable = useSortable({
    id: valid ? id : `invalid-interaction-sortable:${fallbackId}`,
    index: valid ? index : 0,
    data: createInteractionDragData(registration),
    disabled: disabled || !valid || !session.enabled,
    collisionDetector: session.collisionDetector,
    transition: session.reducedMotion ? null : { duration: 160, easing: "ease" },
  });

  useEffect(() => {
    if (import.meta.env.DEV && !valid) {
      console.error("Interaction sortables require non-empty id and label values and an index.");
    }
  }, [valid]);
  useEffect(
    () => () => {
      if (valid) sourceRemoved(id);
    },
    [id, sourceRemoved, valid],
  );

  return {
    handleRef: sortable.handleRef,
    isDragging: sortable.isDragging,
    isDropTarget: sortable.isDropTarget,
    isPlaceholder: sortable.isDragSource,
    sourceRef: sortable.ref,
  };
}
