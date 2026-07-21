import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from "react";

import {
  resolveMediaFitSize,
  type MediaFitSize,
  type MediaFitStrategy,
} from "@/editor/media/model/media-fit-size";
import { cn } from "@/lib/cn";

export interface ImageHotspotNaturalSize {
  w: number;
  h: number;
}

export interface ImageHotspotCanvasSurfaceState {
  naturalSize: ImageHotspotNaturalSize | null;
  aspectRatio: number;
}

export type ImageHotspotFitStrategy = MediaFitStrategy;

interface ImageHotspotCanvasSurfaceProps {
  mode: "authoring" | "runtime";
  containerRef: RefObject<HTMLDivElement | null>;
  fitContainerRef?: RefObject<HTMLElement | null> | undefined;
  fitStrategy?: ImageHotspotFitStrategy | undefined;
  src: string;
  alt: string;
  ariaLabel: string;
  ariaDescribedBy?: string | undefined;
  className?: string | undefined;
  contentEditable?: boolean | undefined;
  role?: "group" | undefined;
  onSurfaceClick?: (
    event: MouseEvent<HTMLDivElement>,
    state: ImageHotspotCanvasSurfaceState,
  ) => void;
  onSurfacePointerDown?: (
    event: PointerEvent<HTMLDivElement>,
    state: ImageHotspotCanvasSurfaceState,
  ) => void;
  onSurfacePointerMove?: (
    event: PointerEvent<HTMLDivElement>,
    state: ImageHotspotCanvasSurfaceState,
  ) => void;
  onSurfacePointerUp?: (
    event: PointerEvent<HTMLDivElement>,
    state: ImageHotspotCanvasSurfaceState,
  ) => void;
  children?: (state: ImageHotspotCanvasSurfaceState) => ReactNode;
}

export function ImageHotspotCanvasSurface({
  alt,
  ariaDescribedBy,
  ariaLabel,
  children,
  className,
  containerRef,
  contentEditable,
  fitContainerRef,
  fitStrategy = "contain",
  mode,
  onSurfaceClick,
  onSurfacePointerDown,
  onSurfacePointerMove,
  onSurfacePointerUp,
  role = "group",
  src,
}: ImageHotspotCanvasSurfaceProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<ImageHotspotNaturalSize | null>(null);
  const [fitSize, setFitSize] = useState<MediaFitSize | null>(null);
  const state = useMemo<ImageHotspotCanvasSurfaceState>(() => {
    const aspectRatio = naturalSize && naturalSize.h > 0 ? naturalSize.w / naturalSize.h : 1;
    return { naturalSize, aspectRatio };
  }, [naturalSize]);
  const surfaceStyle = useMemo(
    () =>
      ({
        "--sc-image-hotspot-aspect-ratio": String(state.aspectRatio),
        aspectRatio: state.aspectRatio,
        ...(fitSize
          ? {
              height: `${fitSize.height}px`,
              width: `${fitSize.width}px`,
            }
          : {}),
      }) as CSSProperties,
    [fitSize, state.aspectRatio],
  );

  const onImageLoad = () => {
    if (!imgRef.current) return;
    setNaturalSize({
      w: imgRef.current.naturalWidth,
      h: imgRef.current.naturalHeight,
    });
  };

  useLayoutEffect(() => {
    const canvas = containerRef.current;
    const fitParent = fitContainerRef?.current ?? canvas?.parentElement;
    if (!canvas || !fitParent || !naturalSize || naturalSize.w <= 0 || naturalSize.h <= 0) {
      setFitSize(null);
      return undefined;
    }

    const commitFitSize = (width: number, height: number) => {
      setFitSize((current) => {
        if (
          current &&
          Math.abs(current.width - width) < 0.5 &&
          Math.abs(current.height - height) < 0.5
        ) {
          return current;
        }
        return { width, height };
      });
    };

    const updateFitSize = () => {
      // Use client dimensions, not getBoundingClientRect(). The slideshow may
      // apply a CSS transform to the slide, and bounding-box values are
      // post-transform whereas inline width/height are interpreted pre-transform.
      // clientWidth/clientHeight stay in the same layout coordinate system as
      // the style values we set on the surface.
      const nextSize = resolveMediaFitSize({
        availableHeight: fitParent.clientHeight,
        availableWidth: fitParent.clientWidth,
        intrinsicHeight: naturalSize.h,
        intrinsicWidth: naturalSize.w,
        strategy: fitStrategy,
      });
      if (!nextSize) {
        setFitSize(null);
        return;
      }
      commitFitSize(nextSize.width, nextSize.height);
    };

    updateFitSize();

    if (typeof ResizeObserver === "undefined") return undefined;
    const resizeObserver = new ResizeObserver(updateFitSize);
    resizeObserver.observe(fitParent);
    return () => resizeObserver.disconnect();
  }, [containerRef, fitContainerRef, fitStrategy, naturalSize]);

  return (
    <div
      ref={containerRef}
      role={role}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      data-image-hotspot-canvas-surface={mode}
      data-image-hotspot-fit={fitStrategy}
      className={cn("sc-image-hotspot-canvas", className)}
      contentEditable={contentEditable}
      style={surfaceStyle}
      onClick={onSurfaceClick ? (event) => onSurfaceClick(event, state) : undefined}
      onPointerDown={
        onSurfacePointerDown ? (event) => onSurfacePointerDown(event, state) : undefined
      }
      onPointerMove={
        onSurfacePointerMove ? (event) => onSurfacePointerMove(event, state) : undefined
      }
      onPointerUp={onSurfacePointerUp ? (event) => onSurfacePointerUp(event, state) : undefined}
      onPointerCancel={onSurfacePointerUp ? (event) => onSurfacePointerUp(event, state) : undefined}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        onLoad={onImageLoad}
        className="sc-image-hotspot-image"
      />
      {children?.(state)}
    </div>
  );
}
