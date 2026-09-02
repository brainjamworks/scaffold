import type { EmbeddedDataId, EmbeddedNodeId, TimelineActionV1 } from "@scaffold/contracts";
import {
  MinusIcon as Minus,
  PauseIcon as Pause,
  PlayIcon as Play,
  PlusIcon as Plus,
} from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type UIEvent,
  type WheelEvent,
} from "react";

import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { iconXs } from "@/ui/tokens/icon-sizes";
import {
  setPresentationSurfaceDuration,
  updatePresentationAction,
  type NewPresentationTimelineAction,
  type PresentationAuthoringCommandError,
} from "@/editor/presentation/model";
import type {
  PresentationPreviewDocument,
  PresentationPreviewLoadError,
  PresentationPreviewOperationError,
  PresentationPreviewSeekError,
} from "@/presentation/model";
import type { PresentationPreviewController } from "../preview/presentation-preview-controller";

import {
  PresentationActionEditor,
  presentPresentationAuthoringCommandError,
} from "./PresentationActionEditor";
import { PresentationNarrationLane } from "./PresentationNarrationLane";
import type { PresentationTimelineController } from "./presentation-timeline-controller";
import type {
  PresentationTimelineProjection,
  PresentationTimelineRow,
} from "./presentation-timeline-projection";
import "./PresentationTimeline.css";

export interface PresentationTimelineProps {
  readonly controller: PresentationTimelineController;
  readonly projection: PresentationTimelineProjection;
  readonly ariaLabel?: string;
  readonly editor?: Editor;
  readonly preview?: {
    readonly controller: PresentationPreviewController;
    readonly document: PresentationPreviewDocument;
  };
}

const IDLE_PREVIEW_SNAPSHOT = Object.freeze({ status: "idle" as const });
const subscribeToNoPreview = () => () => undefined;
const getIdlePreviewSnapshot = () => IDLE_PREVIEW_SNAPSHOT;

export function PresentationTimeline({
  controller,
  projection,
  ariaLabel = "Presentation timeline",
  editor,
  preview,
}: PresentationTimelineProps) {
  const timeViewportRef = useRef<HTMLDivElement>(null);
  const targetRowRefs = useRef(new Map<EmbeddedNodeId, HTMLDivElement>());
  const playheadPointerIdRef = useRef<number | null>(null);
  const [collapsedTargetIds, setCollapsedTargetIds] = useState<ReadonlySet<EmbeddedNodeId>>(
    () => new Set(),
  );
  const [authoringError, setAuthoringError] = useState<PresentationAuthoringCommandError | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<PresentationPreviewUiError | null>(null);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const previewSnapshot = useSyncExternalStore(
    preview?.controller.subscribe ?? subscribeToNoPreview,
    preview?.controller.getSnapshot ?? getIdlePreviewSnapshot,
    preview?.controller.getSnapshot ?? getIdlePreviewSnapshot,
  );
  const currentSurfaceIsPlaying =
    previewSnapshot.status === "ready" &&
    previewSnapshot.surfaceId === preview?.document.surfaceId &&
    previewSnapshot.phase === "playing";
  const durationMs = projection.durationMs ?? 0;
  const playheadMs = Math.min(durationMs, snapshot.playheadDraftMs);
  const previousTimelineRef = useRef({ surfaceId: projection.surfaceId, durationMs });
  const contentWidthPx = (durationMs / 1_000) * snapshot.pixelsPerSecond;
  const contentStyle = {
    "--sc-presentation-timeline-content-width": `${contentWidthPx}px`,
  } as CSSProperties;
  const rulerTicks = createRulerTicks(durationMs, snapshot.pixelsPerSecond);
  const draftAction = snapshot.editDraft
    ? projection.rows
        .flatMap(({ actions }) => actions)
        .find(({ id }) => id === snapshot.editDraft?.actionId)
    : null;
  const draftFeedback =
    snapshot.editDraft && draftAction
      ? deriveDraftFeedback(snapshot.editDraft, draftAction, projection, snapshot.pixelsPerSecond)
      : null;
  const rowById = useMemo(
    () => new Map(projection.rows.map((row) => [row.targetId, row])),
    [projection.rows],
  );
  const ownerTargetIds = useMemo(
    () =>
      new Set(
        projection.rows.flatMap(({ parentTargetId }) =>
          parentTargetId === null ? [] : [parentTargetId],
        ),
      ),
    [projection.rows],
  );
  const visibleRows = useMemo(
    () => visiblePresentationTimelineRows(projection.rows, rowById, collapsedTargetIds),
    [collapsedTargetIds, projection.rows, rowById],
  );
  const expandSurfaceForNarration = useCallback(
    (narrationDurationMs: number) => {
      if (!editor || narrationDurationMs <= durationMs) return;
      const result = setPresentationSurfaceDuration({
        editor,
        surfaceId: projection.surfaceId,
        durationMs: narrationDurationMs,
      });
      setAuthoringError(result.isErr() ? result.error : null);
    },
    [durationMs, editor, projection.surfaceId],
  );

  useEffect(() => {
    const selectedTargetId = snapshot.selectedTargetId;
    if (!selectedTargetId) return;
    const ancestors = presentationTimelineAncestorIds(selectedTargetId, rowById);
    setCollapsedTargetIds((current) => {
      if (!ancestors.some((targetId) => current.has(targetId))) return current;
      const next = new Set(current);
      for (const targetId of ancestors) next.delete(targetId);
      return next;
    });
  }, [rowById, snapshot.selectedTargetId]);

  useEffect(() => {
    const selectedTargetId = snapshot.selectedTargetId;
    if (!selectedTargetId || !visibleRows.some(({ targetId }) => targetId === selectedTargetId)) {
      return;
    }
    targetRowRefs.current.get(selectedTargetId)?.scrollIntoView?.({ block: "nearest" });
  }, [collapsedTargetIds, snapshot.selectedTargetId, visibleRows]);

  useEffect(() => {
    const previous = previousTimelineRef.current;
    if (previous.surfaceId !== projection.surfaceId) {
      controller.setPlayheadDraft(0, durationMs);
    } else if (previous.durationMs !== durationMs) {
      controller.setPlayheadDraft(snapshot.playheadDraftMs, durationMs);
    }
    previousTimelineRef.current = { surfaceId: projection.surfaceId, durationMs };
  }, [controller, durationMs, projection.surfaceId, snapshot.playheadDraftMs]);

  useEffect(() => {
    const viewport = timeViewportRef.current;
    if (viewport && viewport.scrollLeft !== snapshot.viewportLeftPx) {
      viewport.scrollLeft = snapshot.viewportLeftPx;
    }
  }, [snapshot.viewportLeftPx]);

  useEffect(() => {
    if (previewSnapshot.status === "ready" && previewSnapshot.surfaceId === projection.surfaceId) {
      controller.setPlayheadDraft(previewSnapshot.currentTimeMs, durationMs);
    }
  }, [controller, durationMs, previewSnapshot, projection.surfaceId]);

  useEffect(() => {
    const viewport = timeViewportRef.current;
    if (!viewport) return;

    const updateGeometry = () => {
      const viewportWidthPx = viewport.clientWidth;
      if (viewportWidthPx <= 0) return;
      const current = controller.getSnapshot();
      const geometry = { durationMs, viewportWidthPx };
      if (current.zoomMode === "fit") controller.fit(geometry);
      else controller.setViewportLeft(current.viewportLeftPx, geometry);
    };

    updateGeometry();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [controller, durationMs]);

  function viewportGeometry() {
    const viewportWidthPx = timeViewportRef.current?.clientWidth ?? 0;
    return viewportWidthPx > 0 ? { durationMs, viewportWidthPx } : null;
  }

  function zoomAtCentre(scale: number): void {
    const geometry = viewportGeometry();
    if (!geometry) return;
    controller.zoomAtPointer({
      ...geometry,
      pointerX: geometry.viewportWidthPx / 2,
      requestedPixelsPerSecond: snapshot.pixelsPerSecond * scale,
    });
  }

  function fitTimeline(): void {
    const geometry = viewportGeometry();
    if (geometry) controller.fit(geometry);
  }

  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    const geometry = viewportGeometry();
    if (geometry) controller.setViewportLeft(event.currentTarget.scrollLeft, geometry);
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>): void {
    if (!event.ctrlKey && !event.metaKey) return;
    const geometry = viewportGeometry();
    if (!geometry) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    controller.zoomAtPointer({
      ...geometry,
      pointerX: event.clientX - bounds.left,
      requestedPixelsPerSecond: snapshot.pixelsPerSecond * Math.exp(-event.deltaY * 0.002),
    });
  }

  function seekPlayheadFromPointer(event: PointerEvent<HTMLDivElement>): void {
    const bounds = event.currentTarget.getBoundingClientRect();
    const timeMs = ((event.clientX - bounds.left) / snapshot.pixelsPerSecond) * 1_000;
    setPlayhead(Math.max(0, timeMs));
  }

  function setPlayhead(timeMs: number): void {
    const nextTimeMs = Math.round(Math.min(durationMs, Math.max(0, timeMs)));
    controller.setPlayheadDraft(nextTimeMs, durationMs);
    if (!preview) return;
    void preview.controller.seek(preview.document, nextTimeMs).then((result) => {
      setPreviewError(result.isErr() ? result.error : null);
    });
  }

  function togglePreviewPlayback(): void {
    if (!preview) return;
    if (currentSurfaceIsPlaying) {
      const result = preview.controller.pause(preview.document);
      setPreviewError(result.isErr() ? result.error : null);
      return;
    }
    void preview.controller.play(preview.document).then((result) => {
      setPreviewError(result.isErr() ? result.error : null);
    });
  }

  function setSurfaceDuration(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!editor) return;
    const result = setPresentationSurfaceDuration({
      editor,
      surfaceId: projection.surfaceId,
      durationMs: Number(new FormData(event.currentTarget).get("surfaceDurationMs")),
    });
    setAuthoringError(result.isErr() ? result.error : null);
  }

  function toggleTargetCollapsed(targetId: EmbeddedNodeId): void {
    setCollapsedTargetIds((current) => {
      const next = new Set(current);
      if (next.has(targetId)) next.delete(targetId);
      else next.add(targetId);
      return next;
    });
  }

  function handlePlayheadPointerDown(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    event.preventDefault();
    playheadPointerIdRef.current = event.pointerId;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    seekPlayheadFromPointer(event);
  }

  function handlePlayheadPointerMove(event: PointerEvent<HTMLDivElement>): void {
    if (playheadPointerIdRef.current !== event.pointerId) return;
    seekPlayheadFromPointer(event);
  }

  function handlePlayheadPointerUp(event: PointerEvent<HTMLDivElement>): void {
    if (playheadPointerIdRef.current !== event.pointerId) return;
    playheadPointerIdRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handlePlayheadKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const stepMs = event.shiftKey ? 1_000 : 100;
    let nextTimeMs: number;
    switch (event.key) {
      case "ArrowLeft":
        nextTimeMs = playheadMs - stepMs;
        break;
      case "ArrowRight":
        nextTimeMs = playheadMs + stepMs;
        break;
      case "Home":
        nextTimeMs = 0;
        break;
      case "End":
        nextTimeMs = durationMs;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPlayhead(nextTimeMs);
  }

  return (
    <section className="sc-presentation-timeline" aria-label={ariaLabel}>
      <header className="sc-presentation-timeline-toolbar">
        <h2>Timeline</h2>
        {preview ? (
          <IconButton
            size="sm"
            aria-label={currentSurfaceIsPlaying ? "Pause preview" : "Play preview"}
            onClick={togglePreviewPlayback}
          >
            {currentSurfaceIsPlaying ? (
              <Pause size={iconXs} aria-hidden />
            ) : (
              <Play size={iconXs} aria-hidden />
            )}
          </IconButton>
        ) : null}
        <span className="sc-presentation-timeline-time-readout" aria-hidden="true">
          {formatTime(playheadMs)} / {formatTime(durationMs)}
        </span>
        {editor ? (
          <form
            key={`${projection.surfaceId}:${durationMs}`}
            className="sc-presentation-timeline-duration-control"
            onSubmit={setSurfaceDuration}
          >
            <label>
              <span>Duration</span>
              <input
                aria-label="Surface duration (ms)"
                name="surfaceDurationMs"
                type="number"
                min={0}
                step={1}
                defaultValue={durationMs}
              />
            </label>
            <Button aria-label="Set duration" size="sm" type="submit">
              Set
            </Button>
          </form>
        ) : null}
        <div className="sc-presentation-timeline-zoom-controls">
          <Button size="sm" variant="ghost" onClick={fitTimeline}>
            Fit timeline
          </Button>
          <IconButton size="sm" aria-label="Zoom out" onClick={() => zoomAtCentre(0.8)}>
            <Minus size={iconXs} />
          </IconButton>
          <IconButton size="sm" aria-label="Zoom in" onClick={() => zoomAtCentre(1.25)}>
            <Plus size={iconXs} />
          </IconButton>
        </div>
      </header>
      <div className="sc-presentation-timeline-ruler-row">
        <div className="sc-presentation-timeline-gutter-heading">Targets</div>
        <div
          ref={timeViewportRef}
          className="sc-presentation-timeline-time-viewport"
          onScroll={handleScroll}
          onWheel={handleWheel}
        >
          <div
            className="sc-presentation-timeline-ruler"
            style={contentStyle}
            role="slider"
            tabIndex={0}
            aria-label="Timeline playhead"
            aria-valuemin={0}
            aria-valuemax={durationMs}
            aria-valuenow={playheadMs}
            aria-valuetext={formatPlayheadValue(playheadMs, durationMs)}
            onKeyDown={handlePlayheadKeyDown}
            onPointerCancel={() => {
              playheadPointerIdRef.current = null;
            }}
            onPointerDown={handlePlayheadPointerDown}
            onPointerMove={handlePlayheadPointerMove}
            onPointerUp={handlePlayheadPointerUp}
          >
            {rulerTicks.map((timeMs) => (
              <span
                key={timeMs}
                className="sc-presentation-timeline-ruler-tick"
                data-end={timeMs === durationMs}
                data-time-ms={timeMs}
                style={{ left: timeToPixels(timeMs, snapshot.pixelsPerSecond) }}
              >
                <span>{formatRulerTime(timeMs)}</span>
              </span>
            ))}
            <span
              className="sc-presentation-timeline-ruler-playhead"
              style={{ left: timeToPixels(playheadMs, snapshot.pixelsPerSecond) }}
            />
          </div>
        </div>
      </div>
      <div className="sc-presentation-timeline-row-scroll">
        <div className="sc-presentation-timeline-labels">
          {projection.narration ? (
            <div className="sc-presentation-timeline-target-row">
              <div className="sc-presentation-timeline-target">
                <span className="sc-presentation-timeline-target-label">Narration</span>
                <span className="sc-presentation-timeline-target-summary">Surface audio</span>
              </div>
            </div>
          ) : null}
          {visibleRows.map((row) => (
            <TimelineTargetLabel
              key={row.targetId}
              row={row}
              expanded={snapshot.selectedTargetId === row.targetId}
              hasChildren={ownerTargetIds.has(row.targetId)}
              collapsed={collapsedTargetIds.has(row.targetId)}
              rowRef={(element) => {
                if (element) targetRowRefs.current.set(row.targetId, element);
                else targetRowRefs.current.delete(row.targetId);
              }}
              onSelect={() => void controller.selectTarget(row.targetId)}
              onToggleCollapsed={() => toggleTargetCollapsed(row.targetId)}
            />
          ))}
        </div>
        <div className="sc-presentation-timeline-lane-window" onWheel={handleWheel}>
          <div
            className="sc-presentation-timeline-lanes"
            style={{
              ...contentStyle,
              transform: `translateX(-${snapshot.viewportLeftPx}px)`,
            }}
          >
            <span
              className="sc-presentation-timeline-lane-playhead"
              style={{ left: timeToPixels(playheadMs, snapshot.pixelsPerSecond) }}
            />
            {draftFeedback ? (
              <>
                {draftFeedback.alignmentMs === null ? null : (
                  <span
                    aria-hidden="true"
                    className="sc-presentation-timeline-alignment-guide"
                    style={{
                      left: timeToPixels(draftFeedback.alignmentMs, snapshot.pixelsPerSecond),
                    }}
                  />
                )}
                {draftFeedback.overlaps.map(({ actionId, startMs, endMs }) => (
                  <span
                    key={actionId}
                    aria-hidden="true"
                    className="sc-presentation-timeline-overlap-indicator"
                    style={{
                      left: timeToPixels(startMs, snapshot.pixelsPerSecond),
                      width: timeToPixels(endMs - startMs, snapshot.pixelsPerSecond),
                    }}
                  />
                ))}
              </>
            ) : null}
            {projection.narration ? (
              <PresentationNarrationLane
                key={
                  projection.narration.source.mode === "managed"
                    ? projection.narration.source.mediaId
                    : projection.narration.source.src
                }
                source={projection.narration.source}
                pixelsPerSecond={snapshot.pixelsPerSecond}
                onDurationResolved={expandSurfaceForNarration}
              />
            ) : null}
            {visibleRows.map((row) => (
              <TimelineActionLane
                key={row.targetId}
                row={row}
                expanded={snapshot.selectedTargetId === row.targetId}
                pixelsPerSecond={snapshot.pixelsPerSecond}
                selectedActionId={snapshot.selectedActionId}
                editDraft={snapshot.editDraft}
                controller={controller}
                durationMs={durationMs}
                surfaceId={projection.surfaceId}
                editor={editor}
                onSelectAction={(actionId) => void controller.selectAction(actionId, row.targetId)}
                onCommandError={setAuthoringError}
              />
            ))}
          </div>
        </div>
      </div>
      {editor && snapshot.selectedTargetId ? (
        <PresentationActionEditor editor={editor} controller={controller} projection={projection} />
      ) : null}
      {authoringError ? (
        <p className="sc-presentation-timeline-authoring-error" role="alert">
          {presentPresentationAuthoringCommandError(authoringError)}
        </p>
      ) : null}
      {previewError ? (
        <p className="sc-presentation-timeline-authoring-error" role="alert">
          {presentPresentationPreviewError(previewError)}
        </p>
      ) : null}
    </section>
  );
}

type PresentationPreviewUiError =
  | PresentationPreviewLoadError
  | PresentationPreviewOperationError
  | PresentationPreviewSeekError;

function presentPresentationPreviewError(error: PresentationPreviewUiError): string {
  switch (error.reason) {
    case "preview-load-superseded":
      return "Preview moved to a newer document or slide.";
    case "preview-not-ready":
      return "Preview is still preparing. Try again.";
    case "preview-surface-mismatch":
      return "Preview moved to another slide. Play this slide to reload it.";
    case "preview-not-slideshow":
      return "Presentation preview is available for slideshows.";
    case "preview-surface-not-current":
    case "surface-coverage-missing":
      return "This slide is no longer available to preview.";
    case "preview-surface-not-configured":
      return "Set a duration for this slide before previewing it.";
    case "seek-out-of-range":
      return "The requested preview time is outside this slide.";
    case "preview-document-invalid":
    case "preview-requires-scaffold-plus":
    case "preview-unsupported-core-format":
    case "preview-unavailable-content":
    case "preview-projection-warning":
    case "preview-payload-too-large":
    case "preview-runtime-unavailable":
    case "preview-services-unavailable":
      return "This document cannot be previewed yet.";
    case "surface-coverage-stale":
    case "navigation-destination-not-current":
    case "target-not-current":
    case "target-moved-to-another-surface":
    case "visual-capability-unavailable":
    case "same-target-timed-overlap":
    case "surface-timed-layout-overlap":
      return "Resolve the highlighted Timeline issue before previewing.";
  }
}

function TimelineTargetLabel({
  row,
  expanded,
  hasChildren,
  collapsed,
  rowRef,
  onSelect,
  onToggleCollapsed,
}: {
  readonly row: PresentationTimelineRow;
  readonly expanded: boolean;
  readonly hasChildren: boolean;
  readonly collapsed: boolean;
  readonly rowRef: (element: HTMLDivElement | null) => void;
  readonly onSelect: () => void;
  readonly onToggleCollapsed: () => void;
}) {
  return (
    <div
      ref={rowRef}
      className="sc-presentation-timeline-target-row"
      data-expanded={expanded}
      data-has-children={hasChildren}
      data-target-id={row.targetId}
      style={{ "--sc-presentation-timeline-depth": row.depth } as CSSProperties}
    >
      {hasChildren ? (
        <button
          type="button"
          className="sc-presentation-timeline-disclosure"
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${row.label}`}
          aria-expanded={!collapsed}
          onClick={onToggleCollapsed}
        >
          {collapsed ? "▸" : "▾"}
        </button>
      ) : null}
      <button
        type="button"
        className="sc-presentation-timeline-target"
        aria-label={`Select ${row.label}`}
        aria-pressed={expanded}
        style={{ "--sc-presentation-timeline-depth": row.depth } as CSSProperties}
        onClick={onSelect}
      >
        <span className="sc-presentation-timeline-target-label">{row.label}</span>
        {expanded ? (
          <span className="sc-presentation-timeline-target-summary">
            {row.summary ?? formatActionCount(row.actions.length)}
          </span>
        ) : null}
      </button>
    </div>
  );
}

function visiblePresentationTimelineRows(
  rows: readonly PresentationTimelineRow[],
  rowById: ReadonlyMap<EmbeddedNodeId, PresentationTimelineRow>,
  collapsedTargetIds: ReadonlySet<EmbeddedNodeId>,
): readonly PresentationTimelineRow[] {
  return rows.filter((row) => {
    let parentTargetId = row.parentTargetId;
    const visited = new Set<EmbeddedNodeId>();
    while (parentTargetId) {
      if (visited.has(parentTargetId)) {
        throw new Error(`Presentation Timeline hierarchy contains a cycle at "${parentTargetId}".`);
      }
      visited.add(parentTargetId);
      if (collapsedTargetIds.has(parentTargetId)) return false;
      const parent = rowById.get(parentTargetId);
      if (!parent) {
        throw new Error(`Presentation Timeline parent target "${parentTargetId}" is missing.`);
      }
      parentTargetId = parent.parentTargetId;
    }
    return true;
  });
}

function presentationTimelineAncestorIds(
  targetId: EmbeddedNodeId,
  rowById: ReadonlyMap<EmbeddedNodeId, PresentationTimelineRow>,
): readonly EmbeddedNodeId[] {
  const ancestors: EmbeddedNodeId[] = [];
  let parentTargetId = rowById.get(targetId)?.parentTargetId ?? null;
  while (parentTargetId) {
    if (ancestors.includes(parentTargetId)) {
      throw new Error(`Presentation Timeline hierarchy contains a cycle at "${parentTargetId}".`);
    }
    ancestors.push(parentTargetId);
    const parent = rowById.get(parentTargetId);
    if (!parent)
      throw new Error(`Presentation Timeline parent target "${parentTargetId}" is missing.`);
    parentTargetId = parent.parentTargetId;
  }
  return ancestors;
}

function TimelineActionLane({
  row,
  expanded,
  pixelsPerSecond,
  selectedActionId,
  editDraft,
  controller,
  durationMs,
  surfaceId,
  editor,
  onSelectAction,
  onCommandError,
}: {
  readonly row: PresentationTimelineRow;
  readonly expanded: boolean;
  readonly pixelsPerSecond: number;
  readonly selectedActionId: EmbeddedDataId | null;
  readonly editDraft: ReturnType<PresentationTimelineController["getSnapshot"]>["editDraft"];
  readonly controller: PresentationTimelineController;
  readonly durationMs: number;
  readonly surfaceId: PresentationTimelineProjection["surfaceId"];
  readonly editor: Editor | undefined;
  readonly onSelectAction: (actionId: TimelineActionV1["id"]) => void;
  readonly onCommandError: (error: PresentationAuthoringCommandError | null) => void;
}) {
  const gestureRef = useRef<{
    readonly pointerId: number;
    readonly startX: number;
    readonly action: TimelineActionV1;
    readonly mode: "move" | "resize";
  } | null>(null);

  function beginTemporalEdit(action: TimelineActionV1, event: PointerEvent<HTMLButtonElement>) {
    if (!editor || event.button !== 0 || selectedActionId !== action.id) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const mode =
      durationOfAction(action) > 0 && event.clientX >= bounds.right - 4 ? "resize" : "move";
    gestureRef.current = { pointerId: event.pointerId, startX: event.clientX, action, mode };
    event.currentTarget.setPointerCapture(event.pointerId);
    controller.setEditDraft(
      mode === "resize"
        ? {
            kind: "resize-action",
            actionId: action.id,
            atMs: action.atMs,
            durationMs: durationOfAction(action),
          }
        : { kind: "move-action", actionId: action.id, atMs: action.atMs },
    );
  }

  function updateTemporalDraft(event: PointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaMs = Math.round(((event.clientX - gesture.startX) / pixelsPerSecond) * 1_000);
    const actionDurationMs = durationOfAction(gesture.action);
    if (gesture.mode === "move") {
      controller.setEditDraft({
        kind: "move-action",
        actionId: gesture.action.id,
        atMs: clamp(gesture.action.atMs + deltaMs, 0, durationMs - actionDurationMs),
      });
    } else {
      controller.setEditDraft({
        kind: "resize-action",
        actionId: gesture.action.id,
        atMs: gesture.action.atMs,
        durationMs: clamp(actionDurationMs + deltaMs, 1, durationMs - gesture.action.atMs),
      });
    }
  }

  function finishTemporalEdit(event: PointerEvent<HTMLButtonElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !editor) return;
    gestureRef.current = null;
    const draft = controller.getSnapshot().editDraft;
    controller.clearEditDraft();
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (!draft || draft.actionId !== gesture.action.id) return;
    const result = updatePresentationAction({
      editor,
      surfaceId,
      actionId: gesture.action.id,
      action: temporalAction(gesture.action, draft),
    });
    onCommandError(result.isErr() ? result.error : null);
  }

  function cancelTemporalEdit(): void {
    gestureRef.current = null;
    controller.clearEditDraft();
  }

  function nudgeTemporalEdit(
    action: TimelineActionV1,
    event: KeyboardEvent<HTMLButtonElement>,
  ): void {
    if (
      !editor ||
      selectedActionId !== action.id ||
      (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const deltaMs = (event.shiftKey ? 1_000 : 100) * (event.key === "ArrowLeft" ? -1 : 1);
    const actionDurationMs = durationOfAction(action);
    const draft =
      event.altKey && actionDurationMs > 0
        ? {
            kind: "resize-action" as const,
            actionId: action.id,
            atMs: action.atMs,
            durationMs: clamp(actionDurationMs + deltaMs, 1, durationMs - action.atMs),
          }
        : {
            kind: "move-action" as const,
            actionId: action.id,
            atMs: clamp(action.atMs + deltaMs, 0, durationMs - actionDurationMs),
          };
    const result = updatePresentationAction({
      editor,
      surfaceId,
      actionId: action.id,
      action: temporalAction(action, draft),
    });
    onCommandError(result.isErr() ? result.error : null);
  }

  return (
    <div
      className="sc-presentation-timeline-action-lane"
      data-expanded={expanded}
      aria-label={`${row.label} actions`}
    >
      {row.actions.map((action) => {
        const draft = editDraft?.actionId === action.id ? editDraft : null;
        const atMs = draft?.atMs ?? action.atMs;
        const actionDurationMs =
          draft?.kind === "resize-action" ? draft.durationMs : durationOfAction(action);
        const label = labelForAction(action);
        return (
          <button
            key={action.id}
            type="button"
            className="sc-presentation-timeline-action"
            data-action-kind={action.kind}
            data-enabled={action.isEnabled}
            data-point={actionDurationMs === 0}
            data-draft={draft !== null}
            aria-label={`${label} at ${formatTime(action.atMs)} on ${row.label}`}
            aria-keyshortcuts="ArrowLeft ArrowRight Alt+ArrowLeft Alt+ArrowRight"
            aria-pressed={selectedActionId === action.id}
            onClick={() => onSelectAction(action.id)}
            onKeyDown={(event) => nudgeTemporalEdit(action, event)}
            onPointerCancel={cancelTemporalEdit}
            onPointerDown={(event) => beginTemporalEdit(action, event)}
            onPointerMove={updateTemporalDraft}
            onPointerUp={finishTemporalEdit}
            style={{
              left: timeToPixels(atMs, pixelsPerSecond),
              width: Math.max(6, timeToPixels(actionDurationMs, pixelsPerSecond)),
            }}
          >
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function timeToPixels(timeMs: number, pixelsPerSecond: number): number {
  return (timeMs / 1_000) * pixelsPerSecond;
}

function durationOfAction(action: TimelineActionV1): number {
  if (action.kind !== "animate") return 0;
  if (action.visual.kind === "reveal" || action.visual.kind === "hide") {
    return action.visual.transition.kind === "instant" ? 0 : action.visual.transition.durationMs;
  }
  return action.visual.durationMs;
}

function temporalAction(
  action: TimelineActionV1,
  draft: NonNullable<ReturnType<PresentationTimelineController["getSnapshot"]>["editDraft"]>,
): NewPresentationTimelineAction {
  let updated: TimelineActionV1 = { ...action, atMs: draft.atMs };
  if (draft.kind === "resize-action") {
    if (action.kind !== "animate") {
      throw new Error(`Presentation action "${action.id}" cannot be resized.`);
    }
    const visual = action.visual;
    updated = {
      ...action,
      atMs: draft.atMs,
      visual:
        visual.kind === "reveal" || visual.kind === "hide"
          ? {
              ...visual,
              transition:
                visual.transition.kind === "instant"
                  ? visual.transition
                  : { ...visual.transition, durationMs: draft.durationMs },
            }
          : { ...visual, durationMs: draft.durationMs },
    };
  }
  const { id: _id, ...withoutId } = updated;
  return withoutId;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function deriveDraftFeedback(
  draft: NonNullable<ReturnType<PresentationTimelineController["getSnapshot"]>["editDraft"]>,
  draftAction: TimelineActionV1,
  projection: PresentationTimelineProjection,
  pixelsPerSecond: number,
) {
  const draftDurationMs =
    draft.kind === "resize-action" ? draft.durationMs : durationOfAction(draftAction);
  const draftEndMs = draft.atMs + draftDurationMs;
  const otherActions = projection.rows
    .flatMap(({ actions }) => actions)
    .filter((action) => action.id !== draft.actionId && action.isEnabled);
  const boundaries = otherActions.flatMap((action) => {
    const durationMs = durationOfAction(action);
    return durationMs > 0 ? [action.atMs, action.atMs + durationMs] : [action.atMs];
  });
  const draftEdges = draftDurationMs > 0 ? [draft.atMs, draftEndMs] : [draft.atMs];
  const toleranceMs = (4 / pixelsPerSecond) * 1_000;
  const alignmentMs = boundaries
    .map((boundaryMs) => ({
      boundaryMs,
      distanceMs: Math.min(...draftEdges.map((edgeMs) => Math.abs(edgeMs - boundaryMs))),
    }))
    .filter(({ distanceMs }) => distanceMs <= toleranceMs)
    .sort((left, right) => left.distanceMs - right.distanceMs)[0]?.boundaryMs;
  const overlaps =
    draftAction.isEnabled && draftDurationMs > 0
      ? otherActions.flatMap((action) => {
          const actionEndMs = action.atMs + durationOfAction(action);
          const startMs = Math.max(draft.atMs, action.atMs);
          const endMs = Math.min(draftEndMs, actionEndMs);
          return endMs > startMs ? [{ actionId: action.id, startMs, endMs }] : [];
        })
      : [];
  return { alignmentMs: alignmentMs ?? null, overlaps };
}

function labelForAction(action: TimelineActionV1): string {
  if (action.kind === "animate") {
    return `${action.visual.kind[0]?.toUpperCase()}${action.visual.kind.slice(1)}`;
  }
  if (action.kind === "trigger") return "Trigger";
  return action.kind === "learner-wait" ? "Learner wait" : "Wait";
}

function formatActionCount(count: number): string {
  return `${count} ${count === 1 ? "action" : "actions"}`;
}

function formatTime(timeMs: number): string {
  const seconds = timeMs / 1_000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} seconds`;
}

function formatPlayheadValue(timeMs: number, durationMs: number): string {
  return `${formatTime(timeMs)} of ${formatTime(durationMs)}`;
}

function createRulerTicks(durationMs: number, pixelsPerSecond: number): readonly number[] {
  if (durationMs === 0) return [0];
  const stepsMs = [100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 300_000];
  const stepMs =
    stepsMs.find((candidate) => timeToPixels(candidate, pixelsPerSecond) >= 64) ??
    stepsMs[stepsMs.length - 1]!;
  const ticks: number[] = [];
  for (let timeMs = 0; timeMs <= durationMs; timeMs += stepMs) ticks.push(timeMs);
  if (ticks[ticks.length - 1] !== durationMs) ticks.push(durationMs);
  return ticks;
}

function formatRulerTime(timeMs: number): string {
  const totalSeconds = timeMs / 1_000;
  if (totalSeconds < 60) return `${Number(totalSeconds.toFixed(1))}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
