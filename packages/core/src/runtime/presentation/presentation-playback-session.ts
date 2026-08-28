import { Result, type Result as ResultType } from "better-result";

import type { CompiledInternalClockSurfaceTimeline } from "./compiled-presentation-program";
import {
  createAnimationFramePresentationMonotonicClock,
  type PresentationMonotonicClockPort,
} from "./presentation-monotonic-clock";
import { createPresentationPlaybackMachine } from "./presentation-playback-machine";

export type PresentationPlaybackPhase =
  | "awaiting-start"
  | "playing"
  | "paused"
  | "completed"
  | "stopped";

export interface PresentationPlaybackSnapshot {
  readonly phase: PresentationPlaybackPhase;
  readonly runNumber: number;
  readonly surfaceId: string;
  readonly currentTimeMs: number;
  readonly durationMs: number;
}

export interface PresentationSeekError {
  readonly reason: "seek-out-of-range";
  readonly requestedTimeMs: number;
  readonly durationMs: number;
}

export type PresentationSeekResult = ResultType<void, PresentationSeekError>;

export interface PresentationPlaybackSession {
  getSnapshot(): PresentationPlaybackSnapshot;
  subscribe(listener: () => void): () => void;
  play(): void;
  pause(): void;
  seek(timeMs: number): PresentationSeekResult;
  restart(): void;
  stop(): void;
  dispose(): void;
}

export interface CreatePresentationPlaybackSessionInput {
  readonly timeline: CompiledInternalClockSurfaceTimeline;
  readonly monotonicClock?: PresentationMonotonicClockPort;
}

function snapshotsAreEqual(
  left: PresentationPlaybackSnapshot,
  right: PresentationPlaybackSnapshot,
): boolean {
  return (
    left.phase === right.phase &&
    left.runNumber === right.runNumber &&
    left.surfaceId === right.surfaceId &&
    left.currentTimeMs === right.currentTimeMs &&
    left.durationMs === right.durationMs
  );
}

function freezeSnapshot(snapshot: PresentationPlaybackSnapshot): PresentationPlaybackSnapshot {
  return Object.freeze({
    phase: snapshot.phase,
    runNumber: snapshot.runNumber,
    surfaceId: snapshot.surfaceId,
    currentTimeMs: snapshot.currentTimeMs,
    durationMs: snapshot.durationMs,
  });
}

export function createPresentationPlaybackSession({
  timeline,
  monotonicClock = createAnimationFramePresentationMonotonicClock(),
}: CreatePresentationPlaybackSessionInput): PresentationPlaybackSession {
  const machine = createPresentationPlaybackMachine({ timeline, monotonicClock });
  const listeners = new Set<() => void>();
  let disposed = false;
  let snapshot = freezeSnapshot(machine.getSnapshot());

  const unsubscribeFromMachine = machine.subscribe((machineSnapshot) => {
    const nextSnapshot = freezeSnapshot(machineSnapshot);
    if (snapshotsAreEqual(snapshot, nextSnapshot)) return;

    snapshot = nextSnapshot;
    for (const listener of [...listeners]) listener();
  });

  function assertNotDisposed(operation: string): void {
    if (disposed) {
      throw new Error(`Cannot ${operation} a disposed Presentation Playback Session.`);
    }
  }

  function assertNotStopped(operation: string): void {
    if (snapshot.phase === "stopped") {
      throw new Error(
        `Cannot ${operation} a stopped Presentation Playback Session; restart it first.`,
      );
    }
  }

  return Object.freeze({
    getSnapshot() {
      assertNotDisposed("read");
      return snapshot;
    },
    subscribe(listener: () => void) {
      assertNotDisposed("subscribe to");
      let active = true;
      listeners.add(listener);

      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
      };
    },
    play() {
      assertNotDisposed("play");
      assertNotStopped("play");
      machine.play();
    },
    pause() {
      assertNotDisposed("pause");
      assertNotStopped("pause");
      machine.pause();
    },
    seek(timeMs: number): PresentationSeekResult {
      assertNotDisposed("seek");
      assertNotStopped("seek");
      if (!Number.isSafeInteger(timeMs)) {
        throw new Error("Presentation Seek time must be an integer number of milliseconds.");
      }
      if (timeMs < 0 || timeMs > snapshot.durationMs) {
        return Result.err(
          Object.freeze({
            reason: "seek-out-of-range" as const,
            requestedTimeMs: timeMs,
            durationMs: snapshot.durationMs,
          }),
        );
      }

      machine.seek(timeMs);
      return Result.ok();
    },
    restart() {
      assertNotDisposed("restart");
      machine.restart();
    },
    stop() {
      assertNotDisposed("stop");
      machine.stop();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      unsubscribeFromMachine();
      machine.dispose();
    },
  });
}
