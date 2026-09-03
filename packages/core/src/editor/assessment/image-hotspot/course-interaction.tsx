import {
  ArrowsOutIcon as ArrowsOut,
  CheckIcon as Check,
  CircleIcon as Circle,
  InfoIcon as Info,
  XIcon as XMark,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";

import { nodeViewUiStateKey, useNodeViewOpenState } from "@/editor/prosemirror/node-view-ui-state";
import type {
  HotspotClickRecord,
  ImageHotspotClickChangeStatus,
} from "@/editor/assessment/shared/runtime/assessment-interaction-runtime";
import { AssessmentRuntimePopoverShell } from "@/editor/blocks/assessment/shared/chrome/AssessmentRuntimePopoverShell";
import { renderRuntimeRichTextNode } from "@/editor/rich-text/runtime/render-rich-text";
import { useAssessmentRuntimeById } from "@/editor/assessment/shared/runtime/use-assessment-runtime";
import { createEmbeddedDataId } from "@/document/model/identity/stable-ids";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { cn } from "@/lib/cn";
import * as Popover from "@/ui/components/Popover/Popover";
import { zIndex } from "@/ui/overlays/z-index";
import { iconSm } from "@/ui/tokens/icon-sizes";
import { SpatialHotspotAssessmentSchema } from "@scaffold/contracts";
import type { HotspotItem, ImageHotspotCanvasData } from "@scaffold/contracts";
import {
  isScaffoldRichTextDocumentEmpty,
  toTiptapRichTextDocument,
  type ScaffoldRichTextDocument,
} from "@/schemas/rich-text";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { CourseThemePortalBoundary } from "@/theme/course/CourseThemeProvider";

import { eventToPercent, findHitHotspot } from "./image-hotspot-canvas-shared";
import {
  ImageHotspotCanvasSurface,
  type ImageHotspotFitStrategy,
} from "./image-hotspot-canvas-surface";
import { ImageHotspotCourseWorkspace } from "./ImageHotspotCourseWorkspace";

import "./ImageHotspot.css";
export interface ImageHotspotCourseInteractionProps {
  data: ImageHotspotCanvasData;
  assessmentTargetId: string | null;
  fitStrategy?: ImageHotspotFitStrategy | undefined;
  presentation?: "compact" | "full-slide" | "expanded";
  onAnnounce?: ((message: string) => void) | undefined;
  renderLiveRegion?: boolean | undefined;
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value));
}

function edgeSafeMarkerStyle(x: number, y: number) {
  return {
    "--sc-image-hotspot-marker-x": `${x}%`,
    "--sc-image-hotspot-marker-y": `${y}%`,
  } as CSSProperties;
}

function readSpatialHotspotReveal(answers: unknown) {
  const parsed = SpatialHotspotAssessmentSchema.safeParse(answers);
  return parsed.success ? parsed.data : null;
}

interface ImageHotspotSurfaceAccessibilityState {
  clickCount: number;
  maxClicks: number | null;
  capped: boolean;
  submitted: boolean;
  answerKeyVisible: boolean;
  disabled: boolean;
}

export function describeImageHotspotSurfaceAccessibilityState({
  clickCount,
  maxClicks,
  capped,
  submitted,
  answerKeyVisible,
  disabled,
}: ImageHotspotSurfaceAccessibilityState): string {
  const parts = [
    maxClicks === null
      ? `${clickCount} ${clickCount === 1 ? "click" : "clicks"} placed`
      : `${clickCount} of ${maxClicks} ${maxClicks === 1 ? "click" : "clicks"} placed`,
  ];
  if (answerKeyVisible) parts.push("Answer revealed");
  else if (submitted) parts.push("Submitted");
  if (capped) parts.push("Click limit reached");
  else if (disabled && !submitted && !answerKeyVisible) parts.push("Not accepting clicks");
  return parts.join(". ");
}

type ImageHotspotMarkerState = "pending" | "submitted" | "correct" | "incorrect" | "miss";

interface ImageHotspotMarkerAccessibilityState {
  state: ImageHotspotMarkerState;
  hasFeedback: boolean;
  submitted: boolean;
  answerKeyVisible: boolean;
}

export function describeImageHotspotMarkerAccessibilityState({
  state,
  hasFeedback,
  submitted,
  answerKeyVisible,
}: ImageHotspotMarkerAccessibilityState): string {
  const prefix = answerKeyVisible ? "Revealed click" : submitted ? "Submitted click" : "Click";
  const stateText =
    state === "pending"
      ? "Pending click"
      : state === "submitted"
        ? "Submitted click"
        : state === "miss"
          ? `${prefix}, no hotspot selected`
          : `${prefix}, ${state}`;
  return hasFeedback ? `${stateText}. Feedback available` : stateText;
}

export function describeImageHotspotRevealedHotspotAccessibilityState(
  hotspot: HotspotItem,
  index: number,
): string {
  return hotspot.label
    ? `Revealed correct hotspot ${index + 1}: ${hotspot.label}`
    : `Revealed correct hotspot ${index + 1}`;
}

export function ImageHotspotCourseInteraction({
  assessmentTargetId,
  data,
  fitStrategy = "width",
  presentation = "compact",
  onAnnounce,
  renderLiveRegion = true,
}: ImageHotspotCourseInteractionProps) {
  const isExpanded = presentation === "expanded";
  const isFullSlide = presentation === "full-slide";
  const effectiveFitStrategy: ImageHotspotFitStrategy = "contain";
  const isBoundedCompact = !isExpanded && !isFullSlide && fitStrategy === "contain";
  const mediaPort = useMediaPort();
  const assessment = useAssessmentRuntimeById(assessmentTargetId, "spatial-hotspot");
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const [resolvedManagedSrc, setResolvedManagedSrc] = useState<{
    mediaId: string;
    url: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fitStageRef = useRef<HTMLDivElement>(null);
  const workspaceKey = nodeViewUiStateKey({
    owner: "image-hotspot",
    surface: "course-workspace-runtime",
    id: assessmentTargetId,
  });
  const [workspaceOpen, setWorkspaceOpen] = useNodeViewOpenState(workspaceKey);
  const [announcement, setAnnouncement] = useState("");
  const [keyboardCursor, setKeyboardCursor] = useState({ x: 50, y: 50 });
  const [mediaStatus, setMediaStatus] = useState<"idle" | "loading" | "error">("idle");
  const [imageError, setImageError] = useState(false);
  const surfaceDescriptionId = useId();
  const keyboardInstructionsId = useId();
  const announce = useCallback(
    (message: string) => {
      if (onAnnounce) onAnnounce(message);
      else setAnnouncement(message);
    },
    [onAnnounce],
  );

  const image = data.image;
  const externalSrc = image?.mode === "external" ? image.src : null;
  const managedMediaId = image?.mode === "managed" ? image.mediaId : null;

  useEffect(() => {
    if (!managedMediaId) {
      setMediaStatus("idle");
      return undefined;
    }
    let cancelled = false;
    setMediaStatus("loading");
    void (async () => {
      try {
        if (!mediaPort) {
          throw new Error("No media port configured.");
        }
        const url = await mediaPort.resolve(managedMediaId);
        if (!cancelled) {
          setResolvedManagedSrc({ mediaId: managedMediaId, url });
          setMediaStatus("idle");
        }
      } catch {
        if (!cancelled) {
          setResolvedManagedSrc(null);
          setMediaStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [managedMediaId, mediaPort]);

  const resolvedSrc =
    externalSrc ??
    (managedMediaId && resolvedManagedSrc?.mediaId === managedMediaId
      ? resolvedManagedSrc.url
      : null);

  useEffect(() => {
    setImageError(false);
  }, [resolvedSrc]);

  const submitted = runtimeProblem?.state.submitted ?? false;
  const answerKeyVisible = runtimeProblem?.answerKeyVisible ?? false;
  const hasRevealPayload = (runtimeProblem?.state.revealedAnswer ?? null) !== null;
  const feedbackResult = runtimeProblem?.feedbackResult ?? null;
  const revealAssessment = answerKeyVisible
    ? readSpatialHotspotReveal(runtimeProblem?.state.revealedAnswer?.answers)
    : null;
  const revealCorrectIds = new Set([
    ...(revealAssessment?.correctHotspotIds ?? []),
    ...Object.entries(feedbackResult?.items ?? {}).flatMap(([hotspotId, item]) =>
      item.expected === true ? [hotspotId] : [],
    ),
  ]);
  const hasFeedback =
    submitted || (runtimeProblem?.state.feedbackMode === "immediate" && feedbackResult !== null);
  const showGraded = hasFeedback || answerKeyVisible;
  const capped = data.maxClicks !== null && (problem?.clicks.length ?? 0) >= data.maxClicks;
  const responseLocked =
    !problem || submitted || hasRevealPayload || Boolean(runtimeProblem?.exhausted);
  const disabled = responseLocked || capped;

  useEffect(() => {
    if (answerKeyVisible) {
      announce("Answer revealed.");
    } else if (submitted) {
      announce(
        feedbackResult?.isCorrect ? "Answer submitted. Correct." : "Answer submitted. Incorrect.",
      );
    }
  }, [announce, answerKeyVisible, feedbackResult?.isCorrect, submitted]);

  const announceAddResult = (
    status: ImageHotspotClickChangeStatus,
    hotspot: HotspotItem | null,
  ) => {
    const nextCount = (problem?.clicks.length ?? 0) + (status === "added" ? 1 : 0);
    if (status === "added") {
      announce(
        hotspot
          ? `${hotspot.label} selected. ${nextCount} ${nextCount === 1 ? "attempt" : "attempts"}.`
          : `Miss recorded. ${nextCount} ${nextCount === 1 ? "attempt" : "attempts"}.`,
      );
    } else if (status === "duplicate") {
      announce(`${hotspot?.label ?? "That region"} is already selected.`);
    } else if (status === "limit") {
      announce("Selection limit reached.");
    } else if (status === "locked") {
      announce("This answer is locked.");
    } else {
      announce("That selection was rejected.");
    }
  };

  const placeClick = (x: number, y: number, aspectRatio: number) => {
    if (!problem) {
      announce("This answer is not accepting selections.");
      return;
    }
    if (disabled) {
      announce(capped && !responseLocked ? "Selection limit reached." : "This answer is locked.");
      return;
    }
    const hit = findHitHotspot(x, y, data.hotspots, aspectRatio);
    const click: HotspotClickRecord = {
      id: createEmbeddedDataId(),
      x,
      y,
      hotspotId: hit?.id ?? null,
    };
    announceAddResult(problem.addClick(click), hit);
  };

  const handleImageClick = (event: MouseEvent<HTMLDivElement>, aspectRatio: number) => {
    if (!containerRef.current) {
      announce("This answer is not accepting selections.");
      return;
    }
    const position = eventToPercent(event, containerRef.current);
    placeClick(position.x, position.y, aspectRatio);
  };

  const handleImageKeyDown = (event: KeyboardEvent<HTMLDivElement>, aspectRatio: number) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      placeClick(keyboardCursor.x, keyboardCursor.y, aspectRatio);
      return;
    }
    const step = event.shiftKey ? 10 : 5;
    const movement = {
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
    }[event.key];
    if (!movement) return;
    event.preventDefault();
    setKeyboardCursor((current) => {
      const next = {
        x: clampPercent(current.x + movement.x),
        y: clampPercent(current.y + movement.y),
      };
      announce(`Selection cursor at ${next.x}% horizontal, ${next.y}% vertical.`);
      return next;
    });
  };

  if (!data.image) {
    return (
      <p role="status" className="sc-course-image-hotspot-runtime-missing">
        Image not configured.
      </p>
    );
  }
  if (mediaStatus === "loading") {
    return (
      <p role="status" className="sc-course-image-hotspot-runtime-missing">
        Loading hotspot image…
      </p>
    );
  }
  if (mediaStatus === "error" || imageError || !resolvedSrc) {
    return (
      <p role="alert" className="sc-course-image-hotspot-runtime-missing">
        Hotspot image could not be loaded.
      </p>
    );
  }
  const markerState = (click: HotspotClickRecord) => {
    if (!showGraded) return "pending" as const;
    if (click.hotspotId) {
      const detail = feedbackResult?.items?.[click.hotspotId];
      if (detail) return detail.correct ? ("correct" as const) : ("incorrect" as const);
      if (answerKeyVisible && revealAssessment) {
        return revealCorrectIds.has(click.hotspotId)
          ? ("correct" as const)
          : ("incorrect" as const);
      }
      return submitted ? ("submitted" as const) : ("pending" as const);
    }
    return "miss" as const;
  };

  const feedbackForClick = (click: HotspotClickRecord): unknown => {
    if (click.hotspotId) {
      return (
        feedbackResult?.items?.[click.hotspotId]?.feedback ??
        revealAssessment?.feedbackByHotspotId[click.hotspotId] ??
        null
      );
    }
    return revealAssessment?.missFeedback ?? null;
  };

  const correctHotspots = data.hotspots.filter((h) => revealCorrectIds.has(h.id));
  const surfaceDescription = describeImageHotspotSurfaceAccessibilityState({
    clickCount: problem?.clicks.length ?? 0,
    maxClicks: data.maxClicks,
    capped,
    submitted,
    answerKeyVisible,
    disabled,
  });

  const runtimeSurface = (
    <ImageHotspotCanvasSurface
      mode="runtime"
      containerRef={containerRef}
      fitContainerRef={fitStageRef}
      fitStrategy={effectiveFitStrategy}
      src={resolvedSrc}
      alt={data.image.alt ?? ""}
      ariaLabel="Image hotspot response area"
      ariaDescribedBy={`${surfaceDescriptionId} ${keyboardInstructionsId}`}
      ariaDisabled={disabled}
      ariaKeyShortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Enter Space"
      className={cn(
        disabled
          ? "sc-course-image-hotspot-canvas--runtime-disabled"
          : "sc-course-image-hotspot-canvas--runtime-enabled",
      )}
      onImageError={() => setImageError(true)}
      onSurfaceClick={(event, surface) => handleImageClick(event, surface.aspectRatio)}
      onSurfaceKeyDown={(event, surface) => handleImageKeyDown(event, surface.aspectRatio)}
      tabIndex={0}
    >
      {({ naturalSize }) => (
        <>
          {!isExpanded && !isBoundedCompact && (
            <div
              role="toolbar"
              aria-label="Image hotspot view tools"
              className="sc-course-image-hotspot__canvas-toolbar"
            >
              <ImageHotspotCourseWorkspace.Trigger asChild>
                <ImageHotspotCourseWorkspace.Action
                  label="Answer in expanded hotspot workspace"
                  intent="edit"
                >
                  <ArrowsOut size={iconSm} aria-hidden />
                </ImageHotspotCourseWorkspace.Action>
              </ImageHotspotCourseWorkspace.Trigger>
            </div>
          )}
          <span id={surfaceDescriptionId} className="sc-sr-only">
            {surfaceDescription}
          </span>
          <span id={keyboardInstructionsId} className="sc-sr-only">
            Use the arrow keys to move the selection cursor. Press Enter or Space to place a click.
          </span>
          <span
            aria-hidden
            data-image-hotspot-keyboard-cursor=""
            data-testid="image-hotspot-keyboard-cursor"
            className="sc-course-image-hotspot__keyboard-cursor"
            style={{ left: `${keyboardCursor.x}%`, top: `${keyboardCursor.y}%` }}
          />

          {answerKeyVisible && naturalSize && (
            <svg
              aria-hidden="true"
              className="sc-course-image-hotspot-overlay"
              viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
              preserveAspectRatio="none"
            >
              {correctHotspots.map((h) => (
                <circle
                  key={h.id}
                  cx={(h.centerX / 100) * naturalSize.w}
                  cy={(h.centerY / 100) * naturalSize.h}
                  r={(h.radius / 100) * naturalSize.w}
                  data-course-state="correct"
                  className="sc-course-image-hotspot__revealed-region"
                />
              ))}
            </svg>
          )}
          {answerKeyVisible &&
            correctHotspots.map((h, idx) => (
              <span key={h.id} className="sc-sr-only" data-revealed-hotspot-id={h.id}>
                {describeImageHotspotRevealedHotspotAccessibilityState(h, idx)}
              </span>
            ))}

          {problem?.clicks.map((click) => {
            const state = markerState(click);
            const feedbackDocument = runtimeFeedbackDocument(feedbackForClick(click));
            return (
              <ClickMarker
                key={click.id}
                click={click}
                state={state}
                hasFeedback={feedbackDocument !== null && showGraded}
                submitted={submitted}
                answerKeyVisible={answerKeyVisible}
                feedbackDocument={feedbackDocument}
                onRemove={() => {
                  if (submitted || hasRevealPayload || !problem) {
                    announce("This answer is locked.");
                    return;
                  }
                  problem.removeClick(click.id);
                  const nextCount = Math.max(0, problem.clicks.length - 1);
                  announce(
                    `Selection removed. ${nextCount} ${nextCount === 1 ? "attempt" : "attempts"}.`,
                  );
                }}
              />
            );
          })}
        </>
      )}
    </ImageHotspotCanvasSurface>
  );

  return (
    <div
      className={cn(
        "sc-course-image-hotspot-shell",
        isFullSlide && "sc-course-image-hotspot-shell--full-slide",
        isExpanded && "sc-course-image-hotspot-shell--expanded",
      )}
    >
      {!responseLocked && data.maxClicks !== null && (
        <div className="sc-course-image-hotspot-runtime-toolbar">
          <p className="sc-course-image-hotspot-runtime-counter">
            {problem
              ? `${problem.clicks.length} of ${data.maxClicks} click${
                  data.maxClicks === 1 ? "" : "s"
                }${capped ? " · limit reached" : ""}`
              : `Up to ${data.maxClicks} click${data.maxClicks === 1 ? "" : "s"}`}
          </p>
        </div>
      )}

      {!isExpanded ? (
        <ImageHotspotCourseWorkspace.Root open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
          <div
            ref={fitStageRef}
            className="sc-course-image-hotspot-fit-stage"
            data-image-hotspot-presentation={
              isFullSlide ? "full-slide" : isBoundedCompact ? "bounded" : "compact"
            }
          >
            {runtimeSurface}
            {isBoundedCompact && (
              <div
                role="toolbar"
                aria-label="Image hotspot view tools"
                className="sc-course-image-hotspot__canvas-toolbar"
              >
                <ImageHotspotCourseWorkspace.Trigger asChild>
                  <ImageHotspotCourseWorkspace.Action
                    label="Answer in expanded hotspot workspace"
                    intent="edit"
                  >
                    <ArrowsOut size={iconSm} aria-hidden />
                  </ImageHotspotCourseWorkspace.Action>
                </ImageHotspotCourseWorkspace.Trigger>
              </div>
            )}
          </div>
          <ImageHotspotCourseWorkspace.Content
            open={workspaceOpen}
            title="Answer image hotspot"
            description="Select every correct region on the image."
          >
            <div className="sc-course-image-hotspot-runtime-workspace__body">
              <ImageHotspotCourseInteraction
                assessmentTargetId={assessmentTargetId}
                data={data}
                fitStrategy="contain"
                presentation="expanded"
                onAnnounce={announce}
                renderLiveRegion={false}
              />
            </div>
          </ImageHotspotCourseWorkspace.Content>
        </ImageHotspotCourseWorkspace.Root>
      ) : (
        <>
          <div
            ref={fitStageRef}
            className="sc-course-image-hotspot-fit-stage"
            data-image-hotspot-presentation="expanded"
          >
            {runtimeSurface}
          </div>
        </>
      )}
      {renderLiveRegion ? (
        <span className="sc-sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
      ) : null}
    </div>
  );
}
function ClickMarker({
  click,
  state,
  hasFeedback,
  submitted,
  answerKeyVisible,
  feedbackDocument,
  onRemove,
}: {
  click: HotspotClickRecord;
  state: ImageHotspotMarkerState;
  hasFeedback: boolean;
  submitted: boolean;
  answerKeyVisible: boolean;
  feedbackDocument: ScaffoldRichTextDocument | null;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const isHit = state === "correct" || state === "incorrect";
  const isMiss = state === "miss";
  const showFeedbackIcon = hasFeedback && isHit && (hovered || focused);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state === "pending") {
      onRemove();
      return;
    }
    if (hasFeedback) setOpen((v) => !v);
  };

  const ariaLabel =
    state === "pending"
      ? "Pending click — click to remove"
      : state === "submitted"
        ? "Submitted"
        : `${state.charAt(0).toUpperCase() + state.slice(1)}${
            hasFeedback ? " — click for details" : ""
          }`;
  const descriptionId = useId();
  const description = describeImageHotspotMarkerAccessibilityState({
    state,
    hasFeedback,
    submitted,
    answerKeyVisible,
  });

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <button
          type="button"
          onClick={handleClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
          }}
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          data-hotspot-marker-id={click.id}
          data-course-state={state === "correct" || state === "incorrect" ? state : undefined}
          data-hotspot-state={
            state === "pending" || state === "miss" || state === "submitted"
              ? state
              : submitted
                ? "submitted"
                : undefined
          }
          className="sc-course-image-hotspot-marker"
          style={edgeSafeMarkerStyle(click.x, click.y)}
        >
          <span id={descriptionId} className="sc-sr-only">
            {description}
          </span>
          {state === "correct" && (
            <MarkerIcon
              showFeedbackIcon={showFeedbackIcon}
              icon={<Check size={14} weight="bold" aria-hidden />}
            />
          )}
          {state === "incorrect" && (
            <MarkerIcon
              showFeedbackIcon={showFeedbackIcon}
              icon={<XMark size={14} weight="bold" aria-hidden />}
            />
          )}
          {state === "pending" && (
            <span aria-hidden className="sc-course-image-hotspot-marker__pending-label">
              ?
            </span>
          )}
          {state === "submitted" && (
            <Circle
              size={10}
              weight="fill"
              aria-hidden
              data-hotspot-marker-state-icon="submitted"
            />
          )}
          {isMiss && (
            <>
              <XMark size={14} weight="bold" aria-hidden data-hotspot-marker-state-icon="miss" />
              <span className="sc-sr-only">Miss</span>
            </>
          )}
        </button>
      </Popover.Anchor>
      {hasFeedback && (
        <Popover.Portal>
          <CourseThemePortalBoundary>
            <Popover.Content
              side="top"
              sideOffset={8}
              collisionPadding={12}
              aria-label="Feedback"
              className="sc-course-image-hotspot__feedback-popover"
              style={{ zIndex: zIndex.popover }}
            >
              <AssessmentRuntimePopoverShell
                icon={<Info size={iconSm} weight="fill" />}
                title="Feedback"
                tone="feedback"
              >
                <div className="sc-course-image-hotspot-runtime-rich-text">
                  {feedbackDocument ? renderRuntimeRichTextNode(feedbackDocument) : null}
                </div>
              </AssessmentRuntimePopoverShell>
            </Popover.Content>
          </CourseThemePortalBoundary>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}

function MarkerIcon({ showFeedbackIcon, icon }: { showFeedbackIcon: boolean; icon: ReactNode }) {
  if (!showFeedbackIcon) return icon;
  return <Info size={14} weight="bold" aria-hidden data-hotspot-marker-feedback-icon="" />;
}

function runtimeFeedbackDocument(value: unknown): ScaffoldRichTextDocument | null {
  const parsed = AssessmentFeedbackContentSchema.safeParse(value);
  if (!parsed.success || isScaffoldRichTextDocumentEmpty(parsed.data.document)) {
    return null;
  }
  return toTiptapRichTextDocument(parsed.data.document);
}
