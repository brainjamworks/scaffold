export type SlideshowSurfaceSize = "16x9";

export interface SlideshowCanvasMetrics {
  readonly surfaceSize: SlideshowSurfaceSize;
  readonly intrinsicWidth: number;
  readonly intrinsicHeight: number;
  readonly aspectRatio: number;
}

export interface SlideshowCanvasScaleState {
  availableWidth: number;
  availableHeight: number;
  metrics: SlideshowCanvasMetrics;
  scale: number;
  renderedWidth: number;
  renderedHeight: number;
}

export const SLIDESHOW_CANVAS_METRICS: SlideshowCanvasMetrics = Object.freeze({
  surfaceSize: "16x9",
  intrinsicWidth: 1024,
  intrinsicHeight: 576,
  aspectRatio: 16 / 9,
});

export function getSlideshowCanvasMetrics(surfaceSize: unknown): SlideshowCanvasMetrics {
  if (surfaceSize !== SLIDESHOW_CANVAS_METRICS.surfaceSize) {
    throw new Error("Slideshow surface size must be 16x9.");
  }

  return SLIDESHOW_CANVAS_METRICS;
}

export function deriveSlideshowCanvasScale(
  availableWidth: number,
  availableHeight: number,
): SlideshowCanvasScaleState | null {
  if (
    !Number.isFinite(availableWidth) ||
    availableWidth <= 0 ||
    !Number.isFinite(availableHeight) ||
    availableHeight <= 0
  ) {
    return null;
  }

  const metrics = SLIDESHOW_CANVAS_METRICS;
  const scale = Math.min(
    availableWidth / metrics.intrinsicWidth,
    availableHeight / metrics.intrinsicHeight,
  );
  const renderedWidth = metrics.intrinsicWidth * scale;
  const renderedHeight = metrics.intrinsicHeight * scale;

  if (
    !Number.isFinite(scale) ||
    !Number.isFinite(renderedWidth) ||
    !Number.isFinite(renderedHeight)
  ) {
    return null;
  }

  return {
    availableWidth,
    availableHeight,
    metrics,
    scale,
    renderedWidth,
    renderedHeight,
  };
}
