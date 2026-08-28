import { assign, createActor, enqueueActions, fromCallback, sendTo, setup } from "xstate";

import type {
  CompiledInternalClockSurfaceTimeline,
  CompiledPresentationCue,
} from "./compiled-presentation-program";
import type {
  PresentationCueExecutionOutcome,
  PresentationCueExecutor,
  PresentationCueOutcome,
  PresentationCueReport,
} from "./presentation-cue-executor";
import type { PresentationMonotonicClockPort } from "./presentation-monotonic-clock";

type PresentationPlaybackMachinePhase =
  | "awaiting-start"
  | "playing"
  | "paused"
  | "completed"
  | "stopped";

type PresentationCueInterruptionReason = "seek" | "restart" | "stop";

interface PresentationPlaybackMachineContext {
  readonly surfaceId: string;
  readonly durationMs: number;
  readonly monotonicClock: PresentationMonotonicClockPort;
  readonly cueExecutor: PresentationCueExecutor;
  readonly publishCueReport: (report: PresentationCueReport) => void;
  readonly cues: readonly CompiledPresentationCue[];
  runNumber: number;
  currentTimeMs: number;
  anchorClockTimeMs: number;
  anchorPresentationTimeMs: number;
  consumedCueIds: ReadonlySet<string>;
}

type PresentationPlaybackMachineEvent =
  | { readonly type: "play"; readonly anchorClockTimeMs: number }
  | { readonly type: "pause" }
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
  readonly publishCueReport: (report: PresentationCueReport) => void;
}

interface PresentationClockActorInput {
  readonly monotonicClock: PresentationMonotonicClockPort;
  readonly anchorClockTimeMs: number;
  readonly anchorPresentationTimeMs: number;
  readonly durationMs: number;
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
  readonly runNumber: number;
  readonly surfaceId: string;
  readonly currentTimeMs: number;
  readonly durationMs: number;
}

interface PresentationPlaybackMachine {
  getSnapshot(): PresentationPlaybackMachineSnapshot;
  subscribe(listener: (snapshot: PresentationPlaybackMachineSnapshot) => void): () => void;
  play(): void;
  pause(): void;
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
  if (event.type !== "play" && event.type !== "seek") {
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
  const projectedTimeMs = Math.min(
    durationMs,
    Math.floor(anchorPresentationTimeMs + elapsedMs),
  );
  if (projectedTimeMs < confirmedTimeMs) {
    throw new Error("Presentation clock projection moved behind the last confirmed playhead.");
  }
  return projectedTimeMs;
}

function unconsumedCuesThrough(
  context: PresentationPlaybackMachineContext,
  timeMs: number,
): readonly CompiledPresentationCue[] {
  return context.cues.filter(
    (cue) => cue.atMs <= timeMs && !context.consumedCueIds.has(cue.id),
  );
}

function consumedCueIdsWith(
  context: PresentationPlaybackMachineContext,
  cues: readonly CompiledPresentationCue[],
): ReadonlySet<string> {
  return new Set([...context.consumedCueIds, ...cues.map((cue) => cue.id)]);
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
  },
  guards: {
    atDuration: ({ context }) => context.currentTimeMs === context.durationMs,
    seekAtDuration: ({ context, event }) => seekTimeFrom(event) === context.durationMs,
    seekAtStart: ({ event }) => seekTimeFrom(event) === 0,
    clockReachedDuration: ({ context, event }) =>
      projectedTimeFrom(event) === context.durationMs,
    drainedCurrentRun: ({ context, event }) =>
      event.type === "cue-worker-drained" && event.runNumber === context.runNumber,
  },
  actions: {
    anchorPlayback: assign({
      anchorClockTimeMs: ({ event }) => anchorClockTimeFrom(event),
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
    }),
    throwWorkerDefect: ({ event }) => {
      if (event.type !== "cue-worker-defect") {
        throw new Error("Presentation cue defect action received an unexpected event.");
      }
      throw event.error;
    },
  },
});

const presentationPlaybackMachine = presentationPlaybackMachineSetup.createMachine({
  id: "presentation-playback",
  context: ({ input }) => ({
    surfaceId: input.timeline.surfaceId,
    durationMs: input.timeline.durationMs,
    monotonicClock: input.monotonicClock,
    cueExecutor: input.cueExecutor,
    publishCueReport: input.publishCueReport,
    cues: input.timeline.cues,
    runNumber: 1,
    currentTimeMs: 0,
    anchorClockTimeMs: 0,
    anchorPresentationTimeMs: 0,
    consumedCueIds: new Set<string>(),
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
          { guard: "atDuration", target: "completed" },
          { target: "playing", actions: ["enqueueCurrentCues", "anchorPlayback"] },
        ],
        seek: [
          {
            guard: "seekAtDuration",
            target: "completed",
            actions: ["interruptForSeek", "consumeSeekCues", "applySeek"],
          },
          {
            guard: "seekAtStart",
            actions: ["interruptForSeek", "consumeSeekCues", "applySeek"],
          },
          {
            target: "paused",
            actions: ["interruptForSeek", "consumeSeekCues", "applySeek"],
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
            guard: "clockReachedDuration",
            target: "settling-cues",
            actions: ["enqueueEndpointCues", "applyClockTick"],
          },
          { actions: ["enqueueClockCues", "applyClockTick"] },
        ],
        pause: { target: "paused" },
        seek: [
          {
            guard: "seekAtDuration",
            target: "completed",
            actions: ["interruptForSeek", "consumeSeekCues", "applySeek"],
          },
          {
            target: "playing",
            reenter: true,
            actions: ["interruptForSeek", "consumeSeekCues", "applyPlayingSeek"],
          },
        ],
      },
    },
    "settling-cues": {
      on: {
        "cue-worker-drained": { guard: "drainedCurrentRun", target: "completed" },
        seek: [
          {
            guard: "seekAtDuration",
            target: "completed",
            actions: ["interruptForSeek", "consumeSeekCues", "applySeek"],
          },
          {
            target: "playing",
            actions: ["interruptForSeek", "consumeSeekCues", "applyPlayingSeek"],
          },
        ],
      },
    },
    paused: {
      on: {
        play: [
          { guard: "atDuration", target: "completed" },
          { target: "playing", actions: ["enqueueCurrentCues", "anchorPlayback"] },
        ],
        seek: [
          {
            guard: "seekAtDuration",
            target: "completed",
            actions: ["interruptForSeek", "consumeSeekCues", "applySeek"],
          },
          { actions: ["interruptForSeek", "consumeSeekCues", "applySeek"] },
        ],
      },
    },
    completed: {
      on: {
        seek: [
          {
            guard: "seekAtDuration",
            actions: ["interruptForSeek", "consumeSeekCues", "applySeek"],
          },
          {
            target: "paused",
            actions: ["interruptForSeek", "consumeSeekCues", "applySeek"],
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
      return "playing";
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
    return {
      phase: readMachinePhase(snapshot.value),
      runNumber: snapshot.context.runNumber,
      surfaceId: snapshot.context.surfaceId,
      currentTimeMs: snapshot.context.currentTimeMs,
      durationMs: snapshot.context.durationMs,
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
