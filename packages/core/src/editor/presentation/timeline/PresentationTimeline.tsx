import type { EmbeddedDataId, TimelineActionV1 } from "@scaffold/contracts";
import { MinusIcon as Minus, PlusIcon as Plus } from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type UIEvent,
  type WheelEvent,
} from "react";

import { Button } from "@/ui/components/Button/Button";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { iconXs } from "@/ui/tokens/icon-sizes";

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
}

export function PresentationTimeline({
  controller,
  projection,
  ariaLabel = "Presentation timeline",
}: PresentationTimelineProps) {
  const timeViewportRef = useRef<HTMLDivElement>(null);
  const playheadPointerIdRef = useRef<number | null>(null);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const durationMs = projection.durationMs ?? 0;
  const contentWidthPx = (durationMs / 1_000) * snapshot.pixelsPerSecond;
  const contentStyle = {
    "--sc-presentation-timeline-content-width": `${contentWidthPx}px`,
  } as CSSProperties;
  const rulerTicks = createRulerTicks(durationMs, snapshot.pixelsPerSecond);

  useEffect(() => {
    const viewport = timeViewportRef.current;
    if (viewport && viewport.scrollLeft !== snapshot.viewportLeftPx) {
      viewport.scrollLeft = snapshot.viewportLeftPx;
    }
  }, [snapshot.viewportLeftPx]);

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
    controller.setPlayheadDraft(Math.max(0, timeMs), durationMs);
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
        nextTimeMs = snapshot.playheadDraftMs - stepMs;
        break;
      case "ArrowRight":
        nextTimeMs = snapshot.playheadDraftMs + stepMs;
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
    controller.setPlayheadDraft(Math.max(0, nextTimeMs), durationMs);
  }

  return (
    <section className="sc-presentation-timeline" aria-label={ariaLabel}>
      <header className="sc-presentation-timeline-toolbar">
        <h2>Timeline</h2>
        <span className="sc-presentation-timeline-time-readout" aria-hidden="true">
          {formatTime(snapshot.playheadDraftMs)} / {formatTime(durationMs)}
        </span>
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
            aria-valuenow={snapshot.playheadDraftMs}
            aria-valuetext={formatPlayheadValue(snapshot.playheadDraftMs, durationMs)}
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
              style={{ left: timeToPixels(snapshot.playheadDraftMs, snapshot.pixelsPerSecond) }}
            />
          </div>
        </div>
      </div>
      <div className="sc-presentation-timeline-row-scroll">
        <div className="sc-presentation-timeline-labels">
          {projection.rows.map((row) => (
            <TimelineTargetLabel
              key={row.targetId}
              row={row}
              expanded={snapshot.selectedTargetId === row.targetId}
              onSelect={() => void controller.selectTarget(row.targetId)}
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
              style={{ left: timeToPixels(snapshot.playheadDraftMs, snapshot.pixelsPerSecond) }}
            />
            {projection.rows.map((row) => (
              <TimelineActionLane
                key={row.targetId}
                row={row}
                expanded={snapshot.selectedTargetId === row.targetId}
                pixelsPerSecond={snapshot.pixelsPerSecond}
                selectedActionId={snapshot.selectedActionId}
                onSelectAction={(actionId) => void controller.selectAction(actionId, row.targetId)}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineTargetLabel({
  row,
  expanded,
  onSelect,
}: {
  readonly row: PresentationTimelineRow;
  readonly expanded: boolean;
  readonly onSelect: () => void;
}) {
  return (
    <div
      className="sc-presentation-timeline-target-row"
      data-expanded={expanded}
      data-target-id={row.targetId}
    >
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

function TimelineActionLane({
  row,
  expanded,
  pixelsPerSecond,
  selectedActionId,
  onSelectAction,
}: {
  readonly row: PresentationTimelineRow;
  readonly expanded: boolean;
  readonly pixelsPerSecond: number;
  readonly selectedActionId: EmbeddedDataId | null;
  readonly onSelectAction: (actionId: TimelineActionV1["id"]) => void;
}) {
  return (
    <div
      className="sc-presentation-timeline-action-lane"
      data-expanded={expanded}
      aria-label={`${row.label} actions`}
    >
      {row.actions.map((action) => {
        const actionDurationMs = durationOfAction(action);
        const label = labelForAction(action);
        return (
          <button
            key={action.id}
            type="button"
            className="sc-presentation-timeline-action"
            data-action-kind={action.kind}
            data-enabled={action.isEnabled}
            data-point={actionDurationMs === 0}
            aria-label={`${label} at ${formatTime(action.atMs)} on ${row.label}`}
            aria-pressed={selectedActionId === action.id}
            onClick={() => onSelectAction(action.id)}
            style={{
              left: timeToPixels(action.atMs, pixelsPerSecond),
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
