import type { PresentationSurfaceNarrationController } from "./narration/presentation-surface-narration-controller";

export interface PresentationPlaybackClockReadingSource {
  nowMs(): number;
}

export interface PresentationPlaybackClockSource extends PresentationPlaybackClockReadingSource {
  subscribe(listener: () => void): () => void;
}

export interface ReplaceablePresentationPlaybackClock extends PresentationPlaybackClockSource {
  replaceSource(source: PresentationPlaybackClockReadingSource): void;
}

export interface PresentationNarrationClockSource extends PresentationPlaybackClockReadingSource {
  readonly surfaceId: PresentationSurfaceNarrationController["surfaceId"];
}

type PresentationNarrationClockPort = Pick<
  PresentationSurfaceNarrationController,
  "surfaceId" | "getSnapshot" | "getClockTimeMs"
>;

export function createAnimationFramePresentationMonotonicClock(): PresentationPlaybackClockSource {
  return Object.freeze({
    nowMs: () => performance.now(),
    subscribe(listener: () => void) {
      let active = true;
      let frameId = requestAnimationFrame(onFrame);

      function onFrame(): void {
        if (!active) return;
        listener();
        if (active) frameId = requestAnimationFrame(onFrame);
      }

      return () => {
        if (!active) return;
        active = false;
        cancelAnimationFrame(frameId);
      };
    },
  });
}

export function createReplaceablePresentationPlaybackClock(
  initialSource: PresentationPlaybackClockSource,
): ReplaceablePresentationPlaybackClock {
  let readingSource: PresentationPlaybackClockReadingSource = initialSource;
  let sourceAnchorMs = finiteClockReading(readingSource.nowMs());
  let clockAnchorMs = sourceAnchorMs;
  let unsubscribeFromHeartbeat: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const read = () => clockAnchorMs + (finiteClockReading(readingSource.nowMs()) - sourceAnchorMs);

  const subscribeToHeartbeat = () => {
    unsubscribeFromHeartbeat = initialSource.subscribe(() => {
      for (const listener of [...listeners]) listener();
    });
  };

  return Object.freeze({
    nowMs: read,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) subscribeToHeartbeat();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
        if (listeners.size > 0) return;
        unsubscribeFromHeartbeat?.();
        unsubscribeFromHeartbeat = null;
      };
    },
    replaceSource(nextSource: PresentationPlaybackClockReadingSource) {
      const preservedReadingMs = read();
      const nextSourceReadingMs = finiteClockReading(nextSource.nowMs());
      readingSource = nextSource;
      sourceAnchorMs = nextSourceReadingMs;
      clockAnchorMs = preservedReadingMs;
      for (const listener of [...listeners]) listener();
    },
  });
}

export function createPresentationNarrationClockSource(
  controller: PresentationNarrationClockPort,
): PresentationNarrationClockSource {
  const initialSnapshot = controller.getSnapshot();
  if (initialSnapshot.status !== "playing") {
    throw new Error("Presentation narration clock requires confirmed playing media.");
  }
  let confirmedTimeMs = confirmedTimeFrom(controller.getClockTimeMs());

  const refreshConfirmedTime = () => {
    const nextSnapshot = controller.getSnapshot();
    switch (nextSnapshot.status) {
      case "playing":
        confirmedTimeMs = confirmedTimeFrom(controller.getClockTimeMs());
        return;
      case "paused":
      case "ended":
        confirmedTimeMs = confirmedTimeFrom(nextSnapshot.currentTimeMs);
        return;
      case "buffering":
      case "seeking":
      case "failed":
        return;
      case "idle":
      case "loading":
        throw new Error("Active Presentation narration clock lost its loaded media source.");
    }
  };

  return Object.freeze({
    surfaceId: controller.surfaceId,
    nowMs() {
      refreshConfirmedTime();
      return confirmedTimeMs;
    },
  });
}

function confirmedTimeFrom(currentTimeMs: number): number {
  if (!Number.isSafeInteger(currentTimeMs) || currentTimeMs < 0) {
    throw new Error("Presentation narration clock received an invalid confirmed media time.");
  }
  return currentTimeMs;
}

function finiteClockReading(readingMs: number): number {
  if (!Number.isFinite(readingMs)) {
    throw new Error("Presentation clock source must return a finite reading.");
  }
  return readingMs;
}
