import {
  assign,
  createActor,
  enqueueActions,
  fromCallback,
  fromPromise,
  sendTo,
  setup,
} from "xstate";

import type {
  CompiledInternalClockSurfaceTimeline,
  CompiledPresentationCue,
  CompiledPresentationWait,
  PresentationWaitId,
} from "./compiled-presentation-program";
import type {
  PresentationCueExecutionOutcome,
  PresentationCueExecutor,
  PresentationCueOutcome,
  PresentationCueReport,
} from "./presentation-cue-executor";
import type { PresentationMonotonicClockPort } from "./presentation-monotonic-clock";
import type { PresentationGatePort } from "./presentation-progression-gate";

type PresentationPlaybackMachinePhase =
  | "awaiting-start"
  | "playing"
  | "paused"
  | "held"
  | "completed"
  | "stopped";

type PresentationPlaybackMachineHold =
  | {
      readonly kind: "manual";
      readonly waitId: PresentationWaitId;
    }
  | {
      readonly kind: "learner";
      readonly waitId: PresentationWaitId;
      readonly status: "waiting" | "ready";
    };

type PresentationCueInterruptionReason = "seek" | "restart" | "stop";

interface PresentationPlaybackMachineContext {
  readonly surfaceId: string;
  readonly durationMs: number;
  readonly monotonicClock: PresentationMonotonicClockPort;
  readonly cueExecutor: PresentationCueExecutor;
  readonly gatePort: PresentationGatePort;
  readonly autoAdvance: boolean;
  readonly publishCueReport: (report: PresentationCueReport) => void;
  readonly cues: readonly CompiledPresentationCue[];
  readonly waits: readonly CompiledPresentationWait[];
  runNumber: number;
  currentTimeMs: number;
  anchorClockTimeMs: number;
  anchorPresentationTimeMs: number;
  consumedCueIds: ReadonlySet<string>;
  passedWaitIds: ReadonlySet<PresentationWaitId>;
  pendingWait: CompiledPresentationWait | null;
  outstandingLearnerWaitId: PresentationWaitId | null;
}

type PresentationPlaybackMachineEvent =
  | { readonly type: "play"; readonly anchorClockTimeMs: number }
  | { readonly type: "pause" }
  | { readonly type: "advance"; readonly anchorClockTimeMs: number }
  | {
      readonly type: "seek";
      readonly timeMs: number;
      readonly anchorClockTimeMs: number;
    }
  | { readonly type: "restart" }
  | { readonly type: "stop" }
  | { readonly type: "clock-tick"; readonly projectedTimeMs: number }
  | { readonly type: "cue-worker-drained"; readonly runNumber: number }
  | { readonly type: "cue-worker-defect"; readonly error: unknown };

interface PresentationPlaybackMachineInput {
  readonly timeline: CompiledInternalClockSurfaceTimeline;
  readonly monotonicClock: PresentationMonotonicClockPort;
  readonly cueExecutor: PresentationCueExecutor;
  readonly gatePort: PresentationGatePort;
  readonly autoAdvance: boolean;
  readonly publishCueReport: (report: PresentationCueReport) => void;
}

interface PresentationClockActorInput {
  readonly monotonicClock: PresentationMonotonicClockPort;
  readonly anchorClockTimeMs: number;
  readonly anchorPresentationTimeMs: number;
  readonly durationMs: number;
}

interface PresentationGateActorInput {
  readonly gatePort: PresentationGatePort;
  readonly requirement: Extract<
    CompiledPresentationWait,
    { readonly kind: "learner-wait" }
  >["requirement"];
}

interface QueuedPresentationCue {
  readonly cue: CompiledPresentationCue;
  readonly runNumber: number;
  readonly surfaceId: string;
}

type PresentationCueWorkerEvent =
  | {
      readonly type: "enqueue-cues";
      readonly cues: readonly CompiledPresentationCue[];
      readonly runNumber: number;
      readonly surfaceId: string;
    }
  | {
      readonly type: "interrupt-cues";
      readonly runNumber: number;
      readonly reason: PresentationCueInterruptionReason;
    };

interface PresentationCueWorkerInput {
  readonly cueExecutor: PresentationCueExecutor;
  readonly publishCueReport: (report: PresentationCueReport) => void;
}

interface PresentationPlaybackMachineSnapshot {
  readonly phase: PresentationPlaybackMachinePhase;
  readonly hold?: PresentationPlaybackMachineHold;
  readonly runNumber: number;
  readonly surfaceId: string;
  readonly currentTimeMs: number;
  readonly durationMs: number;
  readonly outstandingLearnerWaitId: PresentationWaitId | null;
}

interface PresentationPlaybackMachine {
  getSnapshot(): PresentationPlaybackMachineSnapshot;
  subscribe(listener: (snapshot: PresentationPlaybackMachineSnapshot) => void): () => void;
  play(): void;
  pause(): void;
  advance(): void;
  seek(timeMs: number): void;
  restart(): void;
  stop(): void;
  dispose(): void;
}

const monotonicClockActor = fromCallback<
  PresentationPlaybackMachineEvent,
  PresentationClockActorInput
>(({ input, sendBack }) => {
  let confirmedTimeMs = input.anchorPresentationTimeMs;
  return input.monotonicClock.subscribe(() => {
    const projectedTimeMs = projectedClockTime({
      anchorClockTimeMs: input.anchorClockTimeMs,
      anchorPresentationTimeMs: input.anchorPresentationTimeMs,
      confirmedTimeMs,
      durationMs: input.durationMs,
      nowMs: input.monotonicClock.nowMs(),
    });
    confirmedTimeMs = projectedTimeMs;
    sendBack({ type: "clock-tick", projectedTimeMs });
  });
});

const presentationGateActor = fromPromise<void, PresentationGateActorInput>(({ input, signal }) =>
  input.gatePort.waitUntilSatisfied(input.requirement, { signal }),
);

function freezeCueReport(
  item: QueuedPresentationCue,
  outcome: PresentationCueOutcome,
): PresentationCueReport {
  const frozenOutcome: PresentationCueOutcome = Object.freeze({ ...outcome });
  return Object.freeze({
    runNumber: item.runNumber,
    surfaceId: item.surfaceId,
    cueId: item.cue.id,
    scheduledAtMs: item.cue.atMs,
    outcome: frozenOutcome,
  });
}

const presentationCueWorker = fromCallback<PresentationCueWorkerEvent, PresentationCueWorkerInput>(
  ({ input, receive, sendBack }) => {
    let queue: QueuedPresentationCue[] = [];
    let current:
      | {
          readonly item: QueuedPresentationCue;
          readonly controller: AbortController;
          readonly operationNumber: number;
        }
      | undefined;
    let nextOperationNumber = 1;
    let disposed = false;

    const notifyIfDrained = (runNumber: number): void => {
      if (current || queue.length > 0) return;
      sendBack({ type: "cue-worker-drained", runNumber });
    };

    const startNext = (): void => {
      if (disposed || current) return;
      const item = queue.shift();
      if (!item) return;

      const controller = new AbortController();
      const operationNumber = nextOperationNumber;
      nextOperationNumber += 1;
      current = { item, controller, operationNumber };

      let execution: Promise<PresentationCueExecutionOutcome>;
      try {
        execution = input.cueExecutor.execute({
          command: item.cue.command,
          signal: controller.signal,
        });
      } catch (error) {
        sendBack({ type: "cue-worker-defect", error });
        return;
      }

      execution.then(
        (outcome) => {
          if (disposed || current?.operationNumber !== operationNumber) return;
          input.publishCueReport(freezeCueReport(item, outcome));
          current = undefined;
          startNext();
          notifyIfDrained(item.runNumber);
        },
        (error: unknown) => {
          if (disposed || current?.operationNumber !== operationNumber) return;
          sendBack({ type: "cue-worker-defect", error });
        },
      );
    };

    receive((event) => {
      if (event.type === "enqueue-cues") {
        queue.push(
          ...event.cues.map((cue) => ({
            cue,
            runNumber: event.runNumber,
            surfaceId: event.surfaceId,
          })),
        );
        startNext();
        notifyIfDrained(event.runNumber);
        return;
      }

      const unsettled = [...(current ? [current.item] : []), ...queue];
      current?.controller.abort();
      current = undefined;
      queue = [];
      for (const item of unsettled) {
        input.publishCueReport(
          freezeCueReport(item, { kind: "session-interrupted", reason: event.reason }),
        );
      }
    });

    return () => {
      disposed = true;
      current?.controller.abort();
      current = undefined;
      queue = [];
    };
  },
);

function seekTimeFrom(event: PresentationPlaybackMachineEvent): number {
  if (event.type !== "seek") {
    throw new Error(`Presentation Seek action received unexpected event "${event.type}".`);
  }
  return event.timeMs;
}

function anchorClockTimeFrom(event: PresentationPlaybackMachineEvent): number {
  if (event.type !== "play" && event.type !== "seek" && event.type !== "advance") {
    throw new Error(`Presentation anchor action received unexpected event "${event.type}".`);
  }
  return event.anchorClockTimeMs;
}

function projectedTimeFrom(event: PresentationPlaybackMachineEvent): number {
  if (event.type !== "clock-tick") {
    throw new Error(`Presentation clock action received unexpected event "${event.type}".`);
  }
  return event.projectedTimeMs;
}

function finiteClockReadingFrom(clock: PresentationMonotonicClockPort): number {
  const nowMs = clock.nowMs();
  if (!Number.isFinite(nowMs)) {
    throw new Error("Presentation monotonic clock returned a non-finite reading.");
  }
  return nowMs;
}

function projectedClockTime(input: {
  readonly anchorClockTimeMs: number;
  readonly anchorPresentationTimeMs: number;
  readonly confirmedTimeMs: number;
  readonly durationMs: number;
  readonly nowMs: number;
}): number {
  const { anchorClockTimeMs, anchorPresentationTimeMs, confirmedTimeMs, durationMs, nowMs } = input;
  if (!Number.isFinite(nowMs)) {
    throw new Error("Presentation monotonic clock returned a non-finite reading.");
  }
  if (nowMs < anchorClockTimeMs) {
    throw new Error("Presentation monotonic clock moved behind its playback anchor.");
  }

  const elapsedMs = nowMs - anchorClockTimeMs;
  const projectedTimeMs = Math.min(durationMs, Math.floor(anchorPresentationTimeMs + elapsedMs));
  if (projectedTimeMs < confirmedTimeMs) {
    throw new Error("Presentation clock projection moved behind the last confirmed playhead.");
  }
  return projectedTimeMs;
}

function unconsumedCuesThrough(
  context: PresentationPlaybackMachineContext,
  timeMs: number,
): readonly CompiledPresentationCue[] {
  return context.cues.filter((cue) => cue.atMs <= timeMs && !context.consumedCueIds.has(cue.id));
}

function consumedCueIdsWith(
  context: PresentationPlaybackMachineContext,
  cues: readonly CompiledPresentationCue[],
): ReadonlySet<string> {
  return new Set([...context.consumedCueIds, ...cues.map((cue) => cue.id)]);
}

type CompiledManualPresentationWait = Extract<
  CompiledPresentationWait,
  { readonly kind: "manual-wait" }
>;
type CompiledLearnerPresentationWait = Extract<
  CompiledPresentationWait,
  { readonly kind: "learner-wait" }
>;

function waitAtCurrentTime(
  context: PresentationPlaybackMachineContext,
): CompiledPresentationWait | undefined {
  return context.waits.find(
    (wait) => wait.atMs === context.currentTimeMs && !context.passedWaitIds.has(wait.id),
  );
}

function crossedWait(
  context: PresentationPlaybackMachineContext,
  projectedTimeMs: number,
): CompiledPresentationWait | undefined {
  return context.waits.find(
    (wait) =>
      wait.atMs > context.currentTimeMs &&
      wait.atMs <= projectedTimeMs &&
      !context.passedWaitIds.has(wait.id),
  );
}

function pendingManualWait(
  context: PresentationPlaybackMachineContext,
): CompiledManualPresentationWait {
  if (context.pendingWait?.kind !== "manual-wait") {
    throw new Error("Presentation manual hold has no matching pending Wait.");
  }
  return context.pendingWait;
}

function pendingLearnerWait(
  context: PresentationPlaybackMachineContext,
): CompiledLearnerPresentationWait {
  if (context.pendingWait?.kind !== "learner-wait") {
    throw new Error("Presentation learner hold has no matching pending Wait.");
  }
  return context.pendingWait;
}

function firstOutstandingLearnerWaitId(
  waits: readonly CompiledPresentationWait[],
): PresentationWaitId | null {
  return waits.find((wait) => wait.kind === "learner-wait")?.id ?? null;
}

function nextOutstandingLearnerWaitId(
  context: PresentationPlaybackMachineContext,
): PresentationWaitId | null {
  const currentWait = pendingLearnerWait(context);
  const currentIndex = context.waits.findIndex((wait) => wait.id === currentWait.id);
  if (currentIndex === -1) {
    throw new Error(`Presentation pending Wait "${currentWait.id}" is absent from its Timeline.`);
  }
  return (
    context.waits.slice(currentIndex + 1).find((wait) => wait.kind === "learner-wait")?.id ?? null
  );
}

function outstandingLearnerWaitIdAfterSeek(
  context: PresentationPlaybackMachineContext,
  timeMs: number,
): PresentationWaitId | null {
  const rearmedWait = context.waits.find(
    (wait) => wait.kind === "learner-wait" && wait.atMs >= timeMs,
  );
  if (!rearmedWait) return context.outstandingLearnerWaitId;
  if (!context.outstandingLearnerWaitId) return rearmedWait.id;

  const currentIndex = context.waits.findIndex(
    (wait) => wait.id === context.outstandingLearnerWaitId,
  );
  const rearmedIndex = context.waits.findIndex((wait) => wait.id === rearmedWait.id);
  if (currentIndex === -1 || rearmedIndex === -1) {
    throw new Error("Presentation learner Wait projection is absent from its Timeline.");
  }
  return rearmedIndex < currentIndex ? rearmedWait.id : context.outstandingLearnerWaitId;
}

const presentationPlaybackMachineSetup = setup({
  types: {
    context: {} as PresentationPlaybackMachineContext,
    events: {} as PresentationPlaybackMachineEvent,
    input: {} as PresentationPlaybackMachineInput,
  },
  actors: {
    monotonicClock: monotonicClockActor,
    cueWorker: presentationCueWorker,
    gateObserver: presentationGateActor,
  },
  guards: {
    atDuration: ({ context }) => context.currentTimeMs === context.durationMs,
    hasWaitAtCurrentTime: ({ context }) => waitAtCurrentTime(context) !== undefined,
    seekAtWait: ({ context, event }) =>
      context.waits.some((wait) => wait.atMs === seekTimeFrom(event)),
    seekAtDuration: ({ context, event }) => seekTimeFrom(event) === context.durationMs,
    seekAtStart: ({ event }) => seekTimeFrom(event) === 0,
    clockCrossedWait: ({ context, event }) =>
      crossedWait(context, projectedTimeFrom(event)) !== undefined,
    clockReachedDuration: ({ context, event }) => projectedTimeFrom(event) === context.durationMs,
    autoAdvanceEnabled: ({ context }) => context.autoAdvance,
    autoAdvanceAtDuration: ({ context }) =>
      context.autoAdvance && context.currentTimeMs === context.durationMs,
    drainedCurrentRun: ({ context, event }) =>
      event.type === "cue-worker-drained" && event.runNumber === context.runNumber,
    drainedCurrentRunAtManualWait: ({ context, event }) =>
      event.type === "cue-worker-drained" &&
      event.runNumber === context.runNumber &&
      context.pendingWait?.kind === "manual-wait",
    drainedCurrentRunAtLearnerWait: ({ context, event }) =>
      event.type === "cue-worker-drained" &&
      event.runNumber === context.runNumber &&
      context.pendingWait?.kind === "learner-wait",
  },
  actions: {
    anchorPlayback: assign({
      anchorClockTimeMs: ({ event }) => anchorClockTimeFrom(event),
      anchorPresentationTimeMs: ({ context }) => context.currentTimeMs,
    }),
    anchorPlaybackNow: assign({
      anchorClockTimeMs: ({ context }) => finiteClockReadingFrom(context.monotonicClock),
      anchorPresentationTimeMs: ({ context }) => context.currentTimeMs,
    }),
    applyClockTick: assign({
      currentTimeMs: ({ event }) => projectedTimeFrom(event),
    }),
    applySeek: assign({
      currentTimeMs: ({ event }) => seekTimeFrom(event),
    }),
    applyPlayingSeek: assign(({ event }) => {
      const timeMs = seekTimeFrom(event);
      return {
        currentTimeMs: timeMs,
        anchorClockTimeMs: anchorClockTimeFrom(event),
        anchorPresentationTimeMs: timeMs,
      };
    }),
    enqueueCurrentCues: enqueueActions(({ context, enqueue }) => {
      const cues = unconsumedCuesThrough(context, context.currentTimeMs);
      if (cues.length === 0) return;
      enqueue.assign({ consumedCueIds: consumedCueIdsWith(context, cues) });
      enqueue.sendTo("cueWorker", {
        type: "enqueue-cues",
        cues,
        runNumber: context.runNumber,
        surfaceId: context.surfaceId,
      });
    }),
    settleAtCurrentWait: enqueueActions(({ context, enqueue }) => {
      const wait = waitAtCurrentTime(context);
      if (!wait) {
        throw new Error("Presentation could not select the current Wait.");
      }
      const cues = unconsumedCuesThrough(context, wait.atMs);
      enqueue.assign({
        pendingWait: wait,
        consumedCueIds: consumedCueIdsWith(context, cues),
      });
      enqueue.sendTo("cueWorker", {
        type: "enqueue-cues",
        cues,
        runNumber: context.runNumber,
        surfaceId: context.surfaceId,
      });
    }),
    settleAtCrossedWait: enqueueActions(({ context, event, enqueue }) => {
      const wait = crossedWait(context, projectedTimeFrom(event));
      if (!wait) {
        throw new Error("Presentation could not select the crossed Wait.");
      }
      const cues = unconsumedCuesThrough(context, wait.atMs);
      enqueue.assign({
        currentTimeMs: wait.atMs,
        pendingWait: wait,
        consumedCueIds: consumedCueIdsWith(context, cues),
      });
      enqueue.sendTo("cueWorker", {
        type: "enqueue-cues",
        cues,
        runNumber: context.runNumber,
        surfaceId: context.surfaceId,
      });
    }),
    enqueueClockCues: enqueueActions(({ context, event, enqueue }) => {
      const cues = unconsumedCuesThrough(context, projectedTimeFrom(event));
      if (cues.length === 0) return;
      enqueue.assign({ consumedCueIds: consumedCueIdsWith(context, cues) });
      enqueue.sendTo("cueWorker", {
        type: "enqueue-cues",
        cues,
        runNumber: context.runNumber,
        surfaceId: context.surfaceId,
      });
    }),
    enqueueEndpointCues: enqueueActions(({ context, event, enqueue }) => {
      const cues = unconsumedCuesThrough(context, projectedTimeFrom(event));
      enqueue.assign({ consumedCueIds: consumedCueIdsWith(context, cues) });
      enqueue.sendTo("cueWorker", {
        type: "enqueue-cues",
        cues,
        runNumber: context.runNumber,
        surfaceId: context.surfaceId,
      });
    }),
    consumeSeekCues: assign({
      consumedCueIds: ({ context, event }) => {
        const cues = unconsumedCuesThrough(context, seekTimeFrom(event));
        return consumedCueIdsWith(context, cues);
      },
    }),
    reconcileWaitPassageForSeek: assign(({ context, event }) => {
      const timeMs = seekTimeFrom(event);
      return {
        passedWaitIds: new Set(
          context.waits.filter((wait) => wait.atMs < timeMs).map((wait) => wait.id),
        ),
        outstandingLearnerWaitId: outstandingLearnerWaitIdAfterSeek(context, timeMs),
      };
    }),
    interruptForSeek: sendTo("cueWorker", ({ context }) => ({
      type: "interrupt-cues" as const,
      runNumber: context.runNumber,
      reason: "seek" as const,
    })),
    interruptForRestart: sendTo("cueWorker", ({ context }) => ({
      type: "interrupt-cues" as const,
      runNumber: context.runNumber,
      reason: "restart" as const,
    })),
    interruptForStop: sendTo("cueWorker", ({ context }) => ({
      type: "interrupt-cues" as const,
      runNumber: context.runNumber,
      reason: "stop" as const,
    })),
    restartRun: assign({
      runNumber: ({ context }) => context.runNumber + 1,
      currentTimeMs: 0,
      anchorClockTimeMs: 0,
      anchorPresentationTimeMs: 0,
      consumedCueIds: () => new Set<string>(),
      passedWaitIds: () => new Set<PresentationWaitId>(),
      pendingWait: null,
      outstandingLearnerWaitId: ({ context }) => firstOutstandingLearnerWaitId(context.waits),
    }),
    markPendingWaitPassed: assign({
      passedWaitIds: ({ context }) => {
        if (!context.pendingWait) {
          throw new Error("Presentation cannot pass a Wait without a pending Wait.");
        }
        return new Set([...context.passedWaitIds, context.pendingWait.id]);
      },
    }),
    clearPendingWait: assign({ pendingWait: null }),
    markLearnerWaitSatisfied: assign({
      outstandingLearnerWaitId: ({ context }) =>
        context.outstandingLearnerWaitId === pendingLearnerWait(context).id
          ? nextOutstandingLearnerWaitId(context)
          : context.outstandingLearnerWaitId,
    }),
    throwWorkerDefect: ({ event }) => {
      if (event.type !== "cue-worker-defect") {
        throw new Error("Presentation cue defect action received an unexpected event.");
      }
      throw event.error;
    },
  },
});

const fixedWaitStateSeekTransitions = [
  {
    guard: "seekAtWait",
    target: "paused",
    actions: [
      "interruptForSeek",
      "consumeSeekCues",
      "reconcileWaitPassageForSeek",
      "applySeek",
      "clearPendingWait",
    ],
  },
  {
    guard: "seekAtDuration",
    target: "completed",
    actions: [
      "interruptForSeek",
      "consumeSeekCues",
      "reconcileWaitPassageForSeek",
      "applySeek",
      "clearPendingWait",
    ],
  },
  {
    target: "paused",
    actions: [
      "interruptForSeek",
      "consumeSeekCues",
      "reconcileWaitPassageForSeek",
      "applySeek",
      "clearPendingWait",
    ],
  },
] as const;

const presentationPlaybackMachine = presentationPlaybackMachineSetup.createMachine({
  id: "presentation-playback",
  context: ({ input }) => ({
    surfaceId: input.timeline.surfaceId,
    durationMs: input.timeline.durationMs,
    monotonicClock: input.monotonicClock,
    cueExecutor: input.cueExecutor,
    gatePort: input.gatePort,
    autoAdvance: input.autoAdvance,
    publishCueReport: input.publishCueReport,
    cues: input.timeline.cues,
    waits: input.timeline.waits,
    runNumber: 1,
    currentTimeMs: 0,
    anchorClockTimeMs: 0,
    anchorPresentationTimeMs: 0,
    consumedCueIds: new Set<string>(),
    passedWaitIds: new Set<PresentationWaitId>(),
    pendingWait: null,
    outstandingLearnerWaitId: firstOutstandingLearnerWaitId(input.timeline.waits),
  }),
  invoke: {
    id: "cueWorker",
    src: "cueWorker",
    input: ({ context }) => ({
      cueExecutor: context.cueExecutor,
      publishCueReport: context.publishCueReport,
    }),
  },
  initial: "awaiting-start",
  on: {
    restart: {
      target: ".awaiting-start",
      actions: ["interruptForRestart", "restartRun"],
    },
    stop: {
      target: ".stopped",
      actions: "interruptForStop",
    },
    "cue-worker-defect": { actions: "throwWorkerDefect" },
  },
  states: {
    "awaiting-start": {
      on: {
        play: [
          {
            guard: "hasWaitAtCurrentTime",
            target: "settling-wait-cues",
            actions: "settleAtCurrentWait",
          },
          { guard: "atDuration", target: "completed" },
          { target: "playing", actions: ["enqueueCurrentCues", "anchorPlayback"] },
        ],
        seek: [
          {
            guard: "seekAtWait",
            target: "paused",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            guard: "seekAtDuration",
            target: "completed",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            guard: "seekAtStart",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            target: "paused",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
        ],
      },
    },
    playing: {
      invoke: {
        src: "monotonicClock",
        input: ({ context }) => ({
          monotonicClock: context.monotonicClock,
          anchorClockTimeMs: context.anchorClockTimeMs,
          anchorPresentationTimeMs: context.anchorPresentationTimeMs,
          durationMs: context.durationMs,
        }),
      },
      on: {
        "clock-tick": [
          {
            guard: "clockCrossedWait",
            target: "settling-wait-cues",
            actions: "settleAtCrossedWait",
          },
          {
            guard: "clockReachedDuration",
            target: "settling-cues",
            actions: ["enqueueEndpointCues", "applyClockTick"],
          },
          { actions: ["enqueueClockCues", "applyClockTick"] },
        ],
        pause: { target: "paused" },
        seek: [
          {
            guard: "seekAtWait",
            target: "paused",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            guard: "seekAtDuration",
            target: "completed",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            target: "playing",
            reenter: true,
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applyPlayingSeek",
            ],
          },
        ],
      },
    },
    "settling-cues": {
      on: {
        "cue-worker-drained": { guard: "drainedCurrentRun", target: "completed" },
        seek: [
          {
            guard: "seekAtWait",
            target: "paused",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            guard: "seekAtDuration",
            target: "completed",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            target: "playing",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applyPlayingSeek",
            ],
          },
        ],
      },
    },
    "settling-wait-cues": {
      on: {
        "cue-worker-drained": [
          { guard: "drainedCurrentRunAtManualWait", target: "held-manual" },
          { guard: "drainedCurrentRunAtLearnerWait", target: "held-learner-waiting" },
        ],
        seek: fixedWaitStateSeekTransitions,
      },
    },
    "held-manual": {
      on: {
        advance: [
          {
            guard: "atDuration",
            target: "completed",
            actions: ["markPendingWaitPassed", "clearPendingWait"],
          },
          {
            target: "playing",
            actions: ["markPendingWaitPassed", "clearPendingWait", "anchorPlayback"],
          },
        ],
        seek: fixedWaitStateSeekTransitions,
      },
    },
    "held-learner-waiting": {
      invoke: {
        id: "learnerGate",
        src: "gateObserver",
        input: ({ context }) => ({
          gatePort: context.gatePort,
          requirement: pendingLearnerWait(context).requirement,
        }),
        onDone: [
          {
            guard: "autoAdvanceAtDuration",
            target: "completed",
            actions: ["markLearnerWaitSatisfied", "markPendingWaitPassed", "clearPendingWait"],
          },
          {
            guard: "autoAdvanceEnabled",
            target: "playing",
            actions: [
              "markLearnerWaitSatisfied",
              "markPendingWaitPassed",
              "clearPendingWait",
              "anchorPlaybackNow",
            ],
          },
          {
            target: "held-learner-ready",
            actions: ["markLearnerWaitSatisfied", "markPendingWaitPassed"],
          },
        ],
      },
      on: {
        seek: fixedWaitStateSeekTransitions,
      },
    },
    "held-learner-ready": {
      on: {
        advance: [
          { guard: "atDuration", target: "completed", actions: "clearPendingWait" },
          {
            target: "playing",
            actions: ["clearPendingWait", "anchorPlayback"],
          },
        ],
        seek: fixedWaitStateSeekTransitions,
      },
    },
    paused: {
      on: {
        play: [
          {
            guard: "hasWaitAtCurrentTime",
            target: "settling-wait-cues",
            actions: "settleAtCurrentWait",
          },
          { guard: "atDuration", target: "completed" },
          { target: "playing", actions: ["enqueueCurrentCues", "anchorPlayback"] },
        ],
        seek: [
          {
            guard: "seekAtWait",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            guard: "seekAtDuration",
            target: "completed",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
        ],
      },
    },
    completed: {
      on: {
        seek: [
          {
            guard: "seekAtWait",
            target: "paused",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            guard: "seekAtDuration",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
          {
            target: "paused",
            actions: [
              "interruptForSeek",
              "consumeSeekCues",
              "reconcileWaitPassageForSeek",
              "applySeek",
            ],
          },
        ],
      },
    },
    stopped: {},
  },
});

function readMachinePhase(value: unknown): PresentationPlaybackMachinePhase {
  switch (value) {
    case "awaiting-start":
    case "playing":
    case "paused":
    case "completed":
    case "stopped":
      return value;
    case "settling-cues":
    case "settling-wait-cues":
      return "playing";
    case "held-manual":
    case "held-learner-waiting":
    case "held-learner-ready":
      return "held";
    default:
      throw new Error(`Presentation actor entered impossible state "${String(value)}".`);
  }
}

export function createPresentationPlaybackMachine(
  input: PresentationPlaybackMachineInput,
): PresentationPlaybackMachine {
  const actor = createActor(presentationPlaybackMachine, { input });
  actor.start();

  const readSnapshot = (): PresentationPlaybackMachineSnapshot => {
    const snapshot = actor.getSnapshot();
    const phase = readMachinePhase(snapshot.value);
    return {
      phase,
      ...(snapshot.value === "held-manual"
        ? { hold: { kind: "manual" as const, waitId: pendingManualWait(snapshot.context).id } }
        : snapshot.value === "held-learner-waiting"
          ? {
              hold: {
                kind: "learner" as const,
                waitId: pendingLearnerWait(snapshot.context).id,
                status: "waiting" as const,
              },
            }
          : snapshot.value === "held-learner-ready"
            ? {
                hold: {
                  kind: "learner" as const,
                  waitId: pendingLearnerWait(snapshot.context).id,
                  status: "ready" as const,
                },
              }
            : {}),
      runNumber: snapshot.context.runNumber,
      surfaceId: snapshot.context.surfaceId,
      currentTimeMs: snapshot.context.currentTimeMs,
      durationMs: snapshot.context.durationMs,
      outstandingLearnerWaitId: snapshot.context.outstandingLearnerWaitId,
    };
  };

  return Object.freeze({
    getSnapshot: readSnapshot,
    subscribe(listener: (snapshot: PresentationPlaybackMachineSnapshot) => void) {
      let active = true;
      const subscription = actor.subscribe(() => {
        if (active) listener(readSnapshot());
      });
      return () => {
        if (!active) return;
        active = false;
        subscription.unsubscribe();
      };
    },
    play: () => {
      const snapshot = actor.getSnapshot();
      const phase = readMachinePhase(snapshot.value);
      const needsAnchor =
        (phase === "awaiting-start" || phase === "paused") &&
        snapshot.context.currentTimeMs < snapshot.context.durationMs;
      actor.send({
        type: "play",
        anchorClockTimeMs: needsAnchor ? finiteClockReadingFrom(input.monotonicClock) : 0,
      });
    },
    pause: () => actor.send({ type: "pause" }),
    advance: () => {
      const snapshot = actor.getSnapshot();
      const phase = readMachinePhase(snapshot.value);
      const needsAnchor =
        phase === "held" && snapshot.context.currentTimeMs < snapshot.context.durationMs;
      actor.send({
        type: "advance",
        anchorClockTimeMs: needsAnchor ? finiteClockReadingFrom(input.monotonicClock) : 0,
      });
    },
    seek: (timeMs: number) => {
      const snapshot = actor.getSnapshot();
      const needsAnchor =
        readMachinePhase(snapshot.value) === "playing" && timeMs < snapshot.context.durationMs;
      actor.send({
        type: "seek",
        timeMs,
        anchorClockTimeMs: needsAnchor ? finiteClockReadingFrom(input.monotonicClock) : 0,
      });
    },
    restart: () => actor.send({ type: "restart" }),
    stop: () => actor.send({ type: "stop" }),
    dispose: () => actor.stop(),
  });
}
