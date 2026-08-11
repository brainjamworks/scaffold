import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";
import { useId } from "react";

import {
  AuthoringChromeKind,
  AUTHORING_MOVE_HANDLE_ATTR,
  AUTHORING_MOVE_POS_ATTR,
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
  type AuthoringContainedMovementProjection,
} from "./authoring-movement-presentation";
import "./movement-handles.css";

export interface StructureMovementHandleProps {
  axis?: MovementTargetAxis;
  className?: string;
  getPresentationElement: () => HTMLElement | null;
  getSourcePos?: () => number | null | undefined;
  label: string;
  projection?: AuthoringContainedMovementProjection;
  sourceKey?: string | number | null;
  sourcePos: number | null | undefined;
  variant?: "pill" | "bare";
}

export function StructureMovementHandle({
  axis = "vertical",
  className,
  getPresentationElement,
  getSourcePos,
  label,
  projection,
  sourceKey,
  sourcePos,
  variant = "pill",
}: StructureMovementHandleProps) {
  const descriptionId = useId();
  const disabled = !Number.isInteger(sourcePos);
  const draggableKey =
    sourceKey !== null && sourceKey !== undefined && sourceKey !== "" ? sourceKey : sourcePos;
  const drag = useAuthoringMovementDragSource({
    axis,
    containedMovement: false,
    disabled,
    getPresentationElement,
    ...(getSourcePos ? { getSourcePos } : {}),
    id: `scaffold-structure-movement-${draggableKey ?? "missing"}`,
    label,
    ...(projection ? { projection } : {}),
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
      aria-label={`Move ${label}`}
      contentEditable={false}
      {...authoringChromeAttributes(AuthoringChromeKind.Handle)}
      {...authoringMovementSnapshotChromeAttributes()}
      {...{ [AUTHORING_MOVEMENT_ACTIVATION_ID_ATTR]: drag.activationId }}
      {...{ [AUTHORING_MOVE_HANDLE_ATTR]: "" }}
      {...{ [AUTHORING_MOVE_POS_ATTR]: sourcePos ?? undefined }}
      data-no-select=""
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      safeLocalHeight={44}
      safeLocalWidth={44}
      className={cn(
        "sc-app-structure-movement-handle",
        variant === "pill" && "sc-app-structure-movement-handle--pill",
        variant === "bare" &&
          "sc-app-structure-movement-handle--bare sc-app-compact-movement-handle",
        disabled && "sc-app-movement-handle--disabled",
        className,
      )}
    >
      <span id={descriptionId} className="sc-sr-only">
        Press Space or Enter to pick up this {label}. Use Arrow {backwardLabel} or Arrow{" "}
        {forwardLabel} to choose a destination. Press Space or Enter to drop, or Escape to cancel.
      </span>
      <span
        aria-hidden
        className={cn(
          "sc-app-structure-movement-handle__visual",
          variant === "bare" && "sc-app-compact-movement-handle__visual",
        )}
      >
        <DotsSixVertical size={iconXs} weight="bold" />
      </span>
    </InteractionDragActivationArea>
  );
}
