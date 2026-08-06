import { useDraggable } from "@dnd-kit/react";
import { useEffect, useId, useMemo } from "react";

import {
  createInteractionDragData,
  useInteractionDragSession,
  type InteractionDragRegistrationData,
} from "./InteractionDragSession";

export interface InteractionDragSourceRegistration<Data> {
  readonly data: Data;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: string;
}

export interface InteractionDragSourceResult {
  readonly handleRef: (element: Element | null) => void;
  readonly isDragging: boolean;
  readonly isPlaceholder: boolean;
  readonly sourceRef: (element: Element | null) => void;
}

export function useInteractionDragSource<Data>({
  data,
  disabled = false,
  id,
  label,
}: InteractionDragSourceRegistration<Data>): InteractionDragSourceResult {
  const session = useInteractionDragSession();
  const sourceRemoved = session.sourceRemoved;
  const fallbackId = useId();
  const valid = id.trim().length > 0 && label.trim().length > 0;
  const registration = useMemo<InteractionDragRegistrationData>(
    () => ({ activeData: data, label, source: true, target: false }),
    [data, label],
  );
  const draggable = useDraggable({
    id: valid ? id : `invalid-interaction-drag-source:${fallbackId}`,
    data: createInteractionDragData(registration),
    disabled: disabled || !valid || !session.enabled,
  });

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

  return {
    handleRef: draggable.handleRef,
    isDragging: draggable.isDragging,
    isPlaceholder: draggable.isDragSource,
    sourceRef: draggable.ref,
  };
}
