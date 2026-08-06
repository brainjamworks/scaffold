import { useDraggable } from "@dnd-kit/core";
import {
  useEffect,
  useId,
  useMemo,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { createClientPoint } from "../model/coordinate-space";
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
    const dndPointerDown = draggable.listeners?.onPointerDown;
    const onPointerDown = dndPointerDown
      ? (event: ReactPointerEvent<HTMLElement>) => {
          const point = createClientPoint(event.clientX, event.clientY);
          if (point) session.pointerActivationStarted(id, point);
          dndPointerDown(event);
        }
      : undefined;
    if (session.accessibilityMode === "selection-alternative") {
      return onPointerDown ? { onPointerDown } : {};
    }
    return {
      ...draggable.attributes,
      ...draggable.listeners,
      ...(onPointerDown ? { onPointerDown } : {}),
      "aria-label": label,
    } as HTMLAttributes<HTMLElement>;
  }, [draggable.attributes, draggable.listeners, id, label, session]);

  return {
    activatorProps,
    isDragging: draggable.isDragging,
    isPlaceholder,
    setActivatorNodeRef: draggable.setActivatorNodeRef,
    setNodeRef: draggable.setNodeRef,
    sourceProps: isPlaceholder ? { "data-interaction-drag-placeholder": "" } : {},
  };
}
