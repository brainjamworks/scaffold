import {
  ArrowLeftIcon as ArrowLeft,
  ArrowRightIcon as ArrowRight,
  CheckCircleIcon as CheckCircle,
  CornersInIcon as CornersIn,
  CornersOutIcon as CornersOut,
  CursorClickIcon as CursorClick,
  PauseIcon as Pause,
  PlayIcon as Play,
} from "@phosphor-icons/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { Editor as TiptapEditor } from "@tiptap/core";
import type { EmbeddedNodeId } from "@scaffold/contracts";

import { IconButton } from "@/ui/components/IconButton/IconButton";
import type {
  ProjectedSlideshowCourseStructure,
  SurfaceId,
} from "@/document/model/course-structure";
import { createScaledCanvasCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { replaceLayoutFeatureViewStateForOwners } from "@/editor/arrangements/layout/shared/model/layout-interaction-store";
import { getControlBindingRegistryForEditor } from "@/document/control-binding";
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
import { iconLg, iconMd } from "@/ui/tokens/icon-sizes";
import type { PresentationMotionMode, PresentationPreviewPlaybackPort } from "@/presentation/model";
import type { LearnerInteractionPreviewReportsPort } from "@/learner-interaction/model";

import {
  PreparedCourseDocumentRuntimeRenderer,
  type PreparedRuntimeDocument,
} from "../../renderer/CourseDocumentRuntimeRenderer";
import type { SlideshowPlayerSizing } from "../player-types";
import { CourseSectionNavigation } from "./CourseSectionNavigation";
import {
  createSlideshowSurfaceTransitionState,
  getSlideshowNavigationState,
  getSlideshowSurfaceStates,
  type SlideshowSurfaceTransitionState,
} from "./slideshow-navigation";
import {
  presentSurfaceTransition,
  type SurfaceTransitionPresentation,
} from "./slideshow-surface-transition-presenter";
import { createPresentationPreviewPlaybackPort } from "./create-presentation-preview-playback-port";
import { createRequestSurfaceChange, type SurfaceExitPolicy } from "./slideshow-surface-change";
import type {
  SlideshowPresentationNarrationError,
  SlideshowSurfaceRuntimeProgramSource,
} from "./slideshow-surface-runtime-composition";
import { createSurfaceExitEnvironment } from "./surface-exit-environment";
import { getSurfaceExitGuidance } from "./surface-exit-guidance";
import { SurfaceExitEnvironmentProvider } from "./SurfaceExitEnvironmentProvider";
import {
  useSlideshowSurfaceRuntime,
  type SlideshowContentInteraction,
} from "./use-slideshow-surface-runtime";
import "./SlideshowPlayer.css";

interface EmbeddedStageStyle extends CSSProperties {
  "--sc-slideshow-stage-aspect-ratio": string;
}

interface ScaledCanvasStyle extends CSSProperties {
  "--sc-slideshow-canvas-inverse-scale": number;
}

interface SlideshowOverlayOwnership {
  readonly instanceId: string;
  readonly contentInteraction: "enabled" | "inert";
}

const SlideshowOverlayOwnershipContext = createContext<SlideshowOverlayOwnership | null>(null);

function SlideshowContentOverlayHostBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const ownership = useSlideshowOverlayOwnership();
  return (
    <CourseThemePortalBoundary>
      <div
        data-slideshow-overlay-owner="content"
        data-slideshow-overlay-instance={ownership.instanceId}
        data-content-interaction={ownership.contentInteraction}
        inert={ownership.contentInteraction === "inert"}
      >
        {children}
      </div>
    </CourseThemePortalBoundary>
  );
}

function SlideshowChromeOverlayHostBoundary({ children }: Readonly<{ children: ReactNode }>) {
  const ownership = useSlideshowOverlayOwnership();
  return (
    <CourseThemePortalBoundary>
      <div
        data-slideshow-overlay-owner="chrome"
        data-slideshow-overlay-instance={ownership.instanceId}
      >
        {children}
      </div>
    </CourseThemePortalBoundary>
  );
}

function useSlideshowOverlayOwnership(): SlideshowOverlayOwnership {
  const ownership = useContext(SlideshowOverlayOwnershipContext);
  if (!ownership) throw new Error("Slideshow overlay host rendered without its owner context.");
  return ownership;
}

export interface SlideshowPlayerProps {
  artifactId?: string | null;
  preparedDocument: PreparedRuntimeDocument;
  structure: ProjectedSlideshowCourseStructure;
  sizing?: SlideshowPlayerSizing;
  surfaceExitPolicy?: SurfaceExitPolicy;
  surfaceRuntimeProgramSource?: SlideshowSurfaceRuntimeProgramSource;
  /** Public learner playback defaults to authored auto-start; Author Preview disables it. */
  autoPlayPresentation?: boolean;
  onRendererReady?: (editor: TiptapEditor) => void;
  onActiveSurfaceChange?: (surfaceId: SurfaceId | null) => void;
  /** Author Preview asks its Session to prepare a Surface before the player commits it. */
  onAuthorPreviewSurfaceChangeRequest?: (surfaceId: SurfaceId) => void;
  initialSurfaceId?: SurfaceId;
  /** Author Preview keeps its retained runtime visible but inert while replacement is pending. */
  authorPreviewExecutionEnabled?: boolean;
  onPresentationPreviewPortChange?: (port: PresentationPreviewPlaybackPort | null) => void;
  onLearnerInteractionReportsPortChange?: (
    port: LearnerInteractionPreviewReportsPort | null,
  ) => void;
}

export function SlideshowPlayer({
  artifactId,
  preparedDocument,
  structure,
  sizing = "contained",
  surfaceExitPolicy = "enforce",
  surfaceRuntimeProgramSource,
  autoPlayPresentation = true,
  onRendererReady,
  onActiveSurfaceChange,
  onAuthorPreviewSurfaceChangeRequest,
  initialSurfaceId,
  authorPreviewExecutionEnabled = true,
  onPresentationPreviewPortChange,
  onLearnerInteractionReportsPortChange,
}: SlideshowPlayerProps) {
  const initialContent = preparedDocument.content;
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [canvasElement, setCanvasElement] = useState<HTMLDivElement | null>(null);
  const [scaleState, setScaleState] = useState<SlideshowCanvasScaleState | null>(null);
  if (initialSurfaceId && structure.surfaceById[initialSurfaceId] === undefined) {
    throw new Error(`Author Preview Surface "${initialSurfaceId}" is not in the Slideshow.`);
  }
  const initialActiveSurfaceId = initialSurfaceId ?? structure.surfaceIds[0] ?? null;
  const [activeSurfaceId, setActiveSurfaceId] = useState(initialActiveSurfaceId);
  const authorPreviewSurfaceSynchronized =
    initialSurfaceId === undefined || activeSurfaceId === initialSurfaceId;
  const runtimeExecutionEnabled = authorPreviewExecutionEnabled && authorPreviewSurfaceSynchronized;
  const [runtimeEditorOwner, setRuntimeEditorOwner] = useState<{
    readonly preparedDocument: PreparedRuntimeDocument;
    readonly editor: TiptapEditor;
  } | null>(null);
  const runtimeEditor =
    runtimeEditorOwner?.preparedDocument === preparedDocument ? runtimeEditorOwner.editor : null;
  const featureViewBaseline = useMemo(
    () =>
      Object.freeze({
        replaceForOwners(
          ownerIds: readonly EmbeddedNodeId[],
          { signal }: { readonly signal: AbortSignal },
        ) {
          if (!runtimeEditor) {
            throw new Error("Cannot replace Slideshow feature view without its runtime Editor.");
          }
          signal.throwIfAborted();
          replaceLayoutFeatureViewStateForOwners(runtimeEditor, ownerIds);
          const ownerWindow = runtimeEditor.view.dom.ownerDocument.defaultView;
          if (!ownerWindow) {
            throw new Error("Cannot commit Slideshow feature baseline without an owner Window.");
          }
          const controlBindings = getControlBindingRegistryForEditor(runtimeEditor);
          return new Promise<void>((resolve) => {
            let frame = 0;
            let settled = false;
            let cancelReadiness: () => void = () => undefined;
            const settle = () => {
              if (settled) return;
              settled = true;
              ownerWindow.cancelAnimationFrame(frame);
              cancelReadiness();
              signal.removeEventListener("abort", settle);
              resolve();
            };
            const check = () => {
              if (signal.aborted) {
                settle();
                return;
              }
              const cancel = controlBindings.notifyWhenOwnersMounted(ownerIds, settle);
              if (settled) cancel();
              else cancelReadiness = cancel;
            };
            signal.addEventListener("abort", settle, { once: true });
            frame = ownerWindow.requestAnimationFrame(check);
            if (signal.aborted) settle();
          });
        },
      }),
    [runtimeEditor],
  );
  const [surfaceExitEnvironmentOwner] = useState(() =>
    createSurfaceExitEnvironment({
      knownSurfaceIds: structure.surfaceIds,
      activeSurfaceId: initialActiveSurfaceId,
    }),
  );
  const pendingSurfaceExitEnvironmentDisposal = useRef<ReturnType<typeof setTimeout> | null>(null);
  const surfaceExitEnvironment = surfaceExitEnvironmentOwner.environment;
  const activeSurfaceIdRef = useRef(activeSurfaceId);
  const [surfaceTransition, setSurfaceTransition] =
    useState<SlideshowSurfaceTransitionState | null>(null);
  const surfaceTransitionPresentation = useRef<SurfaceTransitionPresentation | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  /**
   * The one lifecycle behind every accepted Surface change. The destination becomes the runtime
   * authority immediately (the outgoing composition disposes, freezing its Session; the incoming
   * composition mounts at its initial checkpoint and is held there). When the destination owns an
   * animated transition and motion is allowed, both real Surface roots paint as inert layers until
   * the pair settles; Cut settles at once. A new accepted request settles the active pair first.
   */
  const commitSurfaceChange = useCallback(
    (surfaceId: SurfaceId) => {
      const sourceSurfaceId = activeSurfaceIdRef.current;
      surfaceTransitionPresentation.current?.settle();
      const destinationTransition =
        surfaceRuntimeProgramSource?.(surfaceId)?.presentation?.timeline.transition ?? undefined;
      const nextTransition =
        sourceSurfaceId !== null && canvasElement !== null
          ? createSlideshowSurfaceTransitionState({
              structure,
              sourceSurfaceId,
              destinationSurfaceId: surfaceId,
              transition: destinationTransition,
              motionMode: resolveSlideshowMotionMode(canvasElement),
            })
          : null;
      surfaceExitEnvironmentOwner.setActiveSurfaceId(surfaceId);
      activeSurfaceIdRef.current = surfaceId;
      setActiveSurfaceId(surfaceId);
      setSurfaceTransition(nextTransition);
    },
    [canvasElement, structure, surfaceExitEnvironmentOwner, surfaceRuntimeProgramSource],
  );
  useLayoutEffect(() => {
    if (!surfaceTransition || !canvasElement) return;
    const outgoingRoot = resolveSurfaceRoot(canvasElement, surfaceTransition.sourceSurfaceId);
    const incomingRoot = resolveSurfaceRoot(canvasElement, surfaceTransition.destinationSurfaceId);
    if (!outgoingRoot || !incomingRoot) {
      // Without both real roots there is nothing to paint; settle to the destination at once.
      setSurfaceTransition(null);
      return;
    }
    const presentation = presentSurfaceTransition({
      transition: surfaceTransition,
      outgoingRoot,
      incomingRoot,
      onSettled() {
        surfaceTransitionPresentation.current = null;
        setSurfaceTransition((current) => (current === surfaceTransition ? null : current));
        restoreFocusToPlayerChrome(canvasElement, controlsRef.current);
      },
    });
    surfaceTransitionPresentation.current = presentation;
    return () => {
      if (surfaceTransitionPresentation.current === presentation) {
        surfaceTransitionPresentation.current = null;
      }
      presentation.dispose();
    };
  }, [canvasElement, surfaceTransition]);
  useEffect(() => {
    if (initialSurfaceId && activeSurfaceIdRef.current !== initialSurfaceId) {
      commitSurfaceChange(initialSurfaceId);
    }
  }, [commitSurfaceChange, initialSurfaceId]);
  const requestSurfaceChange = useMemo(
    () =>
      createRequestSurfaceChange({
        environment: surfaceExitEnvironment,
        getActiveSurfaceId: () => activeSurfaceIdRef.current,
        isKnownSurfaceId: (surfaceId) => structure.surfaceById[surfaceId] !== undefined,
        commitSurfaceChange: onAuthorPreviewSurfaceChangeRequest
          ? onAuthorPreviewSurfaceChangeRequest
          : commitSurfaceChange,
        surfaceExitPolicy,
      }),
    [
      commitSurfaceChange,
      onAuthorPreviewSurfaceChangeRequest,
      structure.surfaceById,
      surfaceExitEnvironment,
      surfaceExitPolicy,
    ],
  );
  const activeSurfaceRoot = useMemo(
    () =>
      runtimeEditor && canvasElement && activeSurfaceId
        ? resolveSurfaceRoot(canvasElement, activeSurfaceId)
        : null,
    [activeSurfaceId, canvasElement, runtimeEditor],
  );
  const navigation = getSlideshowNavigationState(structure, activeSurfaceId);
  const surfaceRuntime = useSlideshowSurfaceRuntime({
    activeSurfaceId,
    nextSurfaceId: navigation.nextSurfaceId,
    activeSurfaceRoot,
    autoPlayPresentation,
    presentationHold: surfaceTransition !== null,
    executionEnabled: runtimeExecutionEnabled,
    editor: runtimeEditor,
    featureViewBaseline,
    ...(surfaceRuntimeProgramSource === undefined
      ? {}
      : { programSource: surfaceRuntimeProgramSource }),
    requestSurfaceChange,
    surfaceExitEnvironment,
  });
  const presentationPreviewPort = useMemo<PresentationPreviewPlaybackPort | null>(() => {
    const controls = surfaceRuntime.presentationControls;
    const seek = surfaceRuntime.seek;
    if (!controls || !seek || !activeSurfaceId || !authorPreviewSurfaceSynchronized) return null;
    return createPresentationPreviewPlaybackPort({ controls, seek, surfaceId: activeSurfaceId });
  }, [
    activeSurfaceId,
    authorPreviewSurfaceSynchronized,
    surfaceRuntime.presentationControls,
    surfaceRuntime.seek,
  ]);
  useEffect(() => {
    if (!onPresentationPreviewPortChange || !presentationPreviewPort) return;
    onPresentationPreviewPortChange(presentationPreviewPort);
    return () => onPresentationPreviewPortChange(null);
  }, [onPresentationPreviewPortChange, presentationPreviewPort]);
  const learnerInteractionReportsPort = authorPreviewSurfaceSynchronized
    ? surfaceRuntime.learnerInteractionReportsPort
    : undefined;
  useEffect(() => {
    if (!onLearnerInteractionReportsPortChange || !learnerInteractionReportsPort) return;
    onLearnerInteractionReportsPortChange(learnerInteractionReportsPort);
    return () => onLearnerInteractionReportsPortChange(null);
  }, [learnerInteractionReportsPort, onLearnerInteractionReportsPortChange]);
  const slideshowOverlayInstanceId = useId();
  const contentInteraction: SlideshowContentInteraction =
    !runtimeExecutionEnabled || surfaceTransition ? "inert" : surfaceRuntime.contentInteraction;
  const slideshowOverlayOwnership = useMemo(
    () =>
      Object.freeze({
        instanceId: slideshowOverlayInstanceId,
        contentInteraction,
      }),
    [slideshowOverlayInstanceId, contentInteraction],
  );
  const previousContentInteraction = useRef(contentInteraction);
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
  const surfaceExitBlocked =
    surfaceExitPolicy === "enforce" && surfaceExitSnapshot.status === "blocked";
  const surfaceNavigationBlocked = !runtimeExecutionEnabled || surfaceExitBlocked;
  const surfaceNavigationGuidance = surfaceExitBlocked
    ? getSurfaceExitGuidance(surfaceExitSnapshot.blockers)
    : null;
  const surfaceNavigationAriaDescribedBy = surfaceExitBlocked
    ? surfaceNavigationDescriptionId
    : undefined;
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [fullscreenPending, setFullscreenPending] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const nextRequestsSurfaceChange = surfaceRuntime.nextMode === "navigate";
  const nextMode =
    nextRequestsSurfaceChange && (surfaceNavigationBlocked || !navigation.canGoNext)
      ? "disabled"
      : surfaceRuntime.nextMode;
  const nextSurfaceNavigationAriaDescribedBy = nextRequestsSurfaceChange
    ? surfaceNavigationAriaDescribedBy
    : undefined;
  const presentationControls = surfaceRuntime.presentationControls;
  const presentationSnapshot = presentationControls?.getSnapshot();
  const canContinuePresentation =
    presentationSnapshot?.phase === "held" &&
    (presentationSnapshot.hold.kind === "manual" || presentationSnapshot.hold.status === "ready");
  const canReturnToOutstandingCheckpoint =
    presentationSnapshot?.phase !== "stopped" &&
    presentationSnapshot?.outstandingLearnerWait !== null &&
    presentationSnapshot?.outstandingLearnerWait !== undefined &&
    !(
      presentationSnapshot.phase === "held" &&
      presentationSnapshot.hold.waitId === presentationSnapshot.outstandingLearnerWait.waitId
    );
  const presentationCheckpoint =
    presentationSnapshot?.phase !== "held"
      ? canReturnToOutstandingCheckpoint
        ? {
            kind: "outstanding" as const,
            title: "Required interaction outstanding",
            instruction: "Return to the checkpoint to complete it.",
          }
        : null
      : presentationSnapshot.hold.kind === "manual"
        ? {
            kind: "manual" as const,
            title: "Presentation paused",
            instruction: "Continue when you’re ready.",
          }
        : presentationSnapshot.hold.status === "ready"
          ? {
              kind: "ready" as const,
              title: "Interaction complete",
              instruction: "Continue when you’re ready.",
            }
          : surfaceRuntime.contentInteraction === "enabled"
            ? {
                kind: "learner" as const,
                title: "Your turn",
                instruction: "Complete the required interaction on this slide to continue.",
              }
            : {
                kind: "settling" as const,
                title: "Please wait",
                instruction: "Preparing the next step…",
              };
  const presentationTransportDisabled =
    !runtimeExecutionEnabled ||
    presentationSnapshot?.phase === "held" ||
    presentationSnapshot?.phase === "completed" ||
    presentationSnapshot?.phase === "stopped";
  const narrationSnapshot = surfaceRuntime.narration;
  const narrationFailure = narrationSnapshot?.error ?? null;
  const canRetryNarration = narrationFailure?.reason === "playback-not-allowed";
  const canContinueWithoutNarration =
    narrationFailure !== null && narrationFailure.reason !== "cancelled";
  const narrationMessage = narrationSnapshot?.error
    ? getNarrationFailureMessage(narrationSnapshot.error.reason)
    : narrationSnapshot?.status === "loading"
      ? "Loading narration…"
      : null;
  const surfaceStates = getSlideshowSurfaceStates(structure, navigation, surfaceTransition);
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

  useEffect(() => {
    if (pendingSurfaceExitEnvironmentDisposal.current !== null) {
      clearTimeout(pendingSurfaceExitEnvironmentDisposal.current);
      pendingSurfaceExitEnvironmentDisposal.current = null;
    }

    return () => {
      pendingSurfaceExitEnvironmentDisposal.current = setTimeout(() => {
        pendingSurfaceExitEnvironmentDisposal.current = null;
        surfaceExitEnvironmentOwner.dispose();
      }, 0);
    };
  }, [surfaceExitEnvironmentOwner]);

  useLayoutEffect(() => {
    const previous = previousContentInteraction.current;
    previousContentInteraction.current = contentInteraction;
    if (previous !== "enabled" || contentInteraction !== "inert") return;

    const activeElement = canvasElement?.ownerDocument.activeElement;
    if (!canvasElement || !activeElement) return;
    const contentOverlayOwner = activeElement.closest<HTMLElement>(
      '[data-slideshow-overlay-owner="content"]',
    );
    const focusBelongsToContent =
      canvasElement.contains(activeElement) ||
      contentOverlayOwner?.dataset.slideshowOverlayInstance === slideshowOverlayInstanceId;
    if (!focusBelongsToContent) return;

    controlsRef.current?.focus({ preventScroll: true });
  }, [canvasElement, contentInteraction, slideshowOverlayInstanceId]);

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
              <SlideshowOverlayOwnershipContext value={slideshowOverlayOwnership}>
                <OverlayBoundary
                  collisionBoundary={overlayCollisionBoundary}
                  container={overlayContainer}
                  hostBoundary={SlideshowChromeOverlayHostBoundary}
                  kind="viewport"
                >
                  <OverlayBoundary
                    collisionBoundary={overlayCollisionBoundary}
                    container={overlayContainer}
                    hostBoundary={SlideshowContentOverlayHostBoundary}
                    kind="viewport"
                  >
                    <div
                      ref={setCanvasElement}
                      className="sc-slideshow-player__canvas"
                      data-content-interaction={contentInteraction}
                      data-surface-transition={surfaceTransition?.transition.kind}
                      inert={contentInteraction === "inert"}
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
                  </OverlayBoundary>
                  {presentationControls &&
                  presentationSnapshot &&
                  (presentationCheckpoint || canContinuePresentation || narrationMessage) ? (
                    <div
                      className="sc-slideshow-player__presentation-transport"
                      role="group"
                      aria-label="Presentation playback"
                    >
                      <div
                        className="sc-slideshow-player__presentation-checkpoint"
                        data-kind={presentationCheckpoint?.kind}
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        {presentationCheckpoint ? (
                          <>
                            <span
                              className="sc-slideshow-player__presentation-checkpoint-icon"
                              aria-hidden="true"
                            >
                              {presentationCheckpoint.kind === "manual" ? (
                                <Pause size={iconLg} weight="fill" />
                              ) : presentationCheckpoint.kind === "learner" ||
                                presentationCheckpoint.kind === "outstanding" ? (
                                <CursorClick size={iconLg} weight="bold" />
                              ) : presentationCheckpoint.kind === "ready" ? (
                                <CheckCircle size={iconLg} weight="fill" />
                              ) : (
                                <Pause size={iconLg} weight="fill" />
                              )}
                            </span>
                            <span className="sc-slideshow-player__presentation-checkpoint-copy">
                              <strong>{presentationCheckpoint.title}</strong>
                              <span>{presentationCheckpoint.instruction}</span>
                            </span>
                          </>
                        ) : null}
                      </div>
                      {canContinuePresentation ? (
                        <span className="sc-slideshow-player__presentation-actions">
                          <button
                            type="button"
                            className="sc-slideshow-player__presentation-button"
                            data-emphasis="primary"
                            disabled={!runtimeExecutionEnabled}
                            onClick={() => {
                              if (runtimeExecutionEnabled) {
                                void presentationControls.advance();
                              }
                            }}
                          >
                            Continue presentation
                          </button>
                        </span>
                      ) : null}
                      {canReturnToOutstandingCheckpoint ? (
                        <span className="sc-slideshow-player__presentation-actions">
                          <button
                            type="button"
                            className="sc-slideshow-player__presentation-button"
                            data-emphasis="primary"
                            disabled={!runtimeExecutionEnabled}
                            onClick={() => {
                              if (runtimeExecutionEnabled) {
                                void presentationControls.returnToOutstandingCheckpoint();
                              }
                            }}
                          >
                            Return to required interaction
                          </button>
                        </span>
                      ) : null}
                      {narrationMessage ? (
                        <div
                          className="sc-slideshow-player__narration-status"
                          role={narrationSnapshot?.error ? "alert" : "status"}
                        >
                          <span>{narrationMessage}</span>
                          {canRetryNarration || canContinueWithoutNarration ? (
                            <span className="sc-slideshow-player__narration-actions">
                              {canRetryNarration ? (
                                <button
                                  type="button"
                                  className="sc-slideshow-player__presentation-button"
                                  disabled={!runtimeExecutionEnabled}
                                  onClick={() => {
                                    if (runtimeExecutionEnabled) {
                                      void presentationControls.play();
                                    }
                                  }}
                                >
                                  Retry narration
                                </button>
                              ) : null}
                              {canContinueWithoutNarration ? (
                                <button
                                  type="button"
                                  className="sc-slideshow-player__presentation-button"
                                  disabled={!runtimeExecutionEnabled}
                                  onClick={() => {
                                    if (runtimeExecutionEnabled) {
                                      presentationControls.continueWithoutNarration();
                                    }
                                  }}
                                >
                                  Continue without narration
                                </button>
                              ) : null}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  <div
                    className="sc-slideshow-player__chrome"
                    data-fullscreen-available={fullscreenAvailable}
                  >
                    <div
                      ref={controlsRef}
                      data-testid="slideshow-controls"
                      className="sc-slideshow-player__controls"
                      data-fullscreen-available={fullscreenAvailable}
                      role="group"
                      aria-label="Slideshow controls"
                      tabIndex={-1}
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
                      {presentationControls && presentationSnapshot ? (
                        <IconButton
                          className="sc-slideshow-player__presentation-pill-button"
                          variant="ghost"
                          size="md"
                          aria-label={
                            presentationSnapshot.phase === "playing"
                              ? "Pause presentation"
                              : "Play presentation"
                          }
                          disabled={presentationTransportDisabled}
                          onClick={() => {
                            if (!runtimeExecutionEnabled) return;
                            if (presentationSnapshot.phase === "playing") {
                              presentationControls.pause();
                              return;
                            }
                            if (
                              presentationSnapshot.phase === "awaiting-start" ||
                              presentationSnapshot.phase === "paused"
                            ) {
                              void presentationControls.play();
                            }
                          }}
                        >
                          {presentationSnapshot.phase === "playing" ? (
                            <Pause size={iconMd} weight="fill" aria-hidden />
                          ) : (
                            <Play size={iconMd} weight="fill" aria-hidden />
                          )}
                        </IconButton>
                      ) : null}
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
                            if (nextMode === "navigate" && navigation.nextSurfaceId) {
                              requestSurfaceChange(navigation.nextSurfaceId);
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
                          {surfaceNavigationGuidance}
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
              </SlideshowOverlayOwnershipContext>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function resolveSurfaceRoot(canvasElement: HTMLElement, surfaceId: SurfaceId): HTMLElement | null {
  const matches = canvasElement.querySelectorAll<HTMLElement>(
    `[data-node="surface"][data-id="${CSS.escape(surfaceId)}"]`,
  );
  if (matches.length > 1) {
    throw new Error(`Slideshow rendered duplicate Surface roots for "${surfaceId}".`);
  }
  return matches[0] ?? null;
}

function resolveSlideshowMotionMode(element: HTMLElement): PresentationMotionMode {
  return element.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "reduced-motion"
    : "normal";
}

/** After a Surface change settles, focus must rest on stable chrome, never on either layer. */
function restoreFocusToPlayerChrome(
  canvasElement: HTMLElement,
  controls: HTMLElement | null,
): void {
  const ownerDocument = canvasElement.ownerDocument;
  const activeElement = ownerDocument.activeElement;
  const focusIsStable =
    activeElement !== null &&
    activeElement !== ownerDocument.body &&
    !canvasElement.contains(activeElement);
  if (focusIsStable) return;
  controls?.focus({ preventScroll: true });
}

function getNarrationFailureMessage(reason: SlideshowPresentationNarrationError["reason"]): string {
  switch (reason) {
    case "playback-not-allowed":
      return "Narration needs permission to play. Retry after interacting with the page, or continue without narration.";
    case "narration-unavailable":
      return "Narration is unavailable. Continue without narration to keep playing.";
    case "seek-out-of-range":
    case "seek-unsupported":
      return "Narration could not move to that time. Continue without narration to keep playing.";
    case "cancelled":
      return "Narration was interrupted.";
  }
}
