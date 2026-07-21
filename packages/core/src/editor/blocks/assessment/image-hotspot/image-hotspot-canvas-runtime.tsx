import { CheckIcon as Check, InfoIcon as Info, XIcon as XMark } from "@phosphor-icons/react";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";

import * as Popover from "@/ui/components/Popover/Popover";
import { WorkspaceDialog } from "@/ui/components/WorkspaceDialog/WorkspaceDialog";
import type { HotspotClickRecord } from "@/editor/blocks/assessment/shared/runtime/assessment-interaction-runtime";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { AssessmentRuntimePopoverShell } from "@/editor/blocks/assessment/shared/chrome/AssessmentRuntimePopoverShell";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { resolveAssessmentAttrParent } from "@/editor/blocks/assessment/shared/model/private-assessment-attrs";
import { renderRuntimeRichTextNode } from "@/editor/rich-text/runtime/render-rich-text";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { resolveActiveBoundedPlacement } from "@/editor/bounded-containers/model/bounded-container-structure-policy";
import { MediaExpandButton } from "@/editor/media/presentation/MediaExpandButton";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { createStableId } from "@/document/model/identity/stable-ids";
import { useMediaPort } from "@/host/providers/ScaffoldServicesProvider";
import { cn } from "@/lib/cn";
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

import {
  createImageHotspotCanvasNode,
  eventToPercent,
  findHitHotspot,
  parseImageHotspotCanvasData,
} from "./image-hotspot-canvas-shared";
import {
  ImageHotspotCanvasSurface,
  type ImageHotspotFitStrategy,
} from "./image-hotspot-canvas-surface";

import "./ImageHotspot.css";

interface RuntimeCanvasProps {
  data: ImageHotspotCanvasData;
  problemId: string | null;
  fitStrategy?: ImageHotspotFitStrategy | undefined;
  presentation?: "compact" | "expanded";
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

export function ImageHotspotCanvasRuntimeNodeView(
  props: NodeViewProps & { blockDefinitions: BlockDefinitionLookup },
) {
  const rawPos = safeGetPos(props.getPos);
  const pos = typeof rawPos === "number" ? rawPos : null;
  const data = useMemo(
    () => parseImageHotspotCanvasData(props.node.attrs["data"]),
    [props.node.attrs],
  );
  const problemId = findAncestorAssessmentId(props.editor, pos ?? undefined, ["image_hotspot"]);
  const boundedFillActive =
    pos !== null && isImageHotspotBoundedFillActive(props.editor, pos, props.blockDefinitions);

  return (
    <NodeViewWrapper data-node="image-hotspot-canvas">
      <RuntimeCanvas
        data={data}
        problemId={problemId}
        fitStrategy={boundedFillActive ? "contain" : "width"}
      />
    </NodeViewWrapper>
  );
}

function RuntimeCanvas({
  data,
  fitStrategy = "width",
  problemId,
  presentation = "compact",
}: RuntimeCanvasProps) {
  const isExpanded = presentation === "expanded";
  const effectiveFitStrategy = isExpanded ? "contain" : fitStrategy;
  const mediaPort = useMediaPort();
  const assessment = useAssessmentRuntimeById(problemId, "spatial-hotspot");
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const [resolvedManagedSrc, setResolvedManagedSrc] = useState<{
    mediaId: string;
    url: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fitStageRef = useRef<HTMLDivElement>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);

  const image = data.image;
  const externalSrc = image?.mode === "external" ? image.src : null;
  const managedMediaId = image?.mode === "managed" ? image.mediaId : null;

  useEffect(() => {
    if (!managedMediaId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        if (!mediaPort) {
          throw new Error("No media port configured.");
        }
        const url = await mediaPort.resolve(managedMediaId);
        if (!cancelled) setResolvedManagedSrc({ mediaId: managedMediaId, url });
      } catch {
        if (!cancelled) setResolvedManagedSrc(null);
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

  const handleImageClick = (e: MouseEvent<HTMLDivElement>, aspectRatio: number) => {
    if (disabled || !containerRef.current || !problem) return;
    const pct = eventToPercent(e, containerRef.current);
    const hit = findHitHotspot(pct.x, pct.y, data.hotspots, aspectRatio);
    const click: HotspotClickRecord = {
      id: createStableId(),
      x: pct.x,
      y: pct.y,
      hotspotId: hit?.id ?? null,
    };
    problem.addClick(click);
  };

  if (!data.image || !resolvedSrc) {
    return <p className="sc-image-hotspot-runtime-missing">Image not configured.</p>;
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
  const surfaceDescriptionId = problemId
    ? `${problemId}-image-hotspot-surface-description`
    : undefined;
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
      ariaDescribedBy={surfaceDescriptionId}
      className={cn(
        disabled
          ? "sc-image-hotspot-canvas--runtime-disabled"
          : "sc-image-hotspot-canvas--runtime-enabled",
      )}
      onSurfaceClick={(event, surface) => handleImageClick(event, surface.aspectRatio)}
    >
      {({ naturalSize }) => (
        <>
          {!isExpanded && (
            <WorkspaceDialog.Trigger asChild>
              <MediaExpandButton
                aria-label="Answer in expanded hotspot workspace"
                tooltipLabel="Answer in expanded view"
                hidden={responseLocked}
              />
            </WorkspaceDialog.Trigger>
          )}
          {surfaceDescriptionId && (
            <span id={surfaceDescriptionId} className="sc-sr-only">
              {surfaceDescription}
            </span>
          )}

          {data.debug && naturalSize && (
            <svg
              aria-hidden="true"
              className="sc-image-hotspot-overlay"
              viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
              preserveAspectRatio="none"
            >
              {data.hotspots.map((h) => (
                <circle
                  key={h.id}
                  cx={(h.centerX / 100) * naturalSize.w}
                  cy={(h.centerY / 100) * naturalSize.h}
                  r={(h.radius / 100) * naturalSize.w}
                  fill="var(--color-primary)"
                  fillOpacity={0.18}
                  stroke="var(--color-primary)"
                  strokeWidth={naturalSize.w * 0.0025}
                  strokeDasharray="6 4"
                />
              ))}
            </svg>
          )}

          {answerKeyVisible && naturalSize && (
            <svg
              aria-hidden="true"
              className="sc-image-hotspot-overlay"
              viewBox={`0 0 ${naturalSize.w} ${naturalSize.h}`}
              preserveAspectRatio="none"
            >
              {correctHotspots.map((h) => (
                <circle
                  key={h.id}
                  cx={(h.centerX / 100) * naturalSize.w}
                  cy={(h.centerY / 100) * naturalSize.h}
                  r={(h.radius / 100) * naturalSize.w}
                  fill="none"
                  stroke="var(--color-accent)"
                  strokeWidth={naturalSize.w * 0.004}
                  className="sc-hotspot-pulse"
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
                onRemove={() => !submitted && !hasRevealPayload && problem?.removeClick(click.id)}
              />
            );
          })}
        </>
      )}
    </ImageHotspotCanvasSurface>
  );

  return (
    <div className={cn("sc-image-hotspot-shell", isExpanded && "sc-image-hotspot-shell--expanded")}>
      {!responseLocked && data.maxClicks !== null && (
        <div className="sc-image-hotspot-runtime-toolbar">
          <p className="sc-image-hotspot-runtime-counter">
            {problem
              ? `${problem.clicks.length} of ${data.maxClicks} click${
                  data.maxClicks === 1 ? "" : "s"
                }${capped ? " · limit reached" : ""}`
              : `Up to ${data.maxClicks} click${data.maxClicks === 1 ? "" : "s"}`}
          </p>
        </div>
      )}

      {!isExpanded ? (
        <WorkspaceDialog.Root open={workspaceOpen} onOpenChange={setWorkspaceOpen}>
          <div ref={fitStageRef} className="sc-image-hotspot-fit-stage">
            {runtimeSurface}
          </div>
          <WorkspaceDialog.Content size="large">
            <WorkspaceDialog.Header>
              <div>
                <WorkspaceDialog.Title>Answer image hotspot</WorkspaceDialog.Title>
                <WorkspaceDialog.Description>
                  Click the correct regions on the image.
                </WorkspaceDialog.Description>
              </div>
              <WorkspaceDialog.Close aria-label="Close expanded hotspot workspace" />
            </WorkspaceDialog.Header>
            <WorkspaceDialog.Body className="sc-image-hotspot-runtime-workspace__body">
              <RuntimeCanvas
                data={data}
                fitStrategy="contain"
                problemId={problemId}
                presentation="expanded"
              />
            </WorkspaceDialog.Body>
          </WorkspaceDialog.Content>
        </WorkspaceDialog.Root>
      ) : (
        <div ref={fitStageRef} className="sc-image-hotspot-fit-stage">
          {runtimeSurface}
        </div>
      )}
    </div>
  );
}

function isImageHotspotBoundedFillActive(
  editor: NodeViewProps["editor"],
  canvasPos: number,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  const parent = resolveAssessmentAttrParent(editor, canvasPos, ["image_hotspot"]);
  if (!parent) return false;
  return (
    resolveActiveBoundedPlacement({
      blockDefinitions,
      capability: "fill",
      doc: editor.state.doc,
      pos: parent.pos,
    }) === "fill"
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
  const descriptionId = `image-hotspot-marker-${click.id}-description`;
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
          className={cn(
            "sc-image-hotspot-marker",
            isHit && "sc-image-hotspot-marker--hit",
            state === "correct" && "sc-image-hotspot-marker--correct",
            state === "incorrect" && "sc-image-hotspot-marker--incorrect",
            state === "pending" && "sc-image-hotspot-marker--pending",
            isMiss && "sc-image-hotspot-marker--miss",
          )}
          style={{
            left: `${click.x}%`,
            top: `${click.y}%`,
          }}
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
            <span aria-hidden className="sc-image-hotspot-marker__pending-label">
              ?
            </span>
          )}
          {isMiss && <span className="sc-sr-only">Miss</span>}
        </button>
      </Popover.Anchor>
      {hasFeedback && (
        <Popover.Portal>
          <Popover.Content
            side="top"
            sideOffset={8}
            collisionPadding={12}
            aria-label="Feedback"
            style={{ zIndex: zIndex.popover }}
          >
            <AssessmentRuntimePopoverShell
              icon={<Info size={iconSm} weight="fill" />}
              title="Feedback"
              tone="feedback"
            >
              <div className="sc-image-hotspot-runtime-rich-text">
                {feedbackDocument ? renderRuntimeRichTextNode(feedbackDocument) : null}
              </div>
            </AssessmentRuntimePopoverShell>
          </Popover.Content>
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

export function createImageHotspotCanvasRuntimeNode(blockDefinitions: BlockDefinitionLookup) {
  return createImageHotspotCanvasNode({
    addNodeView: () =>
      ReactNodeViewRenderer((props) => (
        <ImageHotspotCanvasRuntimeNodeView {...props} blockDefinitions={blockDefinitions} />
      )),
  });
}
