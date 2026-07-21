import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { SurfaceViewSettings } from "@/document/model/surface-view-settings";
import type { CourseMode } from "@/schemas/course-document";
import {
  deriveSlideshowCanvasScale,
  SLIDESHOW_CANVAS_METRICS,
} from "@/editor/surfaces/view/slideshow-canvas";

import "./AuthoringSurfaceView.css";

export interface AuthoringSurfaceViewProps {
  children: ReactNode;
  settings: SurfaceViewSettings;
}

function authoringSurfaceLabel(mode: CourseMode): string {
  if (mode === "slideshow") return "Slide canvas";
  if (mode === "branching") return "Screen canvas";
  return "Page canvas";
}

export function AuthoringSurfaceView({ children, settings }: AuthoringSurfaceViewProps) {
  const viewportRef = useRef<HTMLElement>(null);
  const [slideshowScale, setSlideshowScale] = useState(1);
  const isSlideshow = settings.mode === "slideshow" && settings.surfaceSize === "16x9";
  const slideshowCanvasStyle = isSlideshow
    ? ({
        "--sc-slideshow-canvas-width": `${SLIDESHOW_CANVAS_METRICS.intrinsicWidth}px`,
        "--sc-slideshow-canvas-height": `${SLIDESHOW_CANVAS_METRICS.intrinsicHeight}px`,
        "--sc-authoring-slide-scale": String(slideshowScale),
        "--sc-authoring-slide-rendered-width": `${SLIDESHOW_CANVAS_METRICS.intrinsicWidth * slideshowScale}px`,
        "--sc-authoring-slide-rendered-height": `${SLIDESHOW_CANVAS_METRICS.intrinsicHeight * slideshowScale}px`,
      } as CSSProperties)
    : undefined;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!isSlideshow || !viewport) return;

    const documentTop = viewport.getBoundingClientRect().top + window.scrollY;
    const editorRoot = viewport.closest<HTMLElement>(".sc-course-document-editor");
    const editorBottomInset = editorRoot
      ? Number.parseFloat(window.getComputedStyle(editorRoot).paddingBottom) || 0
      : 0;
    let availableWidth = viewport.clientWidth;

    const updateScale = () => {
      const availableHeight = window.innerHeight - documentTop - editorBottomInset;
      const next = deriveSlideshowCanvasScale(
        Math.min(availableWidth, SLIDESHOW_CANVAS_METRICS.intrinsicWidth),
        Math.min(availableHeight, SLIDESHOW_CANVAS_METRICS.intrinsicHeight),
      );
      if (next) setSlideshowScale(next.scale);
    };

    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect;
      if (!bounds) return;
      availableWidth = bounds.width;
      updateScale();
    });
    observer.observe(viewport);
    window.addEventListener("resize", updateScale);
    updateScale();

    return () => {
      window.removeEventListener("resize", updateScale);
      observer.disconnect();
    };
  }, [isSlideshow]);

  return (
    <section
      ref={viewportRef}
      aria-label={authoringSurfaceLabel(settings.mode)}
      className="scaffold-authoring-surface-view"
      data-course-mode={settings.mode}
      data-course-surface-view="authoring"
      {...(isSlideshow ? { "data-authoring-slide-scale": slideshowScale } : {})}
      data-overflow-mode={settings.overflowMode}
      data-surface-size={settings.surfaceSize}
      style={slideshowCanvasStyle}
    >
      {children}
    </section>
  );
}
