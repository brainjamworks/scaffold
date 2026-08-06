import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";

import {
  AuthoringChromeKind,
  AUTHORING_MOVE_HANDLE_ATTR,
  AUTHORING_MOVE_POS_ATTR,
  authoringChromeAttributes,
} from "@/editor/interactions/dom/authoring-chrome";
import { cn } from "@/lib/cn";
import { iconXs } from "@/ui/tokens/icon-sizes";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { useInteractionDragSource } from "@/editor/interactions/drag/react/use-interaction-drag-source";
import type { AuthoringMovementDragData } from "./EditorMovementLayer";
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
  const drag = useInteractionDragSource<AuthoringMovementDragData>({
    data: {
      containedMovement: false,
      ...(getSourcePos ? { getSourcePos } : {}),
      label,
      previewKind: "block",
      sourcePos,
    },
    disabled,
    id: `scaffold-structure-movement-${draggableKey ?? "missing"}`,
    label: `Move ${label}`,
  });

  return (
    <InteractionDragActivationArea
      {...drag.activatorProps}
      {...drag.sourceProps}
      ref={(node) => {
        drag.setNodeRef(node);
        drag.setActivatorNodeRef(node);
      }}
      aria-label={`Move ${label}`}
      contentEditable={false}
      {...authoringChromeAttributes(AuthoringChromeKind.Handle)}
      {...{ [AUTHORING_MOVE_HANDLE_ATTR]: "" }}
      {...{ [AUTHORING_MOVE_POS_ATTR]: sourcePos ?? undefined }}
      data-no-select=""
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      safeLocalHeight={44}
      safeLocalWidth={44}
      className={cn(
        "sc-structure-movement-handle",
        variant === "pill" && "sc-structure-movement-handle--pill",
        variant === "bare" && "sc-structure-movement-handle--bare",
        disabled && "sc-movement-handle--disabled",
        drag.isPlaceholder && "sc-movement-handle--placeholder",
        className,
      )}
    >
      <span aria-hidden className="sc-structure-movement-handle__visual">
        <DotsSixVertical size={iconXs} weight="bold" />
      </span>
    </InteractionDragActivationArea>
  );
}
