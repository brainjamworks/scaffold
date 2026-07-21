export type MediaFitStrategy = "contain" | "width";

export interface MediaFitSize {
  height: number;
  width: number;
}

export interface ResolveMediaFitSizeInput {
  availableHeight: number;
  availableWidth: number;
  intrinsicHeight: number;
  intrinsicWidth: number;
  strategy: MediaFitStrategy;
}

export function resolveMediaFitSize({
  availableHeight,
  availableWidth,
  intrinsicHeight,
  intrinsicWidth,
  strategy,
}: ResolveMediaFitSizeInput): MediaFitSize | null {
  if (
    !isPositiveFinite(availableWidth) ||
    !isPositiveFinite(intrinsicHeight) ||
    !isPositiveFinite(intrinsicWidth)
  ) {
    return null;
  }

  const aspectRatio = intrinsicWidth / intrinsicHeight;
  if (strategy === "width") {
    return { height: availableWidth / aspectRatio, width: availableWidth };
  }

  if (!isPositiveFinite(availableHeight)) return null;

  const widthFromHeight = availableHeight * aspectRatio;
  return widthFromHeight < availableWidth
    ? { height: availableHeight, width: widthFromHeight }
    : { height: availableWidth / aspectRatio, width: availableWidth };
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
