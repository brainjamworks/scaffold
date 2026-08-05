import { useDroppable } from "@dnd-kit/core";
import { useEffect, useId, useMemo, type HTMLAttributes } from "react";

import {
  INTERACTION_DRAG_REGISTRATION_DATA,
  useInteractionDragSessionAdapter,
  type InteractionDragRegistrationData,
} from "./InteractionDragSession";

export interface InteractionDropTargetRegistration<Data> {
  readonly data: Data;
  readonly disabled?: boolean;
  readonly id: string;
}

export interface InteractionDropTargetResult {
  readonly isOver: boolean;
  readonly setNodeRef: (element: HTMLElement | null) => void;
  readonly targetProps: HTMLAttributes<HTMLElement> & {
    readonly "data-interaction-drag-over"?: "";
  };
}

export function useInteractionDropTarget<Data>({
  data,
  disabled = false,
  id,
}: InteractionDropTargetRegistration<Data>): InteractionDropTargetResult {
  const session = useInteractionDragSessionAdapter();
  const fallbackId = useId();
  const valid = id.trim().length > 0;
  const registration = useMemo<InteractionDragRegistrationData>(
    () => ({ overData: data, source: false, target: true }),
    [data],
  );
  const droppable = useDroppable({
    id: valid ? id : `invalid-interaction-drop-target:${fallbackId}`,
    data: { [INTERACTION_DRAG_REGISTRATION_DATA]: registration },
    disabled: disabled || !valid || !session.enabled,
  });

  useEffect(() => {
    if (import.meta.env.DEV && !valid) {
      console.error("Interaction drop targets require a non-empty id value.");
    }
  }, [valid]);

  return {
    isOver: droppable.isOver,
    setNodeRef: droppable.setNodeRef,
    targetProps: droppable.isOver ? { "data-interaction-drag-over": "" } : {},
  };
}
