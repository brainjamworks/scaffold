import { useDraggable } from "@dnd-kit/react";
import { useEffect, useId, useMemo } from "react";

import type { DragKeyboardAxis } from "../model/interaction-drag-event";

import {
  createInteractionDragData,
  useInteractionDragSession,
  type InteractionDragRegistrationData,
} from "./InteractionDragSession";

export interface InteractionDragSourceRegistration<Data> {
  readonly data: Data;
  readonly disabled?: boolean;
  readonly id: string;
  readonly keyboardAxis?: DragKeyboardAxis;
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
  keyboardAxis,
  label,
}: InteractionDragSourceRegistration<Data>): InteractionDragSourceResult {
  const session = useInteractionDragSession();
  const sourceRemoved = session.sourceRemoved;
  const fallbackId = useId();
  const valid = id.trim().length > 0 && label.trim().length > 0;
  const registration = useMemo<InteractionDragRegistrationData>(
    () => ({
      activeData: data,
      ...(keyboardAxis ? { keyboardAxis } : {}),
      label,
      source: true,
      target: false,
    }),
    [data, keyboardAxis, label],
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
