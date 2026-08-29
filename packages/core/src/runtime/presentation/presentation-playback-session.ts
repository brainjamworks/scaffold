import { Result, type Result as ResultType } from "better-result";

import type {
  CompiledInternalClockSurfaceTimeline,
  PresentationWaitId,
} from "./compiled-presentation-program";
import type { PresentationCueExecutor, PresentationCueReport } from "./presentation-cue-executor";
import {
  createAnimationFramePresentationMonotonicClock,
  type PresentationMonotonicClockPort,
} from "./presentation-monotonic-clock";
import { createPresentationPlaybackMachine } from "./presentation-playback-machine";
import type { PresentationGatePort } from "./presentation-progression-gate";

export type PresentationPlaybackPhase =
  | "awaiting-start"
  | "playing"
  | "paused"
  | "held"
  | "completed"
  | "stopped";

export type PresentationHold =
  | {
      readonly kind: "manual";
      readonly waitId: PresentationWaitId;
    }
  | {
      readonly kind: "learner";
      readonly waitId: PresentationWaitId;
      readonly status: "waiting" | "ready";
    };

export interface PresentationOutstandingLearnerWait {
  readonly waitId: PresentationWaitId;
}

interface PresentationPlaybackSnapshotBase {
  readonly runNumber: number;
  readonly surfaceId: string;
  readonly currentTimeMs: number;
  readonly durationMs: number;
  readonly outstandingLearnerWait: PresentationOutstandingLearnerWait | null;
}

export type PresentationPlaybackSnapshot = PresentationPlaybackSnapshotBase &
  (
    | {
        readonly phase: Exclude<PresentationPlaybackPhase, "held">;
        readonly hold?: never;
      }
    | {
        readonly phase: "held";
        readonly hold: PresentationHold;
      }
  );

export interface PresentationSeekError {
  readonly reason: "seek-out-of-range";
  readonly requestedTimeMs: number;
  readonly durationMs: number;
}

export type PresentationSeekResult = ResultType<void, PresentationSeekError>;

export type PresentationAdvanceError =
  | {
      readonly reason: "not-at-checkpoint";
      readonly phase: PresentationPlaybackPhase;
    }
  | {
      readonly reason: "learner-requirement-pending";
      readonly waitId: PresentationWaitId;
    };

export type PresentationAdvanceResult = ResultType<void, PresentationAdvanceError>;

export interface PresentationPlaybackSession {
  getSnapshot(): PresentationPlaybackSnapshot;
  subscribe(listener: () => void): () => void;
  subscribeCueReports(listener: (report: PresentationCueReport) => void): () => void;
  play(): void;
  pause(): void;
  seek(timeMs: number): PresentationSeekResult;
  advance(): PresentationAdvanceResult;
  restart(): void;
  stop(): void;
  dispose(): void;
}

export interface CreatePresentationPlaybackSessionInput {
  readonly timeline: CompiledInternalClockSurfaceTimeline;
  readonly monotonicClock?: PresentationMonotonicClockPort;
  readonly cueExecutor: PresentationCueExecutor;
  readonly gatePort: PresentationGatePort;
  readonly autoAdvance: boolean;
}

export type { PresentationCueOutcome, PresentationCueReport } from "./presentation-cue-executor";

interface PresentationPlaybackMachineProjection {
  readonly phase: PresentationPlaybackPhase;
  readonly hold?: PresentationHold;
  readonly runNumber: number;
  readonly surfaceId: string;
  readonly currentTimeMs: number;
  readonly durationMs: number;
  readonly outstandingLearnerWaitId: PresentationWaitId | null;
}

function holdsAreEqual(left: PresentationHold | undefined, right: PresentationHold | undefined) {
  if (left?.kind !== right?.kind) return false;
  if (!left || !right) return true;
  if (left.waitId !== right.waitId) return false;
  return left.kind === "manual" || (right.kind === "learner" && left.status === right.status);
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
    left.durationMs === right.durationMs &&
    holdsAreEqual(left.hold, right.hold) &&
    left.outstandingLearnerWait?.waitId === right.outstandingLearnerWait?.waitId
  );
}

function freezeHold(hold: PresentationHold): PresentationHold {
  return hold.kind === "manual"
    ? Object.freeze({ kind: hold.kind, waitId: hold.waitId })
    : Object.freeze({ kind: hold.kind, waitId: hold.waitId, status: hold.status });
}

function freezeSnapshot(
  snapshot: PresentationPlaybackMachineProjection,
): PresentationPlaybackSnapshot {
  const outstandingLearnerWait =
    snapshot.outstandingLearnerWaitId === null
      ? null
      : Object.freeze({ waitId: snapshot.outstandingLearnerWaitId });
  const base = {
    phase: snapshot.phase,
    runNumber: snapshot.runNumber,
    surfaceId: snapshot.surfaceId,
    currentTimeMs: snapshot.currentTimeMs,
    durationMs: snapshot.durationMs,
    outstandingLearnerWait,
  };

  if (snapshot.phase === "held") {
    if (!snapshot.hold) {
      throw new Error("Presentation held snapshot has no hold detail.");
    }
    return Object.freeze({ ...base, phase: snapshot.phase, hold: freezeHold(snapshot.hold) });
  }
  if (snapshot.hold) {
    throw new Error(`Presentation ${snapshot.phase} snapshot unexpectedly contains a hold.`);
  }
  return Object.freeze({ ...base, phase: snapshot.phase });
}

export function createPresentationPlaybackSession({
  timeline,
  monotonicClock = createAnimationFramePresentationMonotonicClock(),
  cueExecutor,
  gatePort,
  autoAdvance,
}: CreatePresentationPlaybackSessionInput): PresentationPlaybackSession {
  const listeners = new Set<() => void>();
  const cueReportListeners = new Set<(report: PresentationCueReport) => void>();
  let disposed = false;
  const machine = createPresentationPlaybackMachine({
    timeline,
    monotonicClock,
    cueExecutor,
    gatePort,
    autoAdvance,
    publishCueReport(report) {
      if (disposed) return;
      for (const listener of [...cueReportListeners]) listener(report);
    },
  });
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
    subscribeCueReports(listener: (report: PresentationCueReport) => void) {
      assertNotDisposed("subscribe to cue reports from");
      let active = true;
      cueReportListeners.add(listener);

      return () => {
        if (!active) return;
        active = false;
        cueReportListeners.delete(listener);
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
    advance(): PresentationAdvanceResult {
      assertNotDisposed("advance");
      if (snapshot.phase !== "held") {
        return Result.err(
          Object.freeze({
            reason: "not-at-checkpoint" as const,
            phase: snapshot.phase,
          }),
        );
      }
      if (snapshot.hold.kind === "learner" && snapshot.hold.status === "waiting") {
        return Result.err(
          Object.freeze({
            reason: "learner-requirement-pending" as const,
            waitId: snapshot.hold.waitId,
          }),
        );
      }

      const heldSnapshot = snapshot;
      machine.advance();
      if (snapshot === heldSnapshot || snapshot.phase === "held") {
        throw new Error("Presentation advance did not release the active hold.");
      }
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
      cueReportListeners.clear();
      unsubscribeFromMachine();
      machine.dispose();
    },
  });
}
