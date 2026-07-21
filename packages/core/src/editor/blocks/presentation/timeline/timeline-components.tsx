import {
  CaretDownIcon as CaretDown,
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  CaretUpIcon as CaretUp,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useLayoutEffect, useRef } from "react";

export interface TimelineOptions {
  showAxis: boolean;
  alignment: "alternate" | "left" | "right";
  presentation: "vertical" | "carousel";
}

type TimelineNavAxis = "x" | "y";

export function readTimelineOptions(value: unknown): TimelineOptions {
  const raw = readObject(value);
  const alignment =
    raw["alignment"] === "left" || raw["alignment"] === "right" ? raw["alignment"] : "alternate";
  const presentation = raw["presentation"] === "carousel" ? "carousel" : "vertical";
  return {
    showAxis: raw["showAxis"] !== false,
    alignment,
    presentation,
  };
}

export function readRequiredTimelineNodeId(
  value: unknown,
  nodeType: "timeline" | "timeline item",
): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`${nodeType} node is missing a stable id.`);
}

export function TimelineTrack({
  children,
  eventCount,
  footer,
  options,
}: {
  children: ReactNode;
  eventCount: number;
  footer?: ReactNode;
  options: TimelineOptions;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const navAxis = resolveTimelineNavAxis(options);

  // Both vertical + horizontal carousel-style timelines use a sub-scroll
  // container with leading + trailing padding so first / last events can
  // snap-centre. That padding pushes the scroll origin, so scroll the first
  // event into view on mount instead of leaving blank padding in view.
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const firstEvent = track.querySelector<HTMLElement>("[data-timeline-event]");
    if (!firstEvent) return;

    const eventRect = firstEvent.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    if (navAxis === "x") {
      const offset = eventRect.left + eventRect.width / 2 - (trackRect.left + trackRect.width / 2);
      track.scrollBy({ left: offset, behavior: "auto" });
      return;
    }

    const offset = eventRect.top + eventRect.height / 2 - (trackRect.top + trackRect.height / 2);
    track.scrollBy({ top: offset, behavior: "auto" });
  }, [navAxis]);

  const scrollByOneSlot = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const firstSlot = track.querySelector<HTMLElement>("[data-timeline-event]");
    const rect = firstSlot?.getBoundingClientRect();
    if (navAxis === "x") {
      const slot = rect ? rect.width : track.clientWidth * 0.3;
      track.scrollBy({ left: direction * (slot + 16), behavior: "smooth" });
      return;
    }

    const slot = rect ? rect.height : track.clientHeight * 0.3;
    track.scrollBy({ top: direction * (slot + 36), behavior: "smooth" });
  };

  return (
    <>
      <div className="sc-timeline__track" ref={trackRef}>
        <div className="sc-timeline__rail">
          {children}
          {footer}
        </div>
      </div>
      {eventCount > 0 ? (
        <TimelineNavigation
          axis={navAxis}
          onNext={() => scrollByOneSlot(1)}
          onPrevious={() => scrollByOneSlot(-1)}
        />
      ) : null}
    </>
  );
}

export function TimelineEventCard({
  children,
  chrome,
}: {
  children: ReactNode;
  chrome?: ReactNode;
}) {
  return (
    <>
      <span aria-hidden className="sc-timeline__dot" />
      <div data-timeline-card="" className="sc-timeline__card">
        {chrome}
        <div className="sc-timeline__content">{children}</div>
      </div>
    </>
  );
}

function TimelineNavigation({
  axis,
  onNext,
  onPrevious,
}: {
  axis: TimelineNavAxis;
  onNext: () => void;
  onPrevious: () => void;
}) {
  return (
    <div
      className="sc-timeline__carousel-nav"
      data-axis={axis}
      contentEditable={false}
      aria-label="Timeline navigation"
    >
      <button
        type="button"
        className="sc-timeline__carousel-button"
        aria-label={axis === "x" ? "Previous event" : "Earlier event"}
        onClick={onPrevious}
      >
        {axis === "x" ? (
          <CaretLeft size={14} weight="bold" aria-hidden />
        ) : (
          <CaretUp size={14} weight="bold" aria-hidden />
        )}
      </button>
      <button
        type="button"
        className="sc-timeline__carousel-button"
        aria-label={axis === "x" ? "Next event" : "Later event"}
        onClick={onNext}
      >
        {axis === "x" ? (
          <CaretRight size={14} weight="bold" aria-hidden />
        ) : (
          <CaretDown size={14} weight="bold" aria-hidden />
        )}
      </button>
    </div>
  );
}

function resolveTimelineNavAxis(options: TimelineOptions): TimelineNavAxis {
  return options.presentation === "carousel" ? "x" : "y";
}

function readObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
