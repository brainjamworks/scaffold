import { useDroppable } from "@dnd-kit/react";
import { useEffect, useId, useMemo } from "react";

import {
  createInteractionDragData,
  useInteractionDragSession,
  type InteractionDragRegistrationData,
} from "./InteractionDragSession";

export interface InteractionDropTargetRegistration<Data> {
  readonly data: Data;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label?: string;
}

export interface InteractionDropTargetResult {
  readonly isDropTarget: boolean;
  readonly targetRef: (element: Element | null) => void;
}

export function useInteractionDropTarget<Data>({
  data,
  disabled = false,
  id,
  label,
}: InteractionDropTargetRegistration<Data>): InteractionDropTargetResult {
  const session = useInteractionDragSession();
  const fallbackId = useId();
  const valid = id.trim().length > 0;
  const registration = useMemo<InteractionDragRegistrationData>(
    () => ({
      overData: data,
      ...(label?.trim() ? { label: label.trim() } : {}),
      source: false,
      target: true,
    }),
    [data, label],
  );
  const droppable = useDroppable({
    id: valid ? id : `invalid-interaction-drop-target:${fallbackId}`,
    data: createInteractionDragData(registration),
    disabled: disabled || !valid || !session.enabled,
    collisionDetector: session.collisionDetector,
  });

  useEffect(() => {
    if (import.meta.env.DEV && !valid) {
      console.error("Interaction drop targets require a non-empty id value.");
    }
  }, [valid]);

  return {
    isDropTarget: droppable.isDropTarget,
    targetRef: droppable.ref,
  };
}
