import type { CSSProperties, ReactNode } from "react";

import type { SurfaceViewSettings } from "@/document/model/surface-view-settings";
import type { CourseMode } from "@/schemas/course-document";
import { SLIDESHOW_CANVAS_METRICS } from "@/editor/surfaces/view/slideshow-canvas";

import "./RuntimeSurfaceView.css";

export interface RuntimeSurfaceViewProps {
  children: ReactNode;
  settings: SurfaceViewSettings;
}

function runtimeSurfaceLabel(mode: CourseMode): string {
  if (mode === "page") return "Course content";
  if (mode === "slideshow") return "Slide canvas";
  if (mode === "branching") return "Screen canvas";
  return "Course content";
}

export function RuntimeSurfaceView({ children, settings }: RuntimeSurfaceViewProps) {
  const slideshowCanvasStyle =
    settings.mode === "slideshow" && settings.surfaceSize === "16x9"
      ? ({
          "--sc-slideshow-canvas-width": `${SLIDESHOW_CANVAS_METRICS.intrinsicWidth}px`,
          "--sc-slideshow-canvas-height": `${SLIDESHOW_CANVAS_METRICS.intrinsicHeight}px`,
        } as CSSProperties)
      : undefined;

  return (
    <section
      aria-label={runtimeSurfaceLabel(settings.mode)}
      className="scaffold-runtime-surface-view"
      data-course-mode={settings.mode}
      data-course-surface-view="runtime"
      data-overflow-mode={settings.overflowMode}
      data-surface-size={settings.surfaceSize}
      style={slideshowCanvasStyle}
    >
      {children}
    </section>
  );
}
