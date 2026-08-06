import { DragOverlay } from "@dnd-kit/core";
import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

import "./runtime-dnd.css";

export const RUNTIME_DRAG_SOURCE_PLACEHOLDER_CLASS = "sc-runtime-dnd-source--placeholder";

export const RUNTIME_DRAG_HANDLE_CLASS = "sc-runtime-dnd-handle";

const runtimeDragDropAnimation = {
  duration: 160,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

/** Neutral runtime motion preference shared by owner-rendered assessment DnD surfaces. */
export function useAssessmentDndReducedMotion(): boolean {
  const getPreference = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [reducedMotion, setReducedMotion] = useState(getPreference);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reducedMotion;
}

export function assessmentDndDropAnimationFor(reducedMotion: boolean) {
  return reducedMotion ? null : runtimeDragDropAnimation;
}

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
