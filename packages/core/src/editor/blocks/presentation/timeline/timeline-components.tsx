import { CaretLeftIcon as CaretLeft, CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import {
  useId,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
} from "react";

import type { TimelineRuntimeController } from "./timeline-runtime-controller";

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
  controller,
  eventCount,
  footer,
  onTrackElementChange,
  options,
}: {
  children: ReactNode;
  controller?: TimelineRuntimeController;
  eventCount: number;
  footer?: ReactNode;
  onTrackElementChange?: (element: HTMLDivElement | null) => void;
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
  const setTrackRef = useCallback(
    (element: HTMLDivElement | null) => {
      trackRef.current = element;
      onTrackElementChange?.(element);
    },
    [onTrackElementChange],
  );

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const detachController = controller?.attach(track);

    if (options.presentation === "carousel" && initialisedPresentationRef.current !== "carousel") {
      scrollTimelineEventAtIndex(track, 0, "auto");
    }
    initialisedPresentationRef.current = options.presentation;

    const updateNavigation = () => {
      const hasOverflow =
        options.presentation === "carousel"
          ? track.scrollWidth > track.clientWidth + 1
          : track.scrollHeight > track.clientHeight + 1;
      track.toggleAttribute("data-timeline-scrollable", hasOverflow);

      if (options.presentation !== "carousel") {
        setNavigation((current) =>
          current.visible
            ? { canNext: false, canPrevious: false, currentIndex: 0, visible: false }
            : current,
        );
        return;
      }

      const events = timelineEvents(track);
      const currentIndex = nearestTimelineEventIndex(track, events);
      setNavigation({
        canNext: hasOverflow && currentIndex < events.length - 1,
        canPrevious: hasOverflow && currentIndex > 0,
        currentIndex,
        visible: hasOverflow && events.length > 1,
      });
    };

    updateNavigation();
    controller?.reconcile();
    track.addEventListener("scroll", updateNavigation, { passive: true });
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            updateNavigation();
            controller?.reconcile();
          });
    resizeObserver?.observe(track);
    const rail = track.querySelector<HTMLElement>(".sc-course-timeline__rail");
    if (rail) resizeObserver?.observe(rail);

    return () => {
      track.removeEventListener("scroll", updateNavigation);
      resizeObserver?.disconnect();
      detachController?.();
    };
  }, [controller, eventCount, options.presentation]);

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
    const targetId = events[targetIndex]?.dataset.timelineEntryId;
    if (controller && targetId) {
      void controller.navigateTo({ behavior, origin: "learner", targetId });
      return;
    }
    scrollTimelineEventAtIndex(track, targetIndex, behavior);
  };

  return (
    <>
      <div id={trackId} className="sc-course-timeline__track" ref={setTrackRef}>
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
  cardProps,
  children,
  chrome,
}: {
  cardProps?: Omit<ComponentPropsWithoutRef<"div">, "children" | "className">;
  children: ReactNode;
  chrome?: ReactNode;
}) {
  return (
    <>
      <span aria-hidden className="sc-course-timeline__dot" />
      <div
        {...cardProps}
        data-authoring-chrome={chrome ? "" : undefined}
        data-timeline-card=""
        className="sc-course-timeline__card"
      >
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

function scrollTimelineEventAtIndex(
  track: HTMLElement,
  eventIndex: number,
  behavior: ScrollBehavior,
) {
  const timelineEvent = timelineEvents(track)[eventIndex];
  if (!timelineEvent) return;
  scrollTimelineEventIntoView(track, timelineEvent, "carousel", behavior);
}

export function scrollTimelineEventIntoView(
  track: HTMLElement,
  timelineEvent: HTMLElement,
  presentation: TimelineOptions["presentation"],
  behavior: ScrollBehavior,
) {
  const trackRect = track.getBoundingClientRect();
  const eventRect = timelineEvent.getBoundingClientRect();
  if (presentation === "vertical") {
    const centeredTop =
      track.scrollTop + eventRect.top - trackRect.top - (track.clientHeight - eventRect.height) / 2;
    track.scrollTo({ top: centeredTop, behavior });
    return;
  }
  const centeredLeft =
    track.scrollLeft + eventRect.left - trackRect.left - (track.clientWidth - eventRect.width) / 2;
  track.scrollTo({ left: centeredLeft, behavior });
}

function readObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
