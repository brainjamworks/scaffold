import { assign, createActor, fromCallback, setup } from "xstate";

import type { CompiledInternalClockSurfaceTimeline } from "./compiled-presentation-program";
import type { PresentationMonotonicClockPort } from "./presentation-monotonic-clock";

type PresentationPlaybackMachinePhase =
  | "awaiting-start"
  | "playing"
  | "paused"
  | "completed"
  | "stopped";

interface PresentationPlaybackMachineContext {
  readonly surfaceId: string;
  readonly durationMs: number;
  readonly monotonicClock: PresentationMonotonicClockPort;
  runNumber: number;
  currentTimeMs: number;
  anchorClockTimeMs: number;
  anchorPresentationTimeMs: number;
}

type PresentationPlaybackMachineEvent =
  | { readonly type: "play" }
  | { readonly type: "pause" }
  | { readonly type: "seek"; readonly timeMs: number }
  | { readonly type: "restart" }
  | { readonly type: "stop" }
  | { readonly type: "clock-tick"; readonly nowMs: number };

interface PresentationPlaybackMachineInput {
  readonly timeline: CompiledInternalClockSurfaceTimeline;
  readonly monotonicClock: PresentationMonotonicClockPort;
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
  PresentationMonotonicClockPort
>(
  ({ input, sendBack }) =>
    input.subscribe(() => {
      sendBack({ type: "clock-tick", nowMs: input.nowMs() });
    }),
);

function seekTimeFrom(event: PresentationPlaybackMachineEvent): number {
  if (event.type !== "seek") {
    throw new Error(`Presentation Seek action received unexpected event "${event.type}".`);
  }
  return event.timeMs;
}

function clockTimeFrom(event: PresentationPlaybackMachineEvent): number {
  if (event.type !== "clock-tick") {
    throw new Error(`Presentation clock action received unexpected event "${event.type}".`);
  }
  return event.nowMs;
}

function projectedClockTime(
  context: PresentationPlaybackMachineContext,
  nowMs: number,
): number {
  if (!Number.isFinite(nowMs)) {
    throw new Error("Presentation monotonic clock returned a non-finite reading.");
  }

  const elapsedMs = Math.max(0, nowMs - context.anchorClockTimeMs);
  return Math.min(
    context.durationMs,
    Math.floor(context.anchorPresentationTimeMs + elapsedMs),
  );
}

const presentationPlaybackMachineSetup = setup({
  types: {
    context: {} as PresentationPlaybackMachineContext,
    events: {} as PresentationPlaybackMachineEvent,
    input: {} as PresentationPlaybackMachineInput,
  },
  actors: {
    monotonicClock: monotonicClockActor,
  },
  guards: {
    atDuration: ({ context }) => context.currentTimeMs === context.durationMs,
    seekAtDuration: ({ context, event }) => seekTimeFrom(event) === context.durationMs,
    seekAtStart: ({ event }) => seekTimeFrom(event) === 0,
    clockReachedDuration: ({ context, event }) =>
      projectedClockTime(context, clockTimeFrom(event)) === context.durationMs,
  },
  actions: {
    anchorPlayback: assign({
      anchorClockTimeMs: ({ context }) => context.monotonicClock.nowMs(),
      anchorPresentationTimeMs: ({ context }) => context.currentTimeMs,
    }),
    applyClockTick: assign({
      currentTimeMs: ({ context, event }) =>
        projectedClockTime(context, clockTimeFrom(event)),
    }),
    applySeek: assign({
      currentTimeMs: ({ event }) => seekTimeFrom(event),
    }),
    applyPlayingSeek: assign(({ context, event }) => {
      const timeMs = seekTimeFrom(event);
      return {
        currentTimeMs: timeMs,
        anchorClockTimeMs: context.monotonicClock.nowMs(),
        anchorPresentationTimeMs: timeMs,
      };
    }),
    restartRun: assign({
      runNumber: ({ context }) => context.runNumber + 1,
      currentTimeMs: 0,
      anchorClockTimeMs: 0,
      anchorPresentationTimeMs: 0,
    }),
  },
});

const presentationPlaybackMachine = presentationPlaybackMachineSetup.createMachine({
  id: "presentation-playback",
  context: ({ input }) => ({
    surfaceId: input.timeline.surfaceId,
    durationMs: input.timeline.durationMs,
    monotonicClock: input.monotonicClock,
    runNumber: 1,
    currentTimeMs: 0,
    anchorClockTimeMs: 0,
    anchorPresentationTimeMs: 0,
  }),
  initial: "awaiting-start",
  on: {
    restart: {
      target: ".awaiting-start",
      actions: "restartRun",
    },
    stop: {
      target: ".stopped",
    },
  },
  states: {
    "awaiting-start": {
      on: {
        play: [
          { guard: "atDuration", target: "completed" },
          { target: "playing", actions: "anchorPlayback" },
        ],
        seek: [
          { guard: "seekAtDuration", target: "completed", actions: "applySeek" },
          { guard: "seekAtStart", actions: "applySeek" },
          { target: "paused", actions: "applySeek" },
        ],
      },
    },
    playing: {
      invoke: {
        src: "monotonicClock",
        input: ({ context }) => context.monotonicClock,
      },
      on: {
        "clock-tick": [
          {
            guard: "clockReachedDuration",
            target: "completed",
            actions: "applyClockTick",
          },
          { actions: "applyClockTick" },
        ],
        pause: {
          target: "paused",
        },
        seek: [
          { guard: "seekAtDuration", target: "completed", actions: "applySeek" },
          {
            target: "playing",
            reenter: true,
            actions: "applyPlayingSeek",
          },
        ],
      },
    },
    paused: {
      on: {
        play: [
          { guard: "atDuration", target: "completed" },
          { target: "playing", actions: "anchorPlayback" },
        ],
        seek: [
          { guard: "seekAtDuration", target: "completed", actions: "applySeek" },
          { actions: "applySeek" },
        ],
      },
    },
    completed: {
      on: {
        seek: [
          { guard: "seekAtDuration", actions: "applySeek" },
          { target: "paused", actions: "applySeek" },
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
    default:
      throw new Error(`Presentation actor entered impossible state "${String(value)}".`);
  }
}

function assertValidTimeline(timeline: CompiledInternalClockSurfaceTimeline): void {
  if (timeline.surfaceId.length === 0) {
    throw new Error("Presentation compiled timeline requires a Surface ID.");
  }
  if (!Number.isSafeInteger(timeline.durationMs) || timeline.durationMs < 0) {
    throw new Error("Presentation compiled timeline duration must be a non-negative integer.");
  }
}

export function createPresentationPlaybackMachine(
  input: PresentationPlaybackMachineInput,
): PresentationPlaybackMachine {
  assertValidTimeline(input.timeline);
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
    play: () => actor.send({ type: "play" }),
    pause: () => actor.send({ type: "pause" }),
    seek: (timeMs: number) => actor.send({ type: "seek", timeMs }),
    restart: () => actor.send({ type: "restart" }),
    stop: () => actor.send({ type: "stop" }),
    dispose: () => actor.stop(),
  });
}
