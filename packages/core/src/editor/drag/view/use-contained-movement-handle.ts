import { useDraggable } from "@dnd-kit/core";
import { useId, type KeyboardEvent, type MouseEvent } from "react";

import {
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";

import type { KeyboardMovementDirection } from "../prosemirror/commands";
import { useMovementKeyboardContext } from "./movement-keyboard-context";
import { CONTAINED_MOVEMENT_HANDLE_ATTR } from "./movement-dom";

export interface ContainedMovementHandleBindingOptions {
  getSourcePos?: () => number | null | undefined;
  sourceKey?: string | number | null;
  sourcePos: number | null | undefined;
}

/** Neutral DnD/keyboard binding for owner-specific contained movement controls. */
export function useContainedMovementHandle({
  getSourcePos,
  sourceKey,
  sourcePos,
}: ContainedMovementHandleBindingOptions) {
  const disabled = !isValidSourcePos(sourcePos);
  const descriptionId = useId();
  const keyboardMovement = useMovementKeyboardContext();
  const draggableKey =
    sourceKey !== null && sourceKey !== undefined && sourceKey !== "" ? sourceKey : sourcePos;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useDraggable({
    id: `scaffold-contained-movement-${draggableKey ?? "missing"}`,
    disabled,
    data: {
      containedMovement: true,
      getSourcePos,
      sourcePos,
    },
  });

  const resolveSourcePos = () => {
    if (getSourcePos) {
      try {
        const resolved = getSourcePos();
        if (isValidSourcePos(resolved)) return resolved;
      } catch {
        // NodeViews can be disposed during transactions. Fall back to the
        // rendered position so the keyboard command fails gracefully.
      }
    }

    return isValidSourcePos(sourcePos) ? sourcePos : null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = keyboardDirectionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();

    const liveSourcePos = resolveSourcePos();
    if (liveSourcePos === null) return;
    keyboardMovement?.moveContained(liveSourcePos, direction);
  };

  const setHandleRef = (node: HTMLButtonElement | null) => {
    setNodeRef(node);
    setActivatorNodeRef(node);
  };

  return {
    buttonProps: {
      ...attributes,
      ...listeners,
      type: "button" as const,
      "aria-describedby": descriptionId,
      "aria-keyshortcuts": "ArrowUp ArrowDown",
      contentEditable: false,
      ...authoringChromeAttributes(AuthoringChromeKind.Handle),
      "data-contained-movement-pos": sourcePos ?? undefined,
      "data-no-select": "",
      disabled,
      onMouseDown: (event: MouseEvent<HTMLButtonElement>) => event.preventDefault(),
      onKeyDown,
      [CONTAINED_MOVEMENT_HANDLE_ATTR]: "",
    },
    description: "Press Arrow Up or Arrow Down to move this item.",
    descriptionId,
    disabled,
    isDragging,
    setHandleRef,
  };
}

function isValidSourcePos(pos: number | null | undefined): pos is number {
  return Number.isInteger(pos);
}

function keyboardDirectionForKey(key: string): KeyboardMovementDirection | null {
  if (key === "ArrowUp") return "backward";
  if (key === "ArrowDown") return "forward";
  return null;
}
