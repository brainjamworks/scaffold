import {
  ArrowLeftIcon as ArrowLeft,
  ArrowRightIcon as ArrowRight,
  CornersInIcon as CornersIn,
  CornersOutIcon as CornersOut,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";

import { IconButton } from "@/ui/components/IconButton/IconButton";
import type {
  ProjectedSlideshowCourseStructure,
  SurfaceId,
} from "@/document/model/course-structure";
import { createScaledCanvasCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { InteractionDragEnvironmentProvider } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";
import { readSurfaceViewSettings } from "@/document/model/surface-view-settings";
import {
  deriveSlideshowCanvasScale,
  getSlideshowCanvasMetrics,
  SLIDESHOW_CANVAS_METRICS,
  type SlideshowCanvasMetrics,
  type SlideshowCanvasScaleState,
} from "@/editor/surfaces/view/slideshow-canvas";
import { CourseThemePortalBoundary } from "@/theme/course/CourseThemeProvider";
import { iconMd } from "@/ui/tokens/icon-sizes";

import {
  PreparedCourseDocumentRuntimeRenderer,
  type PreparedRuntimeDocument,
} from "../../renderer/CourseDocumentRuntimeRenderer";
import type { SlideshowPlayerSizing } from "../player-types";
import { CourseSectionNavigation } from "./CourseSectionNavigation";
import { getSlideshowNavigationState, getSlideshowSurfaceStates } from "./slideshow-navigation";
import { createRequestSurfaceChange } from "./slideshow-surface-change";
import type { SlideshowSurfaceRuntimeProgramSource } from "./slideshow-surface-runtime-composition";
import { createSurfaceExitEnvironment } from "./surface-exit-environment";
import { SurfaceExitEnvironmentProvider } from "./SurfaceExitEnvironmentProvider";
import { useSlideshowSurfaceRuntime } from "./use-slideshow-surface-runtime";
import "./SlideshowPlayer.css";

interface EmbeddedStageStyle extends CSSProperties {
  "--sc-slideshow-stage-aspect-ratio": string;
}

interface ScaledCanvasStyle extends CSSProperties {
  "--sc-slideshow-canvas-inverse-scale": number;
}

export interface SlideshowPlayerProps {
  artifactId?: string | null;
  preparedDocument: PreparedRuntimeDocument;
  structure: ProjectedSlideshowCourseStructure;
  sizing?: SlideshowPlayerSizing;
  surfaceRuntimeProgramSource?: SlideshowSurfaceRuntimeProgramSource;
  onRendererReady?: (editor: TiptapEditor) => void;
  onActiveSurfaceChange?: (surfaceId: SurfaceId | null) => void;
}

export function SlideshowPlayer({
  artifactId,
  preparedDocument,
  structure,
  sizing = "contained",
  surfaceRuntimeProgramSource,
  onRendererReady,
  onActiveSurfaceChange,
}: SlideshowPlayerProps) {
  const initialContent = preparedDocument.content;
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);
  const [scaleState, setScaleState] = useState<SlideshowCanvasScaleState | null>(null);
  const initialActiveSurfaceId = structure.surfaceIds[0] ?? null;
  const [activeSurfaceId, setActiveSurfaceId] = useState(initialActiveSurfaceId);
  const [runtimeEditorOwner, setRuntimeEditorOwner] = useState<{
    readonly preparedDocument: PreparedRuntimeDocument;
    readonly editor: TiptapEditor;
  } | null>(null);
  const runtimeEditor =
    runtimeEditorOwner?.preparedDocument === preparedDocument ? runtimeEditorOwner.editor : null;
  const [surfaceExitEnvironmentOwner] = useState(() =>
    createSurfaceExitEnvironment({
      knownSurfaceIds: structure.surfaceIds,
      activeSurfaceId: initialActiveSurfaceId,
    }),
  );
  const surfaceExitEnvironment = surfaceExitEnvironmentOwner.environment;
  const activeSurfaceIdRef = useRef(activeSurfaceId);
  const commitSurfaceChange = useCallback(
    (surfaceId: SurfaceId) => {
      surfaceExitEnvironmentOwner.setActiveSurfaceId(surfaceId);
      activeSurfaceIdRef.current = surfaceId;
      setActiveSurfaceId(surfaceId);
    },
    [surfaceExitEnvironmentOwner],
  );
  const requestSurfaceChange = useMemo(
    () =>
      createRequestSurfaceChange({
        environment: surfaceExitEnvironment,
        getActiveSurfaceId: () => activeSurfaceIdRef.current,
        isKnownSurfaceId: (surfaceId) => structure.surfaceById[surfaceId] !== undefined,
        commitSurfaceChange,
      }),
    [commitSurfaceChange, structure.surfaceById, surfaceExitEnvironment],
  );
  const surfaceRuntime = useSlideshowSurfaceRuntime({
    activeSurfaceId,
    editor: runtimeEditor,
    ...(surfaceRuntimeProgramSource === undefined
      ? {}
      : { programSource: surfaceRuntimeProgramSource }),
    requestSurfaceChange,
  });
  const handleRendererReady = useCallback(
    (editor: TiptapEditor) => {
      setRuntimeEditorOwner({ preparedDocument, editor });
      onRendererReady?.(editor);
    },
    [onRendererReady, preparedDocument],
  );
  const subscribeToSurfaceExit = useCallback(
    (listener: () => void) => surfaceExitEnvironment.subscribe(listener),
    [surfaceExitEnvironment],
  );
  const getSurfaceExitSnapshot = useCallback(
    () => surfaceExitEnvironment.getSnapshot(),
    [surfaceExitEnvironment],
  );
  const surfaceExitSnapshot = useSyncExternalStore(
    subscribeToSurfaceExit,
    getSurfaceExitSnapshot,
    getSurfaceExitSnapshot,
  );
  const surfaceNavigationDescriptionId = useId();
  const surfaceNavigationBlocked = surfaceExitSnapshot.status === "blocked";
  const surfaceNavigationAriaDescribedBy = surfaceNavigationBlocked
    ? surfaceNavigationDescriptionId
    : undefined;
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [fullscreenPending, setFullscreenPending] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const navigation = getSlideshowNavigationState(structure, activeSurfaceId);
  const nextRequestsSurfaceChange = surfaceRuntime.nextMode === "navigate";
  const nextMode =
    nextRequestsSurfaceChange && (surfaceNavigationBlocked || !navigation.canGoNext)
      ? "disabled"
      : surfaceRuntime.nextMode;
  const nextSurfaceNavigationAriaDescribedBy = nextRequestsSurfaceChange
    ? surfaceNavigationAriaDescribedBy
    : undefined;
  const surfaceStates = getSlideshowSurfaceStates(structure, navigation);
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
    onActiveSurfaceChange?.(navigation.activeSurfaceId);
  }, [navigation.activeSurfaceId, onActiveSurfaceChange]);

  useEffect(
    () => () => {
      surfaceExitEnvironmentOwner.dispose();
    },
    [surfaceExitEnvironmentOwner],
  );

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
  const overlayCollisionBoundary = viewportElement;
  const coordinateSpace = useMemo(
    () =>
      canvasElement
        ? createScaledCanvasCoordinateSpace({
            getRoot: () => canvasElement,
            ownerDocument: canvasElement.ownerDocument,
            localSize: {
              width: (metrics ?? SLIDESHOW_CANVAS_METRICS).intrinsicWidth,
              height: (metrics ?? SLIDESHOW_CANVAS_METRICS).intrinsicHeight,
            },
          })
        : null,
    [canvasElement, metrics],
  );

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
              <OverlayBoundary
                collisionBoundary={overlayCollisionBoundary}
                container={overlayContainer}
                hostBoundary={CourseThemePortalBoundary}
                kind="viewport"
              >
                <div
                  ref={setCanvasElement}
                  className="sc-slideshow-player__canvas"
                  style={
                    {
                      "--sc-slideshow-canvas-inverse-scale": 1 / scaleState.scale,
                      width: metrics.intrinsicWidth,
                      height: metrics.intrinsicHeight,
                      transform: `scale(${scaleState.scale})`,
                      transformOrigin: "top left",
                    } as ScaledCanvasStyle
                  }
                >
                  <InteractionDragEnvironmentProvider
                    coordinateRoot={canvasElement}
                    coordinateSpace={coordinateSpace}
                  >
                    <SurfaceExitEnvironmentProvider environment={surfaceExitEnvironment}>
                      <PreparedCourseDocumentRuntimeRenderer
                        artifactId={artifactId ?? null}
                        preparedDocument={preparedDocument}
                        surfaceStates={surfaceStates}
                        onReady={handleRendererReady}
                      />
                    </SurfaceExitEnvironmentProvider>
                  </InteractionDragEnvironmentProvider>
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
                    <div className="sc-slideshow-player__section-navigation">
                      <CourseSectionNavigation
                        currentCourseSection={navigation.currentCourseSection}
                        courseSectionItems={navigation.courseSectionItems}
                        disabled={surfaceNavigationBlocked}
                        {...(surfaceNavigationAriaDescribedBy
                          ? { ariaDescribedBy: surfaceNavigationAriaDescribedBy }
                          : {})}
                        onSelectSurface={(surfaceId) => {
                          requestSurfaceChange(surfaceId);
                        }}
                      />
                    </div>
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
                        aria-describedby={surfaceNavigationAriaDescribedBy}
                        disabled={!navigation.canGoPrevious || surfaceNavigationBlocked}
                        onClick={() => {
                          if (navigation.previousSurfaceId) {
                            requestSurfaceChange(navigation.previousSurfaceId);
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
                        {navigation.currentNumber === null
                          ? "No slides"
                          : `${navigation.currentNumber} of ${navigation.count}`}
                      </span>
                      <IconButton
                        className="sc-slideshow-player__nav-button"
                        variant="ghost"
                        size="md"
                        aria-label="Next slide"
                        aria-describedby={nextSurfaceNavigationAriaDescribedBy}
                        disabled={nextMode === "disabled"}
                        onClick={() => {
                          switch (nextMode) {
                            case "disabled":
                              return;
                            case "play": {
                              const session = surfaceRuntime.presentationSession;
                              if (!session) {
                                throw new Error(
                                  "Slideshow play mode requires a Presentation Session.",
                                );
                              }
                              session.play();
                              return;
                            }
                            case "advance": {
                              const session = surfaceRuntime.presentationSession;
                              if (!session) {
                                throw new Error(
                                  "Slideshow advance mode requires a Presentation Session.",
                                );
                              }
                              const result = session.advance();
                              if (result.isErr()) return;
                              return;
                            }
                            case "navigate":
                              if (navigation.nextSurfaceId) {
                                requestSurfaceChange(navigation.nextSurfaceId);
                              }
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
                    {surfaceNavigationBlocked ? (
                      <span id={surfaceNavigationDescriptionId} className="sc-sr-only">
                        Complete this quiz before moving to another slide.
                      </span>
                    ) : null}
                  </div>
                  {fullscreenError ? (
                    <span role="status" className="sc-sr-only">
                      {fullscreenError}
                    </span>
                  ) : null}
                </div>
              </OverlayBoundary>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
