import {
  ArrowLeftIcon as ArrowLeft,
  ArrowRightIcon as ArrowRight,
  CornersInIcon as CornersIn,
  CornersOutIcon as CornersOut,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";

import { IconButton } from "@/ui/components/IconButton/IconButton";
import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";
import { readSurfaceViewSettings } from "@/document/model/surface-view-settings";
import {
  deriveSlideshowCanvasScale,
  getSlideshowCanvasMetrics,
  type SlideshowCanvasMetrics,
  type SlideshowCanvasScaleState,
} from "@/editor/surfaces/view/slideshow-canvas";
import { iconMd } from "@/ui/tokens/icon-sizes";

import { CourseDocumentRuntimeRenderer } from "../../renderer/CourseDocumentRuntimeRenderer";
import type { SlideshowPlayerSizing } from "../player-types";
import { getSlideshowNavigationState, getSlideshowSurfaceStates } from "./slideshow-navigation";
import "./SlideshowPlayer.css";

interface EmbeddedStageStyle extends CSSProperties {
  "--sc-slideshow-stage-aspect-ratio": string;
}

export interface SlideshowPlayerProps {
  artifactId?: string | null;
  initialContent: JSONContent;
  surfaceIds: [string, ...string[]];
  sizing?: SlideshowPlayerSizing;
  onRendererReady?: (editor: TiptapEditor) => void;
}

export function SlideshowPlayer({
  artifactId,
  initialContent,
  surfaceIds,
  sizing = "contained",
  onRendererReady,
}: SlideshowPlayerProps) {
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [scaleState, setScaleState] = useState<SlideshowCanvasScaleState | null>(null);
  const [activeSurfaceId, setActiveSurfaceId] = useState(surfaceIds[0]);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [fullscreenPending, setFullscreenPending] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const navigation = getSlideshowNavigationState(surfaceIds, activeSurfaceId);
  const surfaceStates = getSlideshowSurfaceStates(surfaceIds, navigation.activeSurfaceId);
  const viewSettings = readSurfaceViewSettings(initialContent);
  const courseDocument = initialContent.content?.[0];
  const rawMode = courseDocument?.type === "courseDocument" ? courseDocument.attrs?.mode : null;
  const rawSurfaceSize =
    courseDocument?.type === "courseDocument" ? courseDocument.attrs?.surfaceSize : null;
  let metrics: SlideshowCanvasMetrics | null = null;
  let invalidStateMessage: string | null = null;

  if (rawMode === "slideshow") {
    try {
      metrics = getSlideshowCanvasMetrics(rawSurfaceSize);
    } catch (error) {
      invalidStateMessage = error instanceof Error ? error.message : "Invalid slideshow canvas.";
    }
  }

  if (!invalidStateMessage && !viewSettings) {
    invalidStateMessage = "Scaffold document is missing valid surface view settings.";
  } else if (!invalidStateMessage && viewSettings?.mode !== "slideshow") {
    invalidStateMessage = "Slideshow player requires slideshow document mode.";
  }

  useEffect(() => {
    if (!viewportElement) {
      return;
    }

    const ownerDocument = viewportElement.ownerDocument;
    const ownerWindow = ownerDocument.defaultView;
    const syncFullscreenState = () => {
      setIsFullscreen(ownerDocument.fullscreenElement === viewportElement);
    };
    setFullscreenAvailable(
      ownerWindow !== null &&
        viewportElement instanceof ownerWindow.HTMLElement &&
        ownerDocument.fullscreenEnabled === true &&
        typeof viewportElement.requestFullscreen === "function" &&
        typeof ownerDocument.exitFullscreen === "function",
    );
    syncFullscreenState();
    ownerDocument.addEventListener("fullscreenchange", syncFullscreenState);

    return () => {
      ownerDocument.removeEventListener("fullscreenchange", syncFullscreenState);
    };
  }, [viewportElement]);

  useEffect(() => {
    if (!viewportElement || !metrics) {
      return;
    }

    const measurementTarget =
      sizing === "embedded" && !isFullscreen ? stageRef.current : viewportElement;
    if (!measurementTarget) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const bounds = entries[0]?.contentRect;
      if (!bounds) {
        return;
      }

      const nextState = deriveSlideshowCanvasScale(bounds.width, bounds.height);
      if (nextState) {
        setScaleState(nextState);
      }
    });
    observer.observe(measurementTarget);

    return () => {
      observer.disconnect();
    };
  }, [isFullscreen, metrics, sizing, viewportElement]);

  const embeddedStageStyle: EmbeddedStageStyle | undefined =
    sizing === "embedded" && metrics
      ? {
          "--sc-slideshow-stage-aspect-ratio": String(metrics.aspectRatio),
        }
      : undefined;
  const shouldRenderStage =
    !invalidStateMessage && metrics !== null && (sizing === "embedded" || scaleState !== null);
  const overlayContainer = viewportElement
    ? isFullscreen
      ? viewportElement
      : viewportElement.ownerDocument.body
    : null;
  const overlayCollisionBoundary = isFullscreen ? viewportElement : null;

  const toggleFullscreen = async () => {
    if (!viewportElement || fullscreenPending) {
      return;
    }

    const ownerDocument = viewportElement.ownerDocument;
    if (ownerDocument.defaultView === null) {
      return;
    }

    setFullscreenPending(true);
    setFullscreenError(null);
    try {
      if (ownerDocument.fullscreenElement === viewportElement) {
        await ownerDocument.exitFullscreen();
      } else {
        await viewportElement.requestFullscreen();
      }
    } catch {
      setFullscreenError("Fullscreen could not be opened");
    } finally {
      setFullscreenPending(false);
    }
  };

  return (
    <div
      data-testid="slideshow-player"
      className="sc-slideshow-player"
      data-runtime-player="slideshow"
      data-slideshow-sizing={sizing}
    >
      <div ref={setViewportElement} className="sc-slideshow-player__viewport">
        {invalidStateMessage ? (
          <div role="alert" className="sc-slideshow-player__error">
            {invalidStateMessage}
          </div>
        ) : shouldRenderStage ? (
          <div
            ref={stageRef}
            className="sc-slideshow-player__stage"
            style={
              sizing === "embedded"
                ? isFullscreen && scaleState
                  ? {
                      ...embeddedStageStyle,
                      width: scaleState.renderedWidth,
                      height: scaleState.renderedHeight,
                    }
                  : embeddedStageStyle
                : { width: scaleState?.renderedWidth, height: scaleState?.renderedHeight }
            }
          >
            {metrics && scaleState ? (
              <>
                <div
                  className="sc-slideshow-player__canvas"
                  style={{
                    width: metrics.intrinsicWidth,
                    height: metrics.intrinsicHeight,
                    transform: `scale(${scaleState.scale})`,
                    transformOrigin: "top left",
                  }}
                >
                  <OverlayBoundary
                    collisionBoundary={overlayCollisionBoundary}
                    container={overlayContainer}
                    kind="viewport"
                  >
                    <CourseDocumentRuntimeRenderer
                      artifactId={artifactId ?? null}
                      initialContent={initialContent}
                      surfaceStates={surfaceStates}
                      {...(onRendererReady ? { onReady: onRendererReady } : {})}
                    />
                  </OverlayBoundary>
                </div>
                <div
                  className="sc-slideshow-player__chrome"
                  data-fullscreen-available={fullscreenAvailable}
                >
                  <div
                    data-testid="slideshow-controls"
                    className="sc-slideshow-player__controls"
                    data-fullscreen-available={fullscreenAvailable}
                  >
                    <span className="sc-slideshow-player__control-balance" aria-hidden />
                    <div
                      className="sc-slideshow-player__navigation"
                      role="group"
                      aria-label="Slide navigation"
                    >
                      <IconButton
                        className="sc-slideshow-player__nav-button"
                        variant="ghost"
                        size="md"
                        aria-label="Previous slide"
                        disabled={!navigation.canGoPrevious}
                        onClick={() => {
                          if (navigation.previousSurfaceId) {
                            setActiveSurfaceId(navigation.previousSurfaceId);
                          }
                        }}
                      >
                        <ArrowLeft size={iconMd} weight="bold" aria-hidden />
                      </IconButton>
                      <span
                        className="sc-slideshow-player__status"
                        role="status"
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {navigation.currentNumber} of {navigation.count}
                      </span>
                      <IconButton
                        className="sc-slideshow-player__nav-button"
                        variant="ghost"
                        size="md"
                        aria-label="Next slide"
                        disabled={!navigation.canGoNext}
                        onClick={() => {
                          if (navigation.nextSurfaceId) {
                            setActiveSurfaceId(navigation.nextSurfaceId);
                          }
                        }}
                      >
                        <ArrowRight size={iconMd} weight="bold" aria-hidden />
                      </IconButton>
                    </div>
                    <div
                      className="sc-slideshow-player__utilities"
                      role={fullscreenAvailable ? "group" : undefined}
                      aria-label={fullscreenAvailable ? "Slideshow view" : undefined}
                      aria-hidden={fullscreenAvailable ? undefined : true}
                    >
                      {fullscreenAvailable ? (
                        <IconButton
                          className="sc-slideshow-player__fullscreen-button"
                          variant="ghost"
                          size="md"
                          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                          aria-pressed={isFullscreen}
                          disabled={fullscreenPending}
                          onClick={() => void toggleFullscreen()}
                        >
                          {isFullscreen ? (
                            <CornersIn size={iconMd} aria-hidden />
                          ) : (
                            <CornersOut size={iconMd} aria-hidden />
                          )}
                        </IconButton>
                      ) : null}
                    </div>
                  </div>
                  {fullscreenError ? (
                    <span role="status" className="sc-sr-only">
                      {fullscreenError}
                    </span>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
