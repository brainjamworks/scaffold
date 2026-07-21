import { DragOverlay } from "@dnd-kit/core";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import "./runtime-dnd.css";

export const RUNTIME_DRAG_SOURCE_PLACEHOLDER_CLASS = "sc-runtime-dnd-source--placeholder";

export const RUNTIME_DRAG_HANDLE_CLASS = "sc-runtime-dnd-handle";

const runtimeDragDropAnimation = {
  duration: 160,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

export function RuntimeDragOverlay({ children }: { children: ReactNode }) {
  return <DragOverlay dropAnimation={runtimeDragDropAnimation}>{children}</DragOverlay>;
}

export function RuntimeDragPreview({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("sc-runtime-dnd-preview", className)}>{children}</div>;
}
