import { scrollTimelineEventIntoView } from "./timeline-components";

export type TimelineCurrentOrigin =
  | "learner"
  | "semantic-activation"
  | "control-command"
  | "reconciliation";

export type TimelineNavigationResult = "settled" | "cancelled" | "unavailable";

export interface TimelineCurrentChange {
  readonly previousEntryId: string | null;
  readonly entryId: string;
  readonly origin: TimelineCurrentOrigin;
}

interface NavigateOptions {
  readonly behavior?: ScrollBehavior;
  readonly origin: Exclude<TimelineCurrentOrigin, "reconciliation">;
  readonly signal?: AbortSignal;
  readonly targetId: string;
}

interface PendingSettlement {
  readonly finish?: (result: TimelineNavigationResult) => void;
  readonly handleAbort?: () => void;
  readonly origin: TimelineCurrentOrigin;
  readonly signal?: AbortSignal;
  readonly targetId: string | null;
}

type CurrentChangeListener = (change: TimelineCurrentChange) => void;

export interface TimelineRuntimeController {
  readonly attach: (track: HTMLElement) => () => void;
  readonly getCurrentEntryId: () => string | null;
  readonly navigateTo: (options: NavigateOptions) => Promise<TimelineNavigationResult>;
  readonly reconcile: () => void;
  readonly subscribeToChanges: (listener: CurrentChangeListener) => () => void;
}

const SETTLEMENT_QUIET_MS = 80;

export function createTimelineRuntimeController(
  getTrackElement: () => HTMLElement | null,
): TimelineRuntimeController {
  let attachedTrack: HTMLElement | null = null;
  let currentEntryId: string | null = null;
  let pending: PendingSettlement | null = null;
  let settleTimer: ReturnType<typeof setTimeout> | null = null;
  const changeListeners = new Set<CurrentChangeListener>();

  const clearSettlementTimer = () => {
    if (settleTimer === null) return;
    clearTimeout(settleTimer);
    settleTimer = null;
  };
  const closePending = (result: TimelineNavigationResult) => {
    const closing = pending;
    if (!closing) return;
    pending = null;
    if (closing.signal && closing.handleAbort) {
      closing.signal.removeEventListener("abort", closing.handleAbort);
    }
    closing.finish?.(result);
  };
  const commitCurrent = (entryId: string, origin: TimelineCurrentOrigin) => {
    if (entryId === currentEntryId) return;
    const previousEntryId = currentEntryId;
    currentEntryId = entryId;
    const change = Object.freeze({ previousEntryId, entryId, origin });
    for (const listener of [...changeListeners]) listener(change);
  };
  const settle = () => {
    clearSettlementTimer();
    const track = attachedTrack ?? getTrackElement();
    if (!track) {
      closePending("unavailable");
      return;
    }
    const nearestId = nearestTimelineEntryId(track);
    if (!nearestId) {
      closePending("unavailable");
      return;
    }
    if (!pending) {
      commitCurrent(nearestId, "reconciliation");
      return;
    }
    if (pending.targetId !== null && pending.targetId !== nearestId) {
      closePending("unavailable");
      return;
    }
    commitCurrent(nearestId, pending.origin);
    closePending("settled");
  };
  const scheduleSettlement = () => {
    clearSettlementTimer();
    settleTimer = setTimeout(settle, SETTLEMENT_QUIET_MS);
  };
  const beginLearnerGesture = () => {
    if (pending?.origin !== "learner") closePending("cancelled");
    pending ??= { origin: "learner", targetId: null };
  };
  const beginDiscreteLearnerGesture = () => {
    beginLearnerGesture();
    scheduleSettlement();
  };
  const handleScroll = () => {
    pending ??= { origin: "reconciliation", targetId: null };
    scheduleSettlement();
  };

  const attach: TimelineRuntimeController["attach"] = (track) => {
    attachedTrack = track;
    track.addEventListener("scroll", handleScroll, { passive: true });
    track.addEventListener("scrollend", settle);
    track.addEventListener("pointerdown", beginLearnerGesture, { passive: true });
    track.addEventListener("touchstart", beginLearnerGesture, { passive: true });
    track.addEventListener("wheel", beginDiscreteLearnerGesture, { passive: true });
    track.addEventListener("keydown", beginDiscreteLearnerGesture);
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      track.removeEventListener("scroll", handleScroll);
      track.removeEventListener("scrollend", settle);
      track.removeEventListener("pointerdown", beginLearnerGesture);
      track.removeEventListener("touchstart", beginLearnerGesture);
      track.removeEventListener("wheel", beginDiscreteLearnerGesture);
      track.removeEventListener("keydown", beginDiscreteLearnerGesture);
      if (attachedTrack !== track) return;
      attachedTrack = null;
      clearSettlementTimer();
      closePending("unavailable");
    };
  };
  const navigateTo: TimelineRuntimeController["navigateTo"] = ({
    behavior,
    origin,
    signal,
    targetId,
  }) => {
    if (signal?.aborted) return Promise.resolve("cancelled");
    const track = attachedTrack ?? getTrackElement();
    const target = track ? timelineEventById(track, targetId) : null;
    if (!track || !target) return Promise.resolve("unavailable");
    if (currentEntryId === targetId && nearestTimelineEntryId(track) === targetId) {
      return Promise.resolve("settled");
    }

    closePending("cancelled");
    return new Promise<TimelineNavigationResult>((resolve) => {
      const handleAbort = () => {
        if (pending?.finish !== resolve) return;
        closePending("cancelled");
        pending = { origin: "reconciliation", targetId: null };
        scheduleSettlement();
      };
      pending = {
        finish: resolve,
        handleAbort,
        origin,
        targetId,
        ...(signal ? { signal } : {}),
      };
      signal?.addEventListener("abort", handleAbort, { once: true });
      if (signal?.aborted) {
        handleAbort();
        return;
      }
      const reduceMotion =
        track.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches === true;
      scrollTimelineEventIntoView(
        track,
        target,
        "carousel",
        behavior ?? (reduceMotion ? "auto" : "smooth"),
      );
      scheduleSettlement();
    });
  };
  const reconcile: TimelineRuntimeController["reconcile"] = () => {
    const track = attachedTrack ?? getTrackElement();
    if (!track) return;
    if (pending?.targetId && !timelineEventById(track, pending.targetId)) {
      closePending("unavailable");
    }
    if (pending) return;
    const nearestId = nearestTimelineEntryId(track);
    if (nearestId) commitCurrent(nearestId, "reconciliation");
  };
  const subscribeToChanges: TimelineRuntimeController["subscribeToChanges"] = (listener) => {
    changeListeners.add(listener);
    return () => {
      changeListeners.delete(listener);
    };
  };

  return Object.freeze({
    attach,
    getCurrentEntryId: () => currentEntryId,
    navigateTo,
    reconcile,
    subscribeToChanges,
  });
}

function timelineEventById(track: HTMLElement, targetId: string): HTMLElement | null {
  return (
    timelineEvents(track).find((candidate) => candidate.dataset.timelineEntryId === targetId) ??
    null
  );
}

function nearestTimelineEntryId(track: HTMLElement): string | null {
  const events = timelineEvents(track);
  if (events.length === 0) return null;
  const trackRect = track.getBoundingClientRect();
  const trackCenter = trackRect.left + trackRect.width / 2;
  let nearest: HTMLElement | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const timelineEvent of events) {
    const eventRect = timelineEvent.getBoundingClientRect();
    const distance = Math.abs(eventRect.left + eventRect.width / 2 - trackCenter);
    if (distance >= nearestDistance) continue;
    nearest = timelineEvent;
    nearestDistance = distance;
  }
  return nearest?.dataset.timelineEntryId ?? null;
}

function timelineEvents(track: HTMLElement): HTMLElement[] {
  return Array.from(track.querySelectorAll<HTMLElement>("[data-timeline-entry-id]"));
}
