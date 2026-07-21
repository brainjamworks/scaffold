import { useDraggable } from "@dnd-kit/core";
import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";

import {
  AuthoringChromeKind,
  AUTHORING_MOVE_HANDLE_ATTR,
  AUTHORING_MOVE_POS_ATTR,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import { cn } from "@/lib/cn";
import { iconXs } from "@/ui/tokens/icon-sizes";
import "./movement-handles.css";

export interface StructureMovementHandleProps {
  className?: string;
  getSourcePos?: () => number | null | undefined;
  label: string;
  sourceKey?: string | number | null;
  sourcePos: number | null | undefined;
  variant?: "pill" | "bare";
}

export function StructureMovementHandle({
  className,
  getSourcePos,
  label,
  sourceKey,
  sourcePos,
  variant = "pill",
}: StructureMovementHandleProps) {
  const disabled = !Number.isInteger(sourcePos);
  const draggableKey =
    sourceKey !== null && sourceKey !== undefined && sourceKey !== "" ? sourceKey : sourcePos;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef } = useDraggable({
    id: `scaffold-structure-movement-${draggableKey ?? "missing"}`,
    disabled,
    data: {
      getSourcePos,
      sourcePos,
    },
  });

  return (
    <button
      {...attributes}
      {...listeners}
      ref={(node) => {
        setNodeRef(node);
        setActivatorNodeRef(node);
      }}
      type="button"
      aria-label={`Move ${label}`}
      contentEditable={false}
      {...authoringChromeAttributes(AuthoringChromeKind.Handle)}
      {...{ [AUTHORING_MOVE_HANDLE_ATTR]: "" }}
      {...{ [AUTHORING_MOVE_POS_ATTR]: sourcePos ?? undefined }}
      data-no-select=""
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      className={cn(
        "sc-structure-movement-handle",
        variant === "pill" && "sc-structure-movement-handle--pill",
        variant === "bare" && "sc-structure-movement-handle--bare",
        disabled && "sc-movement-handle--disabled",
        isDragging && "sc-movement-handle--dragging",
        className,
      )}
    >
      <DotsSixVertical size={iconXs} weight="bold" aria-hidden />
    </button>
  );
}
