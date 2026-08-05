import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { iconXs } from "@/ui/tokens/icon-sizes";

import { useContainedMovementHandle } from "./use-contained-movement-handle";
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
  const movement = useContainedMovementHandle({
    sourcePos,
    ...(getSourcePos ? { getSourcePos } : {}),
    ...(sourceKey !== undefined ? { sourceKey } : {}),
  });

  return (
    <button
      {...movement.buttonProps}
      ref={movement.setHandleRef}
      aria-label={`Move ${label}`}
      className={cn(
        "sc-app-contained-movement-handle",
        movement.disabled && "sc-app-movement-handle--disabled",
        movement.isDragging && "sc-app-movement-handle--dragging",
        className,
      )}
    >
      <span id={movement.descriptionId} className="sc-sr-only">
        Press Arrow Up or Arrow Down to move this {label}.
      </span>
      <DotsSixVertical size={iconXs} weight="bold" aria-hidden />
    </button>
  );
}
