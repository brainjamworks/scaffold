import type {
  PresentationSurfaceNarrationController,
  PresentationSurfaceNarrationSnapshot,
} from "./narration/presentation-surface-narration-controller";

export interface PresentationPlaybackClockSource {
  nowMs(): number;
  subscribe(listener: () => void): () => void;
}

export interface ReplaceablePresentationPlaybackClock extends PresentationPlaybackClockSource {
  replaceSource(source: PresentationPlaybackClockSource): void;
}

export interface PresentationNarrationClockSource extends PresentationPlaybackClockSource {
  readonly surfaceId: PresentationSurfaceNarrationController["surfaceId"];
}

type PresentationNarrationClockPort = Pick<
  PresentationSurfaceNarrationController,
  "surfaceId" | "getSnapshot" | "subscribe"
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
  let source = initialSource;
  let sourceAnchorMs = finiteClockReading(source.nowMs());
  let clockAnchorMs = sourceAnchorMs;
  let unsubscribeFromSource: (() => void) | null = null;
  const listeners = new Set<() => void>();

  const read = () => clockAnchorMs + (finiteClockReading(source.nowMs()) - sourceAnchorMs);

  const subscribeToSource = () => {
    unsubscribeFromSource = source.subscribe(() => {
      for (const listener of [...listeners]) listener();
    });
  };

  return Object.freeze({
    nowMs: read,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) subscribeToSource();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
        if (listeners.size > 0) return;
        unsubscribeFromSource?.();
        unsubscribeFromSource = null;
      };
    },
    replaceSource(nextSource: PresentationPlaybackClockSource) {
      const preservedReadingMs = read();
      const nextSourceReadingMs = finiteClockReading(nextSource.nowMs());
      unsubscribeFromSource?.();
      unsubscribeFromSource = null;
      source = nextSource;
      sourceAnchorMs = nextSourceReadingMs;
      clockAnchorMs = preservedReadingMs;
      if (listeners.size > 0) subscribeToSource();
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
  let confirmedTimeMs = confirmedTimeFrom(initialSnapshot);

  const refreshConfirmedTime = () => {
    const nextSnapshot = controller.getSnapshot();
    switch (nextSnapshot.status) {
      case "playing":
      case "paused":
      case "ended":
        confirmedTimeMs = confirmedTimeFrom(nextSnapshot);
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
    subscribe(listener: () => void) {
      return controller.subscribe(() => {
        refreshConfirmedTime();
        listener();
      });
    },
  });
}

function confirmedTimeFrom(snapshot: PresentationSurfaceNarrationSnapshot): number {
  if (!Number.isSafeInteger(snapshot.currentTimeMs) || snapshot.currentTimeMs < 0) {
    throw new Error("Presentation narration clock received an invalid confirmed media time.");
  }
  return snapshot.currentTimeMs;
}

function finiteClockReading(readingMs: number): number {
  if (!Number.isFinite(readingMs)) {
    throw new Error("Presentation clock source must return a finite reading.");
  }
  return readingMs;
}
