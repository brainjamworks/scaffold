import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";
import { useId } from "react";

import {
  AuthoringChromeKind,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import { cn } from "@/lib/cn";
import { iconXs } from "@/ui/tokens/icon-sizes";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";

import type { MovementTargetAxis } from "../model/movement-target";
import {
  AUTHORING_MOVEMENT_ACTIVATION_ID_ATTR,
  authoringMovementSnapshotChromeAttributes,
  useAuthoringMovementDragSource,
} from "./authoring-movement-presentation";
import { CONTAINED_MOVEMENT_HANDLE_ATTR } from "./movement-dom";
import "./movement-handles.css";

export interface ContainedMovementHandleProps {
  axis?: MovementTargetAxis;
  className?: string;
  getPresentationElement: () => HTMLElement | null;
  getSourcePos?: () => number | null | undefined;
  label: string;
  sourceKey?: string | number | null;
  sourcePos: number | null | undefined;
}

export function ContainedMovementHandle({
  axis = "vertical",
  className,
  getPresentationElement,
  getSourcePos,
  label,
  sourceKey,
  sourcePos,
}: ContainedMovementHandleProps) {
  const disabled = !isValidSourcePos(sourcePos);
  const descriptionId = useId();
  const draggableKey =
    sourceKey !== null && sourceKey !== undefined && sourceKey !== "" ? sourceKey : sourcePos;
  const accessibleLabel = `Move ${label} within its group`;
  const drag = useAuthoringMovementDragSource({
    axis,
    containedMovement: true,
    disabled,
    getPresentationElement,
    ...(getSourcePos ? { getSourcePos } : {}),
    id: `scaffold-contained-movement-${draggableKey ?? "missing"}`,
    label,
    sourcePos,
  });

  const backwardKey = axis === "horizontal" ? "ArrowLeft" : "ArrowUp";
  const forwardKey = axis === "horizontal" ? "ArrowRight" : "ArrowDown";
  const backwardLabel = axis === "horizontal" ? "Left" : "Up";
  const forwardLabel = axis === "horizontal" ? "Right" : "Down";

  return (
    <InteractionDragActivationArea
      ref={drag.handleRef}
      aria-describedby={descriptionId}
      aria-keyshortcuts={`Space Enter ${backwardKey} ${forwardKey} Escape`}
      aria-label={accessibleLabel}
      contentEditable={false}
      {...authoringChromeAttributes(AuthoringChromeKind.Handle)}
      {...authoringMovementSnapshotChromeAttributes()}
      {...{ [AUTHORING_MOVEMENT_ACTIVATION_ID_ATTR]: drag.activationId }}
      data-contained-movement-pos={sourcePos ?? undefined}
      data-no-select=""
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      safeLocalHeight={44}
      safeLocalWidth={44}
      {...{ [CONTAINED_MOVEMENT_HANDLE_ATTR]: "" }}
      className={cn(
        "sc-contained-movement-handle",
        disabled && "sc-movement-handle--disabled",
        className,
      )}
    >
      <span id={descriptionId} className="sc-sr-only">
        Press Space or Enter to pick up this {label}. Use Arrow {backwardLabel} or Arrow{
        " "}
        {forwardLabel} to choose a destination within its group. Press Space or Enter to drop, or
        Escape to cancel.
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
