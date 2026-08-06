import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";
import { useId, type KeyboardEvent } from "react";

import {
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import { cn } from "@/lib/cn";
import { iconXs } from "@/ui/tokens/icon-sizes";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { useInteractionDragSource } from "@/editor/interactions/drag/react/use-interaction-drag-source";

import type { KeyboardMovementDirection } from "../prosemirror/commands";
import type { AuthoringMovementDragData } from "./EditorMovementLayer";
import { useMovementKeyboardContext } from "./movement-keyboard-context";
import { CONTAINED_MOVEMENT_HANDLE_ATTR } from "./movement-dom";
import "./movement-handles.css";

export interface ContainedMovementHandleProps {
  className?: string;
  getSourcePos?: () => number | null | undefined;
  label: string;
  sourceKey?: string | number | null;
  sourcePos: number | null | undefined;
}

export function ContainedMovementHandle({
  className,
  getSourcePos,
  label,
  sourceKey,
  sourcePos,
}: ContainedMovementHandleProps) {
  const disabled = !isValidSourcePos(sourcePos);
  const descriptionId = useId();
  const keyboardMovement = useMovementKeyboardContext();
  const draggableKey =
    sourceKey !== null && sourceKey !== undefined && sourceKey !== "" ? sourceKey : sourcePos;
  const accessibleLabel = `Move ${label} within its group`;
  const drag = useInteractionDragSource<AuthoringMovementDragData>({
    data: {
      containedMovement: true,
      ...(getSourcePos ? { getSourcePos } : {}),
      label,
      previewKind: "contained",
      sourcePos,
    },
    disabled,
    id: `scaffold-contained-movement-${draggableKey ?? "missing"}`,
    label: accessibleLabel,
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

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const direction = keyboardDirectionForKey(event.key);
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation();

    const liveSourcePos = resolveSourcePos();
    if (liveSourcePos === null) return;
    keyboardMovement?.moveContained(liveSourcePos, direction);
  };

  return (
    <InteractionDragActivationArea
      ref={drag.sourceRef}
      aria-describedby={descriptionId}
      aria-keyshortcuts="ArrowUp ArrowDown"
      aria-label={accessibleLabel}
      contentEditable={false}
      {...authoringChromeAttributes(AuthoringChromeKind.Handle)}
      data-contained-movement-pos={sourcePos ?? undefined}
      data-interaction-drag-placeholder={drag.isPlaceholder ? "" : undefined}
      data-no-select=""
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
      safeLocalHeight={44}
      safeLocalWidth={44}
      {...{ [CONTAINED_MOVEMENT_HANDLE_ATTR]: "" }}
      className={cn(
        "sc-contained-movement-handle",
        disabled && "sc-movement-handle--disabled",
        drag.isPlaceholder && "sc-movement-handle--placeholder",
        className,
      )}
    >
      <span id={descriptionId} className="sc-sr-only">
        Press Arrow Up or Arrow Down to move this {label} within its group.
      </span>
      <span aria-hidden className="sc-contained-movement-handle__visual">
        <DotsSixVertical size={iconXs} weight="bold" />
      </span>
    </InteractionDragActivationArea>
  );
}

function isValidSourcePos(pos: number | null | undefined): pos is number {
  return Number.isInteger(pos);
}

function keyboardDirectionForKey(key: string): KeyboardMovementDirection | null {
  if (key === "ArrowUp") return "backward";
  if (key === "ArrowDown") return "forward";
  return null;
}
