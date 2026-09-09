import { Result, type Result as ResultType } from "better-result";

import {
  createPresentationPlaybackPosition,
  type PresentationPlaybackPosition,
} from "@/presentation/model";

import type {
  CompiledInternalClockSurfaceTimeline,
  PresentationWaitId,
} from "./compiled-presentation-program";
import type { PresentationCueExecutor, PresentationCueReport } from "./presentation-cue-executor";
import {
  createAnimationFramePresentationMonotonicClock,
  createReplaceablePresentationPlaybackClock,
  type PresentationNarrationClockSource,
  type PresentationPlaybackClockReadingSource,
  type PresentationPlaybackClockSource,
} from "./presentation-monotonic-clock";
import {
  createPresentationPlaybackMachine,
  type PresentationAdvancementLifecycle,
  type PresentationRepositionInterruptionReason,
} from "./presentation-playback-machine";
import type { PresentationGatePort } from "./presentation-progression-gate";

export type PresentationPlaybackPhase =
  | "awaiting-start"
  | "playing"
  | "paused"
  | "held"
  | "completed"
  | "stopped";

export type { PresentationAdvancementLifecycle } from "./presentation-playback-machine";

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
  readonly position: PresentationPlaybackPosition;
}

interface PresentationPlaybackSnapshotBase {
  readonly runNumber: number;
  readonly surfaceId: string;
  readonly position: PresentationPlaybackPosition;
  readonly advancement: PresentationAdvancementLifecycle;
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
export type PresentationSeekPositionResult = ResultType<
  PresentationPlaybackPosition,
  PresentationSeekError
>;

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
  resolveSeekPosition(timeMs: number): PresentationSeekPositionResult;
  seek(position: PresentationPlaybackPosition): void;
  advance(): PresentationAdvanceResult;
  restart(): void;
  stop(): void;
  dispose(): void;
}

export interface PresentationPlaybackSessionWithReplaceableClock extends PresentationPlaybackSession {
  useNarrationClock(source: PresentationNarrationClockSource): void;
  useInternalClock(): void;
  beginMediaStart(): void;
  beginAdvanceMediaStart(): PresentationAdvanceResult;
  confirmMediaStart(): void;
  cancelMediaStart(): void;
  beginReposition(reason: PresentationRepositionInterruptionReason): void;
}

export interface CreatePresentationPlaybackSessionInput {
  readonly timeline: CompiledInternalClockSurfaceTimeline;
  readonly monotonicClock?: PresentationPlaybackClockSource;
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
  readonly position: PresentationPlaybackPosition;
  readonly advancement: PresentationAdvancementLifecycle;
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
    left.position.timeMs === right.position.timeMs &&
    left.position.side === right.position.side &&
    left.advancement === right.advancement &&
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
  timeline: CompiledInternalClockSurfaceTimeline,
): PresentationPlaybackSnapshot {
  const outstandingLearnerWait =
    snapshot.outstandingLearnerWaitId === null
      ? null
      : freezeOutstandingLearnerWait(snapshot.outstandingLearnerWaitId, timeline);
  const base = {
    phase: snapshot.phase,
    runNumber: snapshot.runNumber,
    surfaceId: snapshot.surfaceId,
    position: Object.freeze({ ...snapshot.position }),
    advancement: snapshot.advancement,
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

function freezeOutstandingLearnerWait(
  waitId: PresentationWaitId,
  timeline: CompiledInternalClockSurfaceTimeline,
): PresentationOutstandingLearnerWait {
  const wait = timeline.waits.find((candidate) => candidate.id === waitId);
  if (wait?.kind !== "learner-wait") {
    throw new Error(`Outstanding learner Wait "${waitId}" is absent from its Timeline.`);
  }
  return Object.freeze({
    waitId,
    position: createPresentationPlaybackPosition(wait.atMs, wait.boundary),
  });
}

export function resolvePresentationSeekPosition(
  timeline: CompiledInternalClockSurfaceTimeline,
  timeMs: number,
): PresentationSeekPositionResult {
  if (!Number.isSafeInteger(timeMs)) {
    throw new Error("Presentation Seek time must be an integer number of milliseconds.");
  }
  if (timeMs < 0 || timeMs > timeline.durationMs) {
    return Result.err(
      Object.freeze({
        reason: "seek-out-of-range" as const,
        requestedTimeMs: timeMs,
        durationMs: timeline.durationMs,
      }),
    );
  }
  const wait = timeline.waits.find((candidate) => candidate.atMs === timeMs);
  return Result.ok(createPresentationPlaybackPosition(timeMs, wait?.boundary ?? "after-actions"));
}

function advanceErrorFor(snapshot: PresentationPlaybackSnapshot): PresentationAdvanceError | null {
  if (snapshot.phase !== "held") {
    return Object.freeze({ reason: "not-at-checkpoint" as const, phase: snapshot.phase });
  }
  if (snapshot.hold.kind === "learner" && snapshot.hold.status === "waiting") {
    return Object.freeze({
      reason: "learner-requirement-pending" as const,
      waitId: snapshot.hold.waitId,
    });
  }
  return null;
}

export function createPresentationPlaybackSession({
  timeline,
  monotonicClock = createAnimationFramePresentationMonotonicClock(),
  cueExecutor,
  gatePort,
  autoAdvance,
}: CreatePresentationPlaybackSessionInput): PresentationPlaybackSessionWithReplaceableClock {
  const listeners = new Set<() => void>();
  const cueReportListeners = new Set<(report: PresentationCueReport) => void>();
  let disposed = false;
  const playbackClock = createReplaceablePresentationPlaybackClock(monotonicClock);
  let activeClockSource: PresentationPlaybackClockReadingSource = monotonicClock;
  const machine = createPresentationPlaybackMachine({
    timeline,
    clockSource: playbackClock,
    cueExecutor,
    gatePort,
    autoAdvance,
    publishCueReport(report) {
      if (disposed) return;
      for (const listener of [...cueReportListeners]) listener(report);
    },
  });
  let snapshot = freezeSnapshot(machine.getSnapshot(), timeline);

  const unsubscribeFromMachine = machine.subscribe((machineSnapshot) => {
    const nextSnapshot = freezeSnapshot(machineSnapshot, timeline);
    if (!snapshotsAreEqual(snapshot, nextSnapshot)) {
      snapshot = nextSnapshot;
      for (const listener of [...listeners]) listener();
    }
    if (machineSnapshot.boundaryReleasePending) {
      machine.confirmBoundaryReleasePublished(machineSnapshot.runNumber);
    }
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
    resolveSeekPosition(timeMs: number): PresentationSeekPositionResult {
      assertNotDisposed("seek");
      assertNotStopped("seek");
      return resolvePresentationSeekPosition(timeline, timeMs);
    },
    seek(position: PresentationPlaybackPosition): void {
      assertNotDisposed("seek");
      assertNotStopped("seek");
      const validated = createPresentationPlaybackPosition(position.timeMs, position.side);
      if (validated.timeMs > snapshot.durationMs) {
        throw new Error("Resolved Presentation Seek position exceeds its Timeline duration.");
      }
      machine.seek(validated);
    },
    advance(): PresentationAdvanceResult {
      assertNotDisposed("advance");
      const error = advanceErrorFor(snapshot);
      if (error) return Result.err(error);

      const heldSnapshot = snapshot;
      machine.advance();
      if (snapshot === heldSnapshot || snapshot.phase === "held") {
        throw new Error("Presentation advance did not release the active hold.");
      }
      return Result.ok();
    },
    beginMediaStart() {
      assertNotDisposed("begin media start for");
      assertNotStopped("begin media start for");
      machine.beginMediaStart();
    },
    beginAdvanceMediaStart(): PresentationAdvanceResult {
      assertNotDisposed("begin media start for");
      assertNotStopped("begin media start for");
      const error = advanceErrorFor(snapshot);
      if (error) return Result.err(error);
      machine.beginMediaStart();
      return Result.ok();
    },
    confirmMediaStart() {
      assertNotDisposed("confirm media start for");
      assertNotStopped("confirm media start for");
      machine.confirmMediaStart();
    },
    cancelMediaStart() {
      assertNotDisposed("cancel media start for");
      machine.cancelMediaStart();
    },
    beginReposition(reason: PresentationRepositionInterruptionReason) {
      assertNotDisposed("begin repositioning");
      assertNotStopped("begin repositioning");
      machine.beginReposition(reason);
    },
    restart() {
      assertNotDisposed("restart");
      machine.restart();
    },
    stop() {
      assertNotDisposed("stop");
      machine.stop();
    },
    useNarrationClock(source: PresentationNarrationClockSource) {
      assertNotDisposed("replace the clock of");
      assertNotStopped("replace the clock of");
      if (source.surfaceId !== snapshot.surfaceId) {
        throw new Error("Presentation narration clock belongs to a different Surface.");
      }
      if (activeClockSource === source) return;
      if (snapshot.advancement === "awaiting-media-start") {
        playbackClock.replaceSourceAt(source, snapshot.position.timeMs);
      } else {
        playbackClock.replaceSource(source);
      }
      activeClockSource = source;
    },
    useInternalClock() {
      assertNotDisposed("replace the clock of");
      assertNotStopped("replace the clock of");
      if (activeClockSource === monotonicClock) return;
      playbackClock.replaceSource(monotonicClock);
      activeClockSource = monotonicClock;
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
