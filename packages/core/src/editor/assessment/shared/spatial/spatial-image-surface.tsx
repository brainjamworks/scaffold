import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from "react";

import {
  resolveMediaFitSize,
  type MediaFitSize,
  type MediaFitStrategy,
} from "@/editor/media/model/media-fit-size";

export interface SpatialImageNaturalSize {
  readonly width: number;
  readonly height: number;
}

export interface SpatialImagePoint {
  readonly x: number;
  readonly y: number;
}

export type SpatialImagePresentationStatus = "empty" | "loading" | "ready" | "unavailable";

export interface SpatialImageSurfaceState {
  readonly status: SpatialImagePresentationStatus;
  readonly naturalSize: SpatialImageNaturalSize | null;
  readonly aspectRatio: number;
  readonly imageElement: HTMLImageElement | null;
  readonly pointFromClient: (point: SpatialImagePoint) => SpatialImagePoint | null;
}

export type SpatialImageFitStrategy = MediaFitStrategy;

export interface SpatialImageSurfaceProps {
  readonly src: string | null;
  readonly alt: string;
  readonly aspectRatioCssProperty?: `--${string}` | undefined;
  /** Overlays anchored on edge points (markers, badges, labels) need to
      spill past the image box; authoring keeps the default clip. */
  readonly overlayOverflow?: "hidden" | "visible" | undefined;
  readonly fitContainerRef?: RefObject<HTMLElement | null> | undefined;
  readonly fitStrategy?: SpatialImageFitStrategy | undefined;
  readonly className?: string | undefined;
  readonly imageClassName?: string | undefined;
  readonly surfaceProps?:
    | Omit<HTMLAttributes<HTMLDivElement>, "children" | "className" | "style">
    | undefined;
  readonly onImageLoad?: ((naturalSize: SpatialImageNaturalSize) => void) | undefined;
  readonly onImageError?: (() => void) | undefined;
  readonly children?: ((state: SpatialImageSurfaceState) => ReactNode) | undefined;
}

export const SpatialImageSurface = forwardRef<HTMLDivElement, SpatialImageSurfaceProps>(
  function SpatialImageSurface(
    {
      alt,
      aspectRatioCssProperty,
      children,
      className,
      fitContainerRef,
      fitStrategy = "contain",
      imageClassName,
      onImageError,
      onImageLoad,
      overlayOverflow = "hidden",
      src,
      surfaceProps,
    },
    forwardedRef,
  ) {
    const surfaceRef = useRef<HTMLDivElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);
    const [status, setStatus] = useState<SpatialImagePresentationStatus>(
      src ? "loading" : "empty",
    );
    const [naturalSize, setNaturalSize] = useState<SpatialImageNaturalSize | null>(null);
    const [fitSize, setFitSize] = useState<MediaFitSize | null>(null);

    const setSurfaceRef = useCallback(
      (element: HTMLDivElement | null) => {
        surfaceRef.current = element;
        assignRef(forwardedRef, element);
      },
      [forwardedRef],
    );

    useLayoutEffect(() => {
      setNaturalSize(null);
      setFitSize(null);
      setStatus(src ? "loading" : "empty");
    }, [src]);

    const pointFromClient = useCallback(
      (point: SpatialImagePoint): SpatialImagePoint | null => {
        if (
          status !== "ready" ||
          !Number.isFinite(point.x) ||
          !Number.isFinite(point.y) ||
          !surfaceRef.current
        ) {
          return null;
        }
        const rect = surfaceRef.current.getBoundingClientRect();
        return clientPointToNormalizedImagePoint(point, rect);
      },
      [status],
    );

    const state = useMemo<SpatialImageSurfaceState>(() => {
      const aspectRatio = naturalSize ? naturalSize.width / naturalSize.height : 1;
      return {
        status,
        naturalSize,
        aspectRatio,
        imageElement: status === "ready" ? imageRef.current : null,
        pointFromClient,
      };
    }, [naturalSize, pointFromClient, status]);

    useLayoutEffect(() => {
      const surface = surfaceRef.current;
      const fitContainer = fitContainerRef?.current ?? surface?.parentElement;
      if (!surface || !fitContainer || status !== "ready" || !naturalSize) {
        setFitSize(null);
        return undefined;
      }

      const updateFitSize = () => {
        const style = getComputedStyle(fitContainer);
        const horizontalPadding = finiteCssLength(style.paddingLeft) + finiteCssLength(style.paddingRight);
        const verticalPadding = finiteCssLength(style.paddingTop) + finiteCssLength(style.paddingBottom);
        const nextSize = resolveMediaFitSize({
          availableHeight: Math.max(0, fitContainer.clientHeight - verticalPadding),
          availableWidth: Math.max(0, fitContainer.clientWidth - horizontalPadding),
          intrinsicHeight: naturalSize.height,
          intrinsicWidth: naturalSize.width,
          strategy: fitStrategy,
        });
        setFitSize((current) => (sameFitSize(current, nextSize) ? current : nextSize));
      };

      updateFitSize();
      if (typeof ResizeObserver === "undefined") return undefined;
      const observer = new ResizeObserver(updateFitSize);
      observer.observe(fitContainer);
      return () => observer.disconnect();
    }, [fitContainerRef, fitStrategy, naturalSize, status]);

    const handleImageLoad = () => {
      const image = imageRef.current;
      if (!image) return;
      const nextNaturalSize = {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
      if (!isPositiveFinite(nextNaturalSize.width) || !isPositiveFinite(nextNaturalSize.height)) {
        setNaturalSize(null);
        setStatus("unavailable");
        onImageError?.();
        return;
      }
      setNaturalSize(nextNaturalSize);
      setStatus("ready");
      onImageLoad?.(nextNaturalSize);
    };

    const handleImageError = () => {
      setNaturalSize(null);
      setStatus("unavailable");
      onImageError?.();
    };

    const surfaceStyle = {
      ...(aspectRatioCssProperty
        ? { [aspectRatioCssProperty]: String(state.aspectRatio) }
        : {}),
      aspectRatio: state.aspectRatio,
      overflow: overlayOverflow,
      position: "relative",
      ...(fitSize
        ? {
            height: `${fitSize.height}px`,
            width: `${fitSize.width}px`,
          }
        : {}),
    } satisfies CSSProperties;

    return (
      <div
        {...surfaceProps}
        ref={setSurfaceRef}
        className={className}
        data-spatial-image-overlay=""
        data-spatial-image-surface=""
        data-spatial-image-surface-state={status}
        data-spatial-image-fit={fitStrategy}
        style={surfaceStyle}
      >
        {src ? (
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            className={imageClassName}
            draggable={false}
            onLoad={handleImageLoad}
            onError={handleImageError}
            style={{ display: "block", height: "100%", objectFit: "contain", width: "100%" }}
          />
        ) : null}
        {children?.(state)}
      </div>
    );
  },
);

export function normalizedPointToOverlayStyle(point: SpatialImagePoint): Readonly<{
  left: string;
  top: string;
}> {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("Expected a finite normalized image point.");
  }
  if (point.x < 0 || point.x > 100 || point.y < 0 || point.y > 100) {
    throw new Error("Expected a normalized image point within the image bounds.");
  }
  return { left: `${point.x}%`, top: `${point.y}%` };
}

export function clientPointToNormalizedImagePoint(
  point: SpatialImagePoint,
  rect: Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">,
): SpatialImagePoint | null {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    point.x < rect.left ||
    point.x > rect.right ||
    point.y < rect.top ||
    point.y > rect.bottom
  ) {
    return null;
  }
  return {
    x: clampPercent(((point.x - rect.left) / rect.width) * 100),
    y: clampPercent(((point.y - rect.top) / rect.height) * 100),
  };
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

function finiteCssLength(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sameFitSize(current: MediaFitSize | null, next: MediaFitSize | null): boolean {
  if (current === next) return true;
  return Boolean(
    current &&
      next &&
      Math.abs(current.width - next.width) < 0.5 &&
      Math.abs(current.height - next.height) < 0.5,
  );
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}
