import {
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
} from "@phosphor-icons/react";
import { useId, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";

export interface TimelineOptions {
  showAxis: boolean;
  alignment: "alternate" | "left" | "right";
  presentation: "vertical" | "carousel";
}

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
  const initialisedPresentationRef = useRef<TimelineOptions["presentation"] | null>(null);
  const trackId = useId();
  const [navigation, setNavigation] = useState({
    canNext: false,
    canPrevious: false,
    currentIndex: 0,
    visible: false,
  });

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    if (
      options.presentation === "carousel" &&
      initialisedPresentationRef.current !== "carousel"
    ) {
      scrollTimelineEventIntoView(track, 0, "auto");
    }
    initialisedPresentationRef.current = options.presentation;

    const updateNavigation = () => {
      if (options.presentation !== "carousel") {
        setNavigation((current) =>
          current.visible
            ? { canNext: false, canPrevious: false, currentIndex: 0, visible: false }
            : current,
        );
        return;
      }

      const events = timelineEvents(track);
      const hasOverflow = track.scrollWidth > track.clientWidth + 1;
      const currentIndex = nearestTimelineEventIndex(track, events);
      setNavigation({
        canNext: hasOverflow && currentIndex < events.length - 1,
        canPrevious: hasOverflow && currentIndex > 0,
        currentIndex,
        visible: hasOverflow && events.length > 1,
      });
    };

    updateNavigation();
    track.addEventListener("scroll", updateNavigation, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateNavigation);
    resizeObserver?.observe(track);

    return () => {
      track.removeEventListener("scroll", updateNavigation);
      resizeObserver?.disconnect();
    };
  }, [eventCount, options.presentation]);

  const scrollByOneEvent = (direction: 1 | -1, event: MouseEvent<HTMLButtonElement>) => {
    const track = trackRef.current;
    if (!track) return;
    const events = timelineEvents(track);
    const targetIndex = Math.max(
      0,
      Math.min(events.length - 1, navigation.currentIndex + direction),
    );
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const behavior = event.detail === 0 || reduceMotion ? "auto" : "smooth";
    scrollTimelineEventIntoView(track, targetIndex, behavior);
  };

  return (
    <>
      <div id={trackId} className="sc-course-timeline__track" ref={trackRef}>
        <div className="sc-course-timeline__rail">
          {children}
          {footer}
        </div>
      </div>
      {navigation.visible ? (
        <TimelineNavigation
          canNext={navigation.canNext}
          canPrevious={navigation.canPrevious}
          controls={trackId}
          onNext={(event) => scrollByOneEvent(1, event)}
          onPrevious={(event) => scrollByOneEvent(-1, event)}
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
      <span aria-hidden className="sc-course-timeline__dot" />
      <div data-timeline-card="" className="sc-course-timeline__card">
        {chrome ? (
          <div contentEditable={false} className="sc-app-timeline-chrome">
            {chrome}
          </div>
        ) : null}
        <div className="sc-course-timeline__content">{children}</div>
      </div>
    </>
  );
}

function TimelineNavigation({
  canNext,
  canPrevious,
  controls,
  onNext,
  onPrevious,
}: {
  canNext: boolean;
  canPrevious: boolean;
  controls: string;
  onNext: (event: MouseEvent<HTMLButtonElement>) => void;
  onPrevious: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <nav
      className="sc-course-timeline__navigation"
      contentEditable={false}
      aria-label="Timeline navigation"
    >
      <button
        type="button"
        className="sc-course-timeline__navigation-button"
        aria-controls={controls}
        aria-label="Previous event"
        disabled={!canPrevious}
        onClick={onPrevious}
      >
        <CaretLeft size={16} weight="bold" aria-hidden />
      </button>
      <button
        type="button"
        className="sc-course-timeline__navigation-button"
        aria-controls={controls}
        aria-label="Next event"
        disabled={!canNext}
        onClick={onNext}
      >
        <CaretRight size={16} weight="bold" aria-hidden />
      </button>
    </nav>
  );
}

function timelineEvents(track: HTMLElement): HTMLElement[] {
  return Array.from(track.querySelectorAll<HTMLElement>("[data-timeline-event]"));
}

function nearestTimelineEventIndex(track: HTMLElement, events: HTMLElement[]): number {
  if (events.length === 0) return 0;
  const trackRect = track.getBoundingClientRect();
  const trackCenter = trackRect.left + trackRect.width / 2;
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  events.forEach((timelineEvent, index) => {
    const eventRect = timelineEvent.getBoundingClientRect();
    const distance = Math.abs(eventRect.left + eventRect.width / 2 - trackCenter);
    if (distance >= nearestDistance) return;
    nearestDistance = distance;
    nearestIndex = index;
  });

  return nearestIndex;
}

function scrollTimelineEventIntoView(
  track: HTMLElement,
  eventIndex: number,
  behavior: ScrollBehavior,
) {
  const timelineEvent = timelineEvents(track)[eventIndex];
  if (!timelineEvent) return;
  const trackRect = track.getBoundingClientRect();
  const eventRect = timelineEvent.getBoundingClientRect();
  const centeredLeft =
    track.scrollLeft +
    eventRect.left -
    trackRect.left -
    (track.clientWidth - eventRect.width) / 2;
  track.scrollTo({ left: centeredLeft, behavior });
}

function readObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
