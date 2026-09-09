import type { EmbeddedDataId, EmbeddedNodeId } from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  ControlBinding,
  ControlCommandError,
  ControlCommandRequest,
} from "@/document/control-binding/control-binding";
import type { SemanticTargetInteractionResult } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";

import type {
  CompiledInternalClockSurfaceTimeline,
  CompiledLearnerRequirement,
  CompiledPresentationCue,
  CompiledPresentationWait,
  PresentationWaitId,
} from "./compiled-presentation-program";
import type { PresentationSurfaceNarrationSnapshot } from "./narration";
import type {
  PresentationCueExecutionOutcome,
  PresentationCueExecutor,
  PresentationTargetCommand,
} from "./presentation-cue-executor";
import { createPresentationCueExecutor } from "./presentation-cue-executor";
import {
  createAnimationFramePresentationMonotonicClock,
  createPresentationNarrationClockSource,
  type PresentationPlaybackClockSource,
} from "./presentation-monotonic-clock";
import {
  createPresentationPlaybackSession,
  type PresentationAdvanceResult,
  type PresentationCueReport,
  type PresentationPlaybackPhase,
  type PresentationPlaybackSession,
  type PresentationPlaybackSessionWithReplaceableClock,
  type PresentationSeekResult,
} from "./presentation-playback-session";
import type { PresentationGatePort } from "./presentation-progression-gate";

function createManualClock(initialNowMs = 1_000) {
  let nowMs = initialNowMs;
  let activeSubscriptions = 0;
  let maximumActiveSubscriptions = 0;
  let subscriptionsStarted = 0;
  const listeners = new Set<() => void>();

  const clock: PresentationPlaybackClockSource = {
    nowMs: vi.fn(() => nowMs),
    subscribe: vi.fn((listener) => {
      let active = true;
      subscriptionsStarted += 1;
      activeSubscriptions += 1;
      maximumActiveSubscriptions = Math.max(maximumActiveSubscriptions, activeSubscriptions);
      listeners.add(listener);

      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
        activeSubscriptions -= 1;
      };
    }),
  };

  return {
    clock,
    emitAt(nextNowMs: number) {
      nowMs = nextNowMs;
      for (const listener of [...listeners]) listener();
    },
    setNowMs(nextNowMs: number) {
      nowMs = nextNowMs;
    },
    get activeSubscriptions() {
      return activeSubscriptions;
    },
    get maximumActiveSubscriptions() {
      return maximumActiveSubscriptions;
    },
    get subscriptionsStarted() {
      return subscriptionsStarted;
    },
  };
}

function createNarrationClock(initialTimeMs: number, surfaceId = "surface-1" as EmbeddedNodeId) {
  let liveTimeMs = initialTimeMs;
  let snapshot: PresentationSurfaceNarrationSnapshot = {
    status: "playing" as const,
    currentTimeMs: initialTimeMs,
    durationMs: 1_000,
    error: null,
  };
  let activeSubscriptions = 0;
  let maximumActiveSubscriptions = 0;
  const listeners = new Set<() => void>();
  const controller = {
    surfaceId,
    getSnapshot: () => snapshot,
    getClockTimeMs: () => liveTimeMs,
    subscribe(listener: () => void) {
      activeSubscriptions += 1;
      maximumActiveSubscriptions = Math.max(maximumActiveSubscriptions, activeSubscriptions);
      listeners.add(listener);
      return () => {
        if (!listeners.delete(listener)) return;
        activeSubscriptions -= 1;
      };
    },
  };

  return {
    source: createPresentationNarrationClockSource(controller),
    setLiveTimeMs(nextTimeMs: number) {
      liveTimeMs = nextTimeMs;
    },
    publish(status: "playing" | "buffering" | "seeking" | "failed", currentTimeMs: number) {
      snapshot = {
        status,
        currentTimeMs,
        durationMs: 1_000,
        error:
          status === "failed"
            ? ({ reason: "narration-unavailable", mediaErrorCode: 3 } as const)
            : null,
      };
      liveTimeMs = currentTimeMs;
      for (const listener of [...listeners]) listener();
    },
    get activeSubscriptions() {
      return activeSubscriptions;
    },
    get maximumActiveSubscriptions() {
      return maximumActiveSubscriptions;
    },
  };
}

function createDeferredCueExecutor() {
  interface PendingExecution {
    readonly command: PresentationTargetCommand;
    readonly signal: AbortSignal;
    readonly resolve: (outcome: PresentationCueExecutionOutcome) => void;
    readonly reject: (reason?: unknown) => void;
  }

  const pending: PendingExecution[] = [];
  const executor: PresentationCueExecutor = {
    execute: vi.fn(
      ({ command, signal }) =>
        new Promise<PresentationCueExecutionOutcome>((resolve, reject) => {
          pending.push({ command, signal, resolve, reject });
        }),
    ),
  };

  return { executor, pending };
}

function cue(
  id: string,
  atMs: number,
  seekBehavior: CompiledPresentationCue["seekBehavior"] = "consume",
): CompiledPresentationCue {
  return Object.freeze({
    id: id as EmbeddedDataId,
    atMs,
    seekBehavior,
    command: Object.freeze({
      kind: "target-command",
      ownerId: `owner-${id}` as EmbeddedNodeId,
      targetId: `target-${id}` as EmbeddedNodeId,
      type: `command-${id}`,
    }),
  });
}

function waitId(id: string): PresentationWaitId {
  return id as EmbeddedDataId;
}

function beforeManualWait(id: string, atMs: number): CompiledPresentationWait {
  return Object.freeze({
    kind: "manual-wait",
    id: waitId(id),
    atMs,
    boundary: "before-actions",
  });
}

function afterManualWait(id: string, atMs: number): CompiledPresentationWait {
  return Object.freeze({
    kind: "manual-wait",
    id: waitId(id),
    atMs,
    boundary: "after-actions",
  });
}

function beforeLearnerWait(
  id: string,
  atMs: number,
  requirement: CompiledLearnerRequirement = Object.freeze({
    kind: "event",
    ownerId: `owner-${id}` as EmbeddedNodeId,
    targetId: `target-${id}` as EmbeddedNodeId,
    type: `event-${id}`,
  }),
): CompiledPresentationWait {
  return Object.freeze({
    kind: "learner-wait",
    id: waitId(id),
    atMs,
    boundary: "before-actions",
    requirement,
  });
}

function createDeferredGatePort() {
  interface PendingObservation {
    readonly requirement: CompiledLearnerRequirement;
    readonly signal: AbortSignal;
    readonly resolve: () => void;
    readonly reject: (reason?: unknown) => void;
  }

  const pending: PendingObservation[] = [];
  const waitUntilSatisfied = vi.fn(
    (requirement: CompiledLearnerRequirement, { signal }: { readonly signal: AbortSignal }) =>
      new Promise<void>((resolve, reject) => {
        pending.push({ requirement, signal, resolve, reject });
      }),
  );
  const gatePort: PresentationGatePort = Object.freeze({ waitUntilSatisfied });
  return { gatePort, pending, waitUntilSatisfied };
}

async function settleCue(
  execution: { readonly resolve: (outcome: PresentationCueExecutionOutcome) => void },
  outcome: PresentationCueExecutionOutcome = { kind: "succeeded" },
): Promise<void> {
  execution.resolve(outcome);
  await Promise.resolve();
  await Promise.resolve();
}

async function settleGate(observation: { readonly resolve: () => void }): Promise<void> {
  observation.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createHarness(
  durationMs = 1_000,
  cues: readonly CompiledPresentationCue[] = [],
  deferredCueExecutor = createDeferredCueExecutor(),
  waits: readonly CompiledPresentationWait[] = [],
  autoAdvance = false,
  deferredGatePort = createDeferredGatePort(),
) {
  const timeline: CompiledInternalClockSurfaceTimeline = Object.freeze({
    surfaceId: "surface-1",
    durationMs,
    cues: Object.freeze([...cues]),
    waits: Object.freeze([...waits]),
  });
  const manualClock = createManualClock();
  const { gatePort, waitUntilSatisfied: gateWaitUntilSatisfied } = deferredGatePort;
  const session = createPresentationPlaybackSession({
    timeline,
    monotonicClock: manualClock.clock,
    cueExecutor: deferredCueExecutor.executor,
    gatePort,
    autoAdvance,
  });

  return {
    deferredCueExecutor,
    deferredGatePort,
    gatePort,
    gateWaitUntilSatisfied,
    manualClock,
    session,
    timeline,
  };
}

function expectSeekOk(result: PresentationSeekResult): void {
  expect(result.isOk()).toBe(true);
  if (result.isErr()) throw new Error(`Expected successful Seek: ${JSON.stringify(result.error)}`);
}

function seek(session: PresentationPlaybackSession, timeMs: number): PresentationSeekResult {
  const position = session.resolveSeekPosition(timeMs);
  if (position.isErr()) return position;
  session.seek(position.value);
  return Result.ok();
}

function expectAdvanceOk(result: PresentationAdvanceResult): void {
  expect(result.isOk()).toBe(true);
  if (result.isErr())
    throw new Error(`Expected successful advance: ${JSON.stringify(result.error)}`);
}

function createHarnessInPhase(phase: PresentationPlaybackPhase) {
  const harness = createHarness();

  switch (phase) {
    case "awaiting-start":
      break;
    case "playing":
      harness.session.play();
      break;
    case "paused":
      harness.session.play();
      harness.manualClock.emitAt(1_050);
      harness.session.pause();
      break;
    case "completed":
      harness.session.play();
      harness.manualClock.emitAt(2_000);
      break;
    case "stopped":
      harness.session.play();
      harness.manualClock.emitAt(1_050);
      harness.session.stop();
      break;
  }

  expect(harness.session.getSnapshot().phase).toBe(phase);
  return harness;
}

function expectDisposedSessionDefects(
  session: PresentationPlaybackSessionWithReplaceableClock,
): void {
  const narration = createNarrationClock(0);
  const operations: ReadonlyArray<readonly [string, () => unknown]> = [
    ["getSnapshot", () => session.getSnapshot()],
    ["subscribe", () => session.subscribe(() => undefined)],
    ["subscribeCueReports", () => session.subscribeCueReports(() => undefined)],
    ["play", () => session.play()],
    ["pause", () => session.pause()],
    ["seek", () => seek(session, 0)],
    ["advance", () => session.advance()],
    ["restart", () => session.restart()],
    ["stop", () => session.stop()],
    ["useNarrationClock", () => session.useNarrationClock(narration.source)],
    ["useInternalClock", () => session.useInternalClock()],
    ["beginMediaStart", () => session.beginMediaStart()],
    ["beginAdvanceMediaStart", () => session.beginAdvanceMediaStart()],
    ["cancelMediaStart", () => session.cancelMediaStart()],
    ["beginReposition", () => session.beginReposition("seek")],
  ];

  for (const [operation, invoke] of operations) {
    expect(invoke, operation).toThrowError(/disposed/i);
  }
}

describe("createPresentationCueExecutor", () => {
  it("confirms semantic reachability before ordinary execution through a mounted owner", async () => {
    const ownerId = "owner-current" as EmbeddedNodeId;
    const targetId = "target-current" as EmbeddedNodeId;
    const signal = new AbortController().signal;
    const order: string[] = [];
    const eventSubscribe = vi.fn();
    const execute = vi.fn(async (_request: ControlCommandRequest) => {
      order.push("execute");
      return Result.ok();
    });
    const semanticTargets = {
      activate: vi.fn(async () => {
        order.push("activate");
        return { kind: "reached" as const, requestedId: targetId };
      }),
    };
    const controlBindings = {
      get: vi.fn(() => {
        order.push("get");
        return {
          ownerId,
          commandExecutor: { execute },
          eventSource: { subscribe: eventSubscribe },
        };
      }),
    };
    const executor = createPresentationCueExecutor({
      semanticTargets,
      controlBindings,
      origin: "configured-presentation",
    });
    const command = {
      kind: "target-command",
      ownerId,
      targetId,
      type: "show-answer",
    } as const satisfies PresentationTargetCommand;

    await expect(executor.execute({ command, signal })).resolves.toEqual({ kind: "succeeded" });

    expect(order).toEqual(["activate", "get", "execute"]);
    expect(semanticTargets.activate).toHaveBeenCalledWith(targetId, {
      origin: "configured-presentation",
      signal,
    });
    expect(controlBindings.get).toHaveBeenCalledWith(ownerId);
    expect(execute).toHaveBeenCalledWith({ targetId, type: "show-answer", signal });
    expect(Object.hasOwn(execute.mock.calls[0]?.[0] ?? {}, "input")).toBe(false);
    expect(eventSubscribe).not.toHaveBeenCalled();
  });

  it("reconstructs through an already mounted owner without reactivating its semantic target", async () => {
    const ownerId = "owner-current" as EmbeddedNodeId;
    const targetId = "target-current" as EmbeddedNodeId;
    const signal = new AbortController().signal;
    const execute = vi.fn(async () => Result.ok());
    const semanticTargets = {
      activate: vi.fn(async () => ({ kind: "reached" as const, requestedId: targetId })),
    };
    const controlBindings = {
      get: vi.fn(() => ({ ownerId, commandExecutor: { execute } })),
    };
    const executor = createPresentationCueExecutor({
      semanticTargets,
      controlBindings,
      origin: "configured-presentation",
    });

    await expect(
      executor.reconstruct({
        command: { kind: "target-command", ownerId, targetId, type: "select" },
        signal,
      }),
    ).resolves.toEqual({ kind: "succeeded" });

    expect(controlBindings.get).toHaveBeenCalledOnce();
    expect(semanticTargets.activate).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledWith({ targetId, type: "select", signal });
  });

  it("does not let a mounted binding bypass an ordinary semantic authority refusal", async () => {
    const ownerId = "owner-hidden" as EmbeddedNodeId;
    const targetId = "target-hidden" as EmbeddedNodeId;
    const childId = "hidden-tab" as EmbeddedNodeId;
    const execute = vi.fn(async () => Result.ok());
    const refusal = {
      kind: "refused" as const,
      requestedId: targetId,
      ownerId,
      childId,
      nearestReachableOwnerId: null,
      reason: "authority-boundary" as const,
    };
    const controlBindings = {
      get: vi.fn(() => ({ ownerId, commandExecutor: { execute } })),
    };
    const executor = createPresentationCueExecutor({
      semanticTargets: { activate: vi.fn(async () => refusal) },
      controlBindings,
      origin: "configured-presentation",
    });

    await expect(
      executor.execute({
        command: { kind: "target-command", ownerId, targetId, type: "play" },
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({ kind: "target-not-reached", result: refusal });
    expect(controlBindings.get).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses semantic reachability to mount an absent owner before command lookup", async () => {
    const ownerId = "owner-later" as EmbeddedNodeId;
    const targetId = "target-later" as EmbeddedNodeId;
    const signal = new AbortController().signal;
    const execute = vi.fn(async () => Result.ok());
    let binding: ControlBinding | undefined;
    const semanticTargets = {
      activate: vi.fn(async () => {
        binding = { ownerId, commandExecutor: { execute } };
        return { kind: "reached" as const, requestedId: targetId };
      }),
    };
    const controlBindings = { get: vi.fn(() => binding) };
    const executor = createPresentationCueExecutor({
      semanticTargets,
      controlBindings,
      origin: "configured-presentation",
    });

    await expect(
      executor.execute({
        command: { kind: "target-command", ownerId, targetId, type: "show-answer" },
        signal,
      }),
    ).resolves.toEqual({ kind: "succeeded" });

    expect(semanticTargets.activate).toHaveBeenCalledWith(targetId, {
      origin: "configured-presentation",
      signal,
    });
    expect(controlBindings.get).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith({ targetId, type: "show-answer", signal });
  });

  it.each([
    {
      kind: "missing-target",
      requestedId: "target-semantic" as EmbeddedNodeId,
    },
    {
      kind: "unavailable",
      requestedId: "target-semantic" as EmbeddedNodeId,
      ownerId: "owner-semantic" as EmbeddedNodeId,
      childId: "child-semantic" as EmbeddedNodeId,
      nearestReachableOwnerId: "nearest-semantic" as EmbeddedNodeId,
      reason: "owner-unmounted",
    },
    {
      kind: "refused",
      requestedId: "target-semantic" as EmbeddedNodeId,
      ownerId: "owner-semantic" as EmbeddedNodeId,
      childId: "child-semantic" as EmbeddedNodeId,
      nearestReachableOwnerId: null,
      reason: "authority-boundary",
    },
    {
      kind: "interrupted",
      requestedId: "target-semantic" as EmbeddedNodeId,
    },
  ] satisfies readonly Exclude<SemanticTargetInteractionResult, { readonly kind: "reached" }>[])(
    "maps semantic $kind after finding no mounted Control Binding",
    async (targetResult) => {
      const controlBindings = { get: vi.fn() };
      const executor = createPresentationCueExecutor({
        semanticTargets: { activate: vi.fn(async () => targetResult) },
        controlBindings,
        origin: "author-preview",
      });
      const command = {
        kind: "target-command",
        ownerId: "owner-semantic" as EmbeddedNodeId,
        targetId: "target-semantic" as EmbeddedNodeId,
        type: "show-answer",
      } as const satisfies PresentationTargetCommand;

      const outcome = await executor.execute({ command, signal: new AbortController().signal });

      expect(outcome).toEqual({ kind: "target-not-reached", result: targetResult });
      if (outcome.kind !== "target-not-reached") {
        throw new Error("Expected the semantic failure outcome.");
      }
      expect(outcome.result).toBe(targetResult);
      expect(controlBindings.get).not.toHaveBeenCalled();
    },
  );

  it.each([
    { reason: "cancelled" },
    { reason: "playback-not-allowed" },
    { reason: "media-unavailable", mediaErrorCode: 4 },
    { reason: "seek-out-of-range", requestedSeconds: 12, durationSeconds: 10 },
    { reason: "page-out-of-range", requestedPage: 6, pageCount: 5 },
    { reason: "pdf-unavailable", requestedPage: 3 },
  ] satisfies readonly ControlCommandError[])(
    "maps Control Command $reason with exact facts",
    async (error) => {
      const ownerId = "owner-command" as EmbeddedNodeId;
      const targetId = "target-command" as EmbeddedNodeId;
      const signal = new AbortController().signal;
      const execute = vi.fn(async () => Result.err(error));
      const executor = createPresentationCueExecutor({
        semanticTargets: {
          activate: vi.fn(async () => ({ kind: "reached" as const, requestedId: targetId })),
        },
        controlBindings: {
          get: vi.fn(() => ({ ownerId, commandExecutor: { execute } })),
        },
        origin: "configured-presentation",
      });
      const command = {
        kind: "target-command",
        ownerId,
        targetId,
        type: "seek",
        input: 12,
      } as const satisfies PresentationTargetCommand;

      const outcome = await executor.execute({ command, signal });

      expect(outcome).toEqual({ kind: "control-command-error", error });
      if (outcome.kind !== "control-command-error") {
        throw new Error("Expected the Control Command failure outcome.");
      }
      expect(outcome.error).toBe(error);
      expect(execute).toHaveBeenCalledWith({ targetId, type: "seek", input: 12, signal });
    },
  );

  it("continues with a later due cue after an expected semantic failure", async () => {
    const firstCue = cue("missing-adapter", 0);
    const secondCue = cue("successful-adapter", 0);
    const execute = vi.fn(async () => Result.ok());
    const eventSubscribe = vi.fn();
    const cueExecutor = createPresentationCueExecutor({
      semanticTargets: {
        activate: vi.fn(async (targetId) =>
          targetId === firstCue.command.targetId
            ? { kind: "missing-target" as const, requestedId: targetId }
            : { kind: "reached" as const, requestedId: targetId },
        ),
      },
      controlBindings: {
        get: vi.fn((ownerId) =>
          ownerId === secondCue.command.ownerId
            ? {
                ownerId: secondCue.command.ownerId,
                commandExecutor: { execute },
                eventSource: { subscribe: eventSubscribe },
              }
            : undefined,
        ),
      },
      origin: "author-preview",
    });
    const timeline: CompiledInternalClockSurfaceTimeline = Object.freeze({
      surfaceId: "surface-1",
      durationMs: 100,
      cues: Object.freeze([firstCue, secondCue]),
      waits: Object.freeze([]),
    });
    const session = createPresentationPlaybackSession({
      timeline,
      monotonicClock: createManualClock().clock,
      cueExecutor,
      gatePort: createDeferredGatePort().gatePort,
      autoAdvance: false,
    });
    const reports: PresentationCueReport[] = [];
    const secondCueReported = new Promise<void>((resolve) => {
      session.subscribeCueReports((report) => {
        reports.push(report);
        if (report.cueId === secondCue.id) resolve();
      });
    });

    session.play();
    await secondCueReported;

    expect(reports.map(({ cueId, outcome }) => ({ cueId, outcome }))).toEqual([
      {
        cueId: "missing-adapter",
        outcome: {
          kind: "target-not-reached",
          result: {
            kind: "missing-target",
            requestedId: firstCue.command.targetId,
          },
        },
      },
      { cueId: "successful-adapter", outcome: { kind: "succeeded" } },
    ]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(eventSubscribe).not.toHaveBeenCalled();
  });

  it("rejects a reached result for a different target before binding lookup", async () => {
    const targetId = "target-requested" as EmbeddedNodeId;
    const controlBindings = { get: vi.fn() };
    const executor = createPresentationCueExecutor({
      semanticTargets: {
        activate: vi.fn(async () => ({
          kind: "reached" as const,
          requestedId: "target-other" as EmbeddedNodeId,
        })),
      },
      controlBindings,
      origin: "configured-presentation",
    });

    await expect(
      executor.execute({
        command: {
          kind: "target-command",
          ownerId: "owner-requested" as EmbeddedNodeId,
          targetId,
          type: "show-answer",
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/target identity/i);
    expect(controlBindings.get).not.toHaveBeenCalled();
  });

  it("rejects a missing current owner binding", async () => {
    const targetId = "target-unmounted" as EmbeddedNodeId;
    const executor = createPresentationCueExecutor({
      semanticTargets: {
        activate: vi.fn(async () => ({ kind: "reached" as const, requestedId: targetId })),
      },
      controlBindings: { get: vi.fn(() => undefined) },
      origin: "configured-presentation",
    });

    await expect(
      executor.execute({
        command: {
          kind: "target-command",
          ownerId: "owner-unmounted" as EmbeddedNodeId,
          targetId,
          type: "show-answer",
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/current Control Binding/i);
  });

  it("rejects a current binding without a Command Executor", async () => {
    const ownerId = "owner-no-executor" as EmbeddedNodeId;
    const targetId = "target-no-executor" as EmbeddedNodeId;
    const executor = createPresentationCueExecutor({
      semanticTargets: {
        activate: vi.fn(async () => ({ kind: "reached" as const, requestedId: targetId })),
      },
      controlBindings: { get: vi.fn(() => ({ ownerId })) },
      origin: "configured-presentation",
    });

    await expect(
      executor.execute({
        command: { kind: "target-command", ownerId, targetId, type: "show-answer" },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/Command Executor/i);
  });

  it("preserves a Semantic Target rejection", async () => {
    const ownerId = "owner-rejection" as EmbeddedNodeId;
    const targetId = "target-rejection" as EmbeddedNodeId;
    const signal = new AbortController().signal;
    const semanticDefect = new Error("Semantic Target port rejected.");
    const controlBindings = { get: vi.fn() };
    const semanticExecutor = createPresentationCueExecutor({
      semanticTargets: { activate: vi.fn(async () => Promise.reject(semanticDefect)) },
      controlBindings,
      origin: "configured-presentation",
    });

    await expect(
      semanticExecutor.execute({
        command: { kind: "target-command", ownerId, targetId, type: "show-answer" },
        signal,
      }),
    ).rejects.toBe(semanticDefect);
    expect(controlBindings.get).not.toHaveBeenCalled();
  });

  it("preserves a Command Executor rejection", async () => {
    const ownerId = "owner-rejection" as EmbeddedNodeId;
    const targetId = "target-rejection" as EmbeddedNodeId;
    const signal = new AbortController().signal;
    const commandDefect = new Error("Command Executor rejected.");
    const commandExecutor = createPresentationCueExecutor({
      semanticTargets: {
        activate: vi.fn(async () => ({ kind: "reached" as const, requestedId: targetId })),
      },
      controlBindings: {
        get: vi.fn(() => ({
          ownerId,
          commandExecutor: { execute: vi.fn(async () => Promise.reject(commandDefect)) },
        })),
      },
      origin: "configured-presentation",
    });

    await expect(
      commandExecutor.execute({
        command: { kind: "target-command", ownerId, targetId, type: "show-answer" },
        signal,
      }),
    ).rejects.toBe(commandDefect);
  });
});

describe("createPresentationPlaybackSession", () => {
  it("projects only the earliest outstanding learner Wait from Surface entry", () => {
    const noWaits = createHarness();
    const manualOnly = createHarness(1_000, [], createDeferredCueExecutor(), [
      beforeManualWait("manual", 100),
    ]);
    const learnerWaits = createHarness(1_000, [], createDeferredCueExecutor(), [
      beforeManualWait("manual", 50),
      beforeLearnerWait("learner-first", 100),
      beforeLearnerWait("learner-next", 200),
    ]);

    expect(noWaits.session.getSnapshot().outstandingLearnerWait).toBeNull();
    expect(manualOnly.session.getSnapshot().outstandingLearnerWait).toBeNull();
    expect(learnerWaits.session.getSnapshot().outstandingLearnerWait).toEqual({
      waitId: waitId("learner-first"),
      position: { timeMs: 100, side: "before-actions" },
    });
    expect(Object.isFrozen(learnerWaits.session.getSnapshot().outstandingLearnerWait)).toBe(true);
    expect(learnerWaits.gateWaitUntilSatisfied).not.toHaveBeenCalled();
  });

  it("resolves exact Wait seeks to their authored side and ordinary seeks after actions", () => {
    const { session } = createHarness(400, [], createDeferredCueExecutor(), [
      beforeManualWait("before", 100),
      afterManualWait("after", 200),
    ]);

    expect(session.resolveSeekPosition(100)).toMatchObject({
      value: { timeMs: 100, side: "before-actions" },
    });
    expect(session.resolveSeekPosition(200)).toMatchObject({
      value: { timeMs: 200, side: "after-actions" },
    });
    expect(session.resolveSeekPosition(150)).toMatchObject({
      value: { timeMs: 150, side: "after-actions" },
    });
  });

  it("passes an event requirement to the gate only after every due cue settles", async () => {
    const requirement: CompiledLearnerRequirement = Object.freeze({
      kind: "event",
      ownerId: "owner-event-gate" as EmbeddedNodeId,
      targetId: "target-event-gate" as EmbeddedNodeId,
      type: "selected",
    });
    const { deferredCueExecutor, deferredGatePort, manualClock, session } = createHarness(
      1_000,
      [cue("prepare-gate", 50), cue("later", 200)],
      createDeferredCueExecutor(),
      [beforeLearnerWait("event-gate", 100, requirement)],
    );

    session.play();
    manualClock.emitAt(1_250);
    expect(session.getSnapshot()).toMatchObject({
      phase: "playing",
      position: { timeMs: 100, side: "before-actions" },
      advancement: "suspended",
    });
    expect(deferredGatePort.pending).toHaveLength(0);

    const dueCue = deferredCueExecutor.pending[0];
    if (!dueCue) throw new Error("Expected the due learner-Wait cue.");
    await settleCue(dueCue);

    expect(deferredGatePort.pending).toHaveLength(1);
    expect(deferredGatePort.pending[0]?.requirement).toBe(requirement);
    expect(deferredGatePort.pending[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", waitId: waitId("event-gate"), status: "waiting" },
      position: { timeMs: 100 },
      outstandingLearnerWait: { waitId: waitId("event-gate") },
    });
    expect(deferredCueExecutor.pending).toHaveLength(1);
  });

  it("moves a pending learner Wait to ready before manual advancement", async () => {
    const { deferredCueExecutor, deferredGatePort, manualClock, session } = createHarness(
      1_000,
      [cue("same-time-ready", 100)],
      createDeferredCueExecutor(),
      [beforeLearnerWait("current", 100), beforeLearnerWait("next", 300)],
    );

    session.play();
    manualClock.emitAt(1_200);
    await Promise.resolve();
    const waitingSnapshot = session.getSnapshot();
    expect(waitingSnapshot).toMatchObject({
      phase: "held",
      hold: { kind: "learner", waitId: waitId("current"), status: "waiting" },
      position: { timeMs: 100, side: "before-actions" },
      advancement: "suspended",
      outstandingLearnerWait: { waitId: waitId("current") },
    });

    session.play();
    session.pause();
    expect(session.getSnapshot()).toBe(waitingSnapshot);
    const pendingAdvance = session.advance();
    expect(pendingAdvance.isErr()).toBe(true);
    if (pendingAdvance.isOk())
      throw new Error("Expected the pending learner Wait to block advance.");
    expect(pendingAdvance.error).toEqual({
      reason: "learner-requirement-pending",
      waitId: waitId("current"),
    });
    expect(Object.isFrozen(pendingAdvance.error)).toBe(true);
    const pendingMediaStart = session.beginAdvanceMediaStart();
    expect(pendingMediaStart.isErr()).toBe(true);
    if (pendingMediaStart.isOk()) throw new Error("Expected pending media start to be refused.");
    expect(pendingMediaStart.error).toEqual(pendingAdvance.error);
    expect(session.getSnapshot()).toBe(waitingSnapshot);

    const observation = deferredGatePort.pending[0];
    if (!observation) throw new Error("Expected the learner gate observation.");
    await settleGate(observation);

    const readySnapshot = session.getSnapshot();
    expect(readySnapshot).toMatchObject({
      phase: "held",
      hold: { kind: "learner", waitId: waitId("current"), status: "ready" },
      position: { timeMs: 100, side: "before-actions" },
      advancement: "suspended",
      outstandingLearnerWait: { waitId: waitId("next") },
    });
    expect(Object.isFrozen(readySnapshot.hold)).toBe(true);
    expect(Object.isFrozen(readySnapshot.outstandingLearnerWait)).toBe(true);
    session.play();
    session.pause();
    expect(session.getSnapshot()).toBe(readySnapshot);
    expect(deferredCueExecutor.pending).toHaveLength(0);

    expectAdvanceOk(session.beginAdvanceMediaStart());
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      position: { timeMs: 100, side: "before-actions" },
      advancement: "awaiting-media-start",
    });
    expectAdvanceOk(session.advance());
    expect(session.getSnapshot()).toMatchObject({
      phase: "playing",
      position: { timeMs: 100, side: "after-actions" },
      advancement: "advancing",
    });
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-same-time-ready",
    ]);
    manualClock.emitAt(1_250);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 150 } });
  });

  it("aborts the active learner observation when Seek leaves learner waiting", async () => {
    const { deferredGatePort, manualClock, session } = createHarness(
      400,
      [],
      createDeferredCueExecutor(),
      [beforeLearnerWait("active", 100), beforeLearnerWait("later", 300)],
    );
    session.play();
    manualClock.emitAt(1_100);
    await Promise.resolve();
    const observation = deferredGatePort.pending[0];
    if (!observation) throw new Error("Expected the active learner observation.");
    const abortListener = vi.fn();
    observation.signal.addEventListener("abort", abortListener);

    expectSeekOk(seek(session, 50));

    expect(observation.signal.aborted).toBe(true);
    expect(abortListener).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toMatchObject({
      phase: "paused",
      position: { timeMs: 50 },
      outstandingLearnerWait: { waitId: waitId("active") },
    });
  });

  it.each([
    {
      operation: "Restart",
      leave: (session: PresentationPlaybackSession) => session.restart(),
      expectedSnapshot: {
        phase: "awaiting-start",
        position: { timeMs: 0 },
        runNumber: 2,
        outstandingLearnerWait: { waitId: waitId("active") },
      },
    },
    {
      operation: "Stop",
      leave: (session: PresentationPlaybackSession) => session.stop(),
      expectedSnapshot: {
        phase: "stopped",
        position: { timeMs: 100 },
        runNumber: 1,
        outstandingLearnerWait: { waitId: waitId("active") },
      },
    },
  ] as const)(
    "$operation aborts learner waiting without accepting a late resolution",
    async ({ leave, expectedSnapshot }) => {
      const { deferredGatePort, manualClock, session } = createHarness(
        400,
        [],
        createDeferredCueExecutor(),
        [beforeLearnerWait("active", 100)],
      );
      session.play();
      manualClock.emitAt(1_100);
      await Promise.resolve();
      const observation = deferredGatePort.pending[0];
      if (!observation) throw new Error("Expected the active learner observation.");
      const abortListener = vi.fn();
      observation.signal.addEventListener("abort", abortListener);

      leave(session);

      expect(observation.signal.aborted).toBe(true);
      expect(abortListener).toHaveBeenCalledTimes(1);
      expect(session.getSnapshot()).toMatchObject(expectedSnapshot);
      const snapshotAfterExit = session.getSnapshot();
      await settleGate(observation);
      expect(session.getSnapshot()).toBe(snapshotAfterExit);
    },
  );

  it("lets only the current observation release a re-encountered learner Wait", async () => {
    const { deferredGatePort, manualClock, session } = createHarness(
      400,
      [],
      createDeferredCueExecutor(),
      [beforeLearnerWait("reencountered", 100), beforeLearnerWait("later", 300)],
    );
    session.play();
    manualClock.emitAt(1_100);
    await Promise.resolve();
    const oldObservation = deferredGatePort.pending[0];
    if (!oldObservation) throw new Error("Expected the old learner observation.");

    expectSeekOk(seek(session, 50));
    session.play();
    manualClock.emitAt(1_150);
    await Promise.resolve();
    const currentObservation = deferredGatePort.pending[1];
    if (!currentObservation) throw new Error("Expected the current learner observation.");
    const currentWaitingSnapshot = session.getSnapshot();
    expect(currentWaitingSnapshot).toMatchObject({
      phase: "held",
      hold: { kind: "learner", waitId: waitId("reencountered"), status: "waiting" },
      outstandingLearnerWait: { waitId: waitId("reencountered") },
    });

    await settleGate(oldObservation);
    expect(session.getSnapshot()).toBe(currentWaitingSnapshot);

    await settleGate(currentObservation);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", waitId: waitId("reencountered"), status: "ready" },
      outstandingLearnerWait: { waitId: waitId("later") },
    });
  });

  it("ignores an old gate rejection after Restart creates a new run observation", async () => {
    vi.useFakeTimers();
    try {
      const { deferredGatePort, manualClock, session } = createHarness(
        400,
        [],
        createDeferredCueExecutor(),
        [beforeLearnerWait("repeatable", 100)],
      );
      session.play();
      manualClock.emitAt(1_100);
      await Promise.resolve();
      const oldObservation = deferredGatePort.pending[0];
      if (!oldObservation) throw new Error("Expected the old-run learner observation.");

      session.restart();
      session.play();
      manualClock.emitAt(1_200);
      await Promise.resolve();
      const currentObservation = deferredGatePort.pending[1];
      if (!currentObservation) throw new Error("Expected the current-run learner observation.");
      const currentWaitingSnapshot = session.getSnapshot();
      expect(currentWaitingSnapshot).toMatchObject({
        phase: "held",
        hold: { kind: "learner", waitId: waitId("repeatable"), status: "waiting" },
        runNumber: 2,
        outstandingLearnerWait: { waitId: waitId("repeatable") },
      });

      oldObservation.reject(new Error("Stale gate rejection."));
      await Promise.resolve();
      await Promise.resolve();
      expect(() => vi.runOnlyPendingTimers()).not.toThrow();
      expect(session.getSnapshot()).toBe(currentWaitingSnapshot);

      await settleGate(currentObservation);
      expect(session.getSnapshot()).toMatchObject({
        phase: "held",
        hold: { kind: "learner", waitId: waitId("repeatable"), status: "ready" },
        runNumber: 2,
        outstandingLearnerWait: null,
      });
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-advances inline after observing the exact state requirement", async () => {
    const requirement: CompiledLearnerRequirement = Object.freeze({
      kind: "state",
      ownerId: "owner-state-gate" as EmbeddedNodeId,
      targetId: "target-state-gate" as EmbeddedNodeId,
      key: "completed",
      equals: true,
    });
    const { deferredCueExecutor, deferredGatePort, manualClock, session } = createHarness(
      1_000,
      [cue("same-time-auto", 100)],
      createDeferredCueExecutor(),
      [beforeLearnerWait("state-gate", 100, requirement), beforeLearnerWait("later-gate", 300)],
      true,
    );

    session.play();
    manualClock.emitAt(1_200);
    await Promise.resolve();
    const observation = deferredGatePort.pending[0];
    if (!observation) throw new Error("Expected the state gate observation.");
    expect(observation.requirement).toBe(requirement);

    await settleGate(observation);

    expect(session.getSnapshot()).toMatchObject({
      phase: "playing",
      position: { timeMs: 100, side: "after-actions" },
      advancement: "advancing",
      outstandingLearnerWait: { waitId: waitId("later-gate") },
    });
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-same-time-auto",
    ]);
    expect(manualClock.activeSubscriptions).toBe(1);
    manualClock.emitAt(1_250);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 150 } });
  });

  it("auto-completes an endpoint learner Wait after clearing the outstanding fact", async () => {
    const { deferredGatePort, manualClock, session } = createHarness(
      100,
      [],
      createDeferredCueExecutor(),
      [beforeLearnerWait("endpoint-gate", 100)],
      true,
    );

    session.play();
    manualClock.emitAt(1_100);
    await Promise.resolve();
    const observation = deferredGatePort.pending[0];
    if (!observation) throw new Error("Expected the endpoint gate observation.");

    await settleGate(observation);

    expect(session.getSnapshot()).toMatchObject({
      phase: "completed",
      position: { timeMs: 100 },
      outstandingLearnerWait: null,
    });
    expect(manualClock.activeSubscriptions).toBe(0);
  });

  it("keeps a rejected learner gate observable as an actor defect", async () => {
    vi.useFakeTimers();
    try {
      const { deferredGatePort, manualClock, session } = createHarness(
        1_000,
        [],
        createDeferredCueExecutor(),
        [beforeLearnerWait("rejected-gate", 100)],
      );
      session.play();
      manualClock.emitAt(1_100);
      await Promise.resolve();
      const observation = deferredGatePort.pending[0];
      if (!observation) throw new Error("Expected the rejected gate observation.");
      const defect = new Error("Presentation gate rejected.");

      observation.reject(defect);
      await Promise.resolve();
      await Promise.resolve();

      expect(() => vi.runOnlyPendingTimers()).toThrow(defect);
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a synchronous learner gate throw observable as an actor defect", async () => {
    vi.useFakeTimers();
    try {
      const defect = new Error("Presentation gate threw.");
      const requirement: CompiledLearnerRequirement = Object.freeze({
        kind: "event",
        ownerId: "owner-throwing-gate" as EmbeddedNodeId,
        targetId: "target-throwing-gate" as EmbeddedNodeId,
        type: "activated",
      });
      const waitUntilSatisfied = vi.fn(
        (_requirement: CompiledLearnerRequirement, _options: { readonly signal: AbortSignal }) => {
          throw defect;
        },
      );
      const session = createPresentationPlaybackSession({
        timeline: Object.freeze({
          surfaceId: "surface-1",
          durationMs: 1_000,
          cues: Object.freeze([]),
          waits: Object.freeze([beforeLearnerWait("throwing-gate", 0, requirement)]),
        }),
        monotonicClock: createManualClock().clock,
        cueExecutor: createDeferredCueExecutor().executor,
        gatePort: Object.freeze({ waitUntilSatisfied }),
        autoAdvance: false,
      });

      session.play();
      await Promise.resolve();
      await Promise.resolve();

      expect(waitUntilSatisfied).toHaveBeenCalledTimes(1);
      expect(waitUntilSatisfied.mock.calls[0]?.[0]).toBe(requirement);
      expect(waitUntilSatisfied.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
      expect(() => vi.runOnlyPendingTimers()).toThrow(defect);
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds at a time-zero manual Wait until advance releases continuous playback", async () => {
    const { gateWaitUntilSatisfied, manualClock, session } = createHarness(
      1_000,
      [],
      createDeferredCueExecutor(),
      [beforeManualWait("zero", 0)],
      true,
    );

    session.play();
    await Promise.resolve();
    const heldSnapshot = session.getSnapshot();
    expect(heldSnapshot).toEqual({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("zero") },
      runNumber: 1,
      surfaceId: "surface-1",
      position: { timeMs: 0, side: "before-actions" },
      advancement: "suspended",
      durationMs: 1_000,
      outstandingLearnerWait: null,
    });
    expect(Object.isFrozen(heldSnapshot)).toBe(true);
    expect(Object.isFrozen(heldSnapshot.hold)).toBe(true);
    expect(manualClock.activeSubscriptions).toBe(0);

    session.play();
    session.pause();
    expect(session.getSnapshot()).toBe(heldSnapshot);
    expect(gateWaitUntilSatisfied).not.toHaveBeenCalled();

    expectAdvanceOk(session.advance());
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 0 } });
    expect(manualClock.activeSubscriptions).toBe(1);

    const duplicateAdvance = session.advance();
    expect(duplicateAdvance.isErr()).toBe(true);
    if (duplicateAdvance.isOk()) throw new Error("Expected duplicate advance to fail.");
    expect(duplicateAdvance.error).toEqual({ reason: "not-at-checkpoint", phase: "playing" });
    expect(Object.isFrozen(duplicateAdvance.error)).toBe(true);
  });

  it("settles an after-actions time-zero Wait and due cue on initial and restarted Play", async () => {
    const { deferredCueExecutor, session } = createHarness(
      1_000,
      [cue("zero-due", 0)],
      createDeferredCueExecutor(),
      [afterManualWait("zero-after", 0)],
    );

    session.play();
    expect(deferredCueExecutor.pending).toHaveLength(1);
    await settleCue(deferredCueExecutor.pending[0]!);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      runNumber: 1,
      position: { timeMs: 0, side: "after-actions" },
      hold: { kind: "manual", waitId: waitId("zero-after") },
    });
    session.play();
    expect(deferredCueExecutor.pending).toHaveLength(1);

    expectAdvanceOk(session.advance());
    session.restart();
    expect(session.getSnapshot()).toMatchObject({
      phase: "awaiting-start",
      runNumber: 2,
      position: { timeMs: 0, side: "before-actions" },
    });

    session.play();
    expect(deferredCueExecutor.pending).toHaveLength(2);
    await settleCue(deferredCueExecutor.pending[1]!);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      runNumber: 2,
      position: { timeMs: 0, side: "after-actions" },
      hold: { kind: "manual", waitId: waitId("zero-after") },
    });
  });

  it("keeps a time-zero consume cue pending on the before-actions side until release", async () => {
    const { deferredCueExecutor, session } = createHarness(
      1_000,
      [cue("state-zero", 0, "reconstruct-state"), cue("consume-zero", 0)],
      createDeferredCueExecutor(),
      [beforeManualWait("zero", 0)],
    );

    expectSeekOk(seek(session, 0));
    expect(session.getSnapshot()).toMatchObject({
      phase: "awaiting-start",
      position: { timeMs: 0 },
    });

    session.play();
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("zero") },
      position: { timeMs: 0, side: "before-actions" },
    });
    expect(deferredCueExecutor.pending).toHaveLength(0);

    expectAdvanceOk(session.advance());
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-state-zero",
    ]);
    await settleCue(deferredCueExecutor.pending[0]!);
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-state-zero",
      "command-consume-zero",
    ]);
  });

  it("clamps an inline manual Wait and re-anchors playback after advance", async () => {
    const { manualClock, session } = createHarness(1_000, [], createDeferredCueExecutor(), [
      beforeManualWait("inline", 100),
    ]);

    session.play();
    manualClock.emitAt(1_200);
    await Promise.resolve();

    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("inline") },
      position: { timeMs: 100 },
    });
    expect(manualClock.activeSubscriptions).toBe(0);

    expectAdvanceOk(session.advance());
    manualClock.emitAt(1_250);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 150 } });
  });

  it("holds before same-time cues and releases them explicitly at the unchanged millisecond", async () => {
    const { deferredCueExecutor, manualClock, session } = createHarness(
      1_000,
      [cue("earlier", 50), cue("same-time", 100), cue("later", 150)],
      createDeferredCueExecutor(),
      [beforeManualWait("boundary", 100)],
    );

    session.play();
    manualClock.emitAt(1_200);
    expect(session.getSnapshot()).toMatchObject({
      phase: "playing",
      position: { timeMs: 100, side: "before-actions" },
      advancement: "suspended",
    });
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-earlier",
    ]);

    await settleCue(deferredCueExecutor.pending[0]!);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      position: { timeMs: 100, side: "before-actions" },
      advancement: "suspended",
    });

    expectAdvanceOk(session.advance());
    expect(session.getSnapshot()).toMatchObject({
      phase: "playing",
      position: { timeMs: 100, side: "after-actions" },
      advancement: "advancing",
    });
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-earlier",
      "command-same-time",
    ]);
  });

  it("publishes a released before-actions position before activating its same-time cue", async () => {
    const deferredCueExecutor = createDeferredCueExecutor();
    const { manualClock, session } = createHarness(
      1_000,
      [cue("same-time", 100)],
      deferredCueExecutor,
      [beforeManualWait("boundary", 100)],
    );
    const trace: string[] = [];
    deferredCueExecutor.executor.execute = vi.fn(async () => {
      trace.push(`execute:${session.getSnapshot().position.side}`);
      return { kind: "succeeded" } as const;
    });
    session.subscribe(() => trace.push(`publish:${session.getSnapshot().position.side}`));

    session.play();
    manualClock.emitAt(1_100);
    await Promise.resolve();
    trace.length = 0;

    expectAdvanceOk(session.advance());

    expect(trace).toEqual(["publish:after-actions", "execute:after-actions"]);
  });

  it("stops at only the earliest eligible Wait during each forward passage", async () => {
    const { deferredCueExecutor, manualClock, session } = createHarness(
      1_000,
      [cue("between-waits", 150)],
      createDeferredCueExecutor(),
      [beforeManualWait("first", 100), beforeManualWait("second", 200)],
    );

    session.play();
    manualClock.emitAt(1_400);
    await Promise.resolve();

    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("first") },
      position: { timeMs: 100 },
    });
    expect(deferredCueExecutor.pending).toHaveLength(0);

    expectAdvanceOk(session.advance());
    session.pause();
    session.play();
    await Promise.resolve();
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 100 } });

    manualClock.emitAt(1_500);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 200 } });
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-between-waits",
    ]);

    const betweenWaits = deferredCueExecutor.pending[0];
    if (!betweenWaits) throw new Error("Expected the cue between Waits.");
    await settleCue(betweenWaits);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("second") },
      position: { timeMs: 200 },
    });
  });

  it("completes only after advancing a manual Wait at the duration", async () => {
    const { manualClock, session } = createHarness(100, [], createDeferredCueExecutor(), [
      beforeManualWait("endpoint", 100),
    ]);

    session.play();
    manualClock.emitAt(1_100);
    await Promise.resolve();

    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("endpoint") },
      position: { timeMs: 100 },
    });
    expectAdvanceOk(session.advance());
    expect(session.getSnapshot()).toMatchObject({ phase: "completed", position: { timeMs: 100 } });
  });

  it.each(["manual", "learner-ready"] as const)(
    "Seek leaves a fixed %s hold as paused projection",
    async (holdKind) => {
      const wait =
        holdKind === "manual" ? beforeManualWait("active", 100) : beforeLearnerWait("active", 100);
      const { deferredGatePort, manualClock, session } = createHarness(
        400,
        [],
        createDeferredCueExecutor(),
        [wait],
      );
      session.play();
      manualClock.emitAt(1_100);
      await Promise.resolve();
      if (holdKind === "learner-ready") {
        const observation = deferredGatePort.pending[0];
        if (!observation) throw new Error("Expected the learner observation.");
        await settleGate(observation);
      }
      expect(session.getSnapshot().phase).toBe("held");

      expectSeekOk(seek(session, 50));

      expect(session.getSnapshot()).toMatchObject({
        phase: "paused",
        position: { timeMs: 50 },
        outstandingLearnerWait: holdKind === "manual" ? null : { waitId: waitId("active") },
      });
    },
  );

  it("settles every due cue in compiled order before publishing a manual hold", async () => {
    const cues = [
      cue("earlier", 50),
      cue("same-first", 100),
      cue("same-second", 100),
      cue("later", 150),
    ];
    const { deferredCueExecutor, manualClock, session } = createHarness(
      1_000,
      cues,
      createDeferredCueExecutor(),
      [afterManualWait("boundary", 100)],
    );
    const reports: PresentationCueReport[] = [];
    session.subscribeCueReports((report) => reports.push(report));

    session.play();
    manualClock.emitAt(1_200);
    expect(session.getSnapshot()).toMatchObject({
      phase: "playing",
      position: { timeMs: 100, side: "after-actions" },
      advancement: "suspended",
    });
    expect(manualClock.activeSubscriptions).toBe(0);
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-earlier",
    ]);

    const earlier = deferredCueExecutor.pending[0];
    if (!earlier) throw new Error("Expected the earlier cue.");
    await settleCue(earlier, {
      kind: "control-command-error",
      error: { reason: "playback-not-allowed" },
    });
    expect(session.getSnapshot().phase).toBe("playing");

    const sameFirst = deferredCueExecutor.pending[1];
    if (!sameFirst) throw new Error("Expected the first same-time cue.");
    await settleCue(sameFirst);
    expect(session.getSnapshot().phase).toBe("playing");

    const sameSecond = deferredCueExecutor.pending[2];
    if (!sameSecond) throw new Error("Expected the second same-time cue.");
    await settleCue(sameSecond);

    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("boundary") },
      position: { timeMs: 100, side: "after-actions" },
      advancement: "suspended",
    });
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-earlier",
      "command-same-first",
      "command-same-second",
    ]);
    expect(reports.map(({ cueId }) => cueId)).toEqual(["earlier", "same-first", "same-second"]);
  });

  it.each([
    "awaiting-start",
    "playing",
    "paused",
    "completed",
    "stopped",
  ] satisfies readonly PresentationPlaybackPhase[])(
    "returns the exact %s phase when advance has no releasable checkpoint",
    (phase) => {
      const { session } = createHarnessInPhase(phase);

      const result = session.advance();

      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error("Expected advance away from a checkpoint to fail.");
      expect(result.error).toEqual({ reason: "not-at-checkpoint", phase });
      expect(Object.isFrozen(result.error)).toBe(true);
    },
  );

  it("consumes time-zero and crossed cues once in compiled order", async () => {
    const cues = [cue("zero", 0), cue("first", 100), cue("second", 100), cue("later", 150)];
    const { deferredCueExecutor, manualClock, session } = createHarness(1_000, cues);

    session.play();
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-zero",
    ]);

    manualClock.emitAt(1_200);
    expect(session.getSnapshot().position.timeMs).toBe(200);
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-zero",
    ]);

    const zero = deferredCueExecutor.pending[0];
    if (!zero) throw new Error("Expected the time-zero cue execution.");
    await settleCue(zero);
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-zero",
      "command-first",
    ]);

    const first = deferredCueExecutor.pending[1];
    if (!first) throw new Error("Expected the first equal-time cue execution.");
    await settleCue(first);
    const second = deferredCueExecutor.pending[2];
    if (!second) throw new Error("Expected the second equal-time cue execution.");
    await settleCue(second);
    const later = deferredCueExecutor.pending[3];
    if (!later) throw new Error("Expected the later cue execution.");
    await settleCue(later);

    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-zero",
      "command-first",
      "command-second",
      "command-later",
    ]);
    manualClock.emitAt(1_200);
    expect(deferredCueExecutor.pending).toHaveLength(4);
  });

  it("publishes frozen expected outcomes without replay or snapshot history", async () => {
    const cues = [cue("missing", 100), cue("refused", 100), cue("success", 100)];
    const { deferredCueExecutor, manualClock, session } = createHarness(1_000, cues);
    const reports: PresentationCueReport[] = [];
    session.subscribeCueReports((report) => reports.push(report));

    session.play();
    manualClock.emitAt(1_100);
    const missing = deferredCueExecutor.pending[0];
    if (!missing) throw new Error("Expected the missing-target cue.");
    await settleCue(missing, {
      kind: "target-not-reached",
      result: {
        kind: "missing-target",
        requestedId: "target-missing" as EmbeddedNodeId,
      },
    });

    const refused = deferredCueExecutor.pending[1];
    if (!refused) throw new Error("Expected the refused-command cue.");
    await settleCue(refused, {
      kind: "control-command-error",
      error: { reason: "playback-not-allowed" },
    });

    const lateReports: PresentationCueReport[] = [];
    session.subscribeCueReports((report) => lateReports.push(report));
    const success = deferredCueExecutor.pending[2];
    if (!success) throw new Error("Expected the successful cue.");
    await settleCue(success);

    expect(reports).toEqual([
      {
        runNumber: 1,
        surfaceId: "surface-1",
        cueId: "missing",
        scheduledAtMs: 100,
        outcome: {
          kind: "target-not-reached",
          result: { kind: "missing-target", requestedId: "target-missing" },
        },
      },
      {
        runNumber: 1,
        surfaceId: "surface-1",
        cueId: "refused",
        scheduledAtMs: 100,
        outcome: {
          kind: "control-command-error",
          error: { reason: "playback-not-allowed" },
        },
      },
      {
        runNumber: 1,
        surfaceId: "surface-1",
        cueId: "success",
        scheduledAtMs: 100,
        outcome: { kind: "succeeded" },
      },
    ]);
    expect(lateReports).toEqual([reports[2]]);
    for (const report of reports) {
      expect(Object.isFrozen(report)).toBe(true);
      expect(Object.isFrozen(report.outcome)).toBe(true);
    }
    expect(Object.keys(session.getSnapshot()).sort()).toEqual([
      "advancement",
      "durationMs",
      "outstandingLearnerWait",
      "phase",
      "position",
      "runNumber",
      "surfaceId",
    ]);
  });

  it("waits for every reached cue at the endpoint before completing", async () => {
    const { deferredCueExecutor, manualClock, session } = createHarness(100, [
      cue("before-end", 50),
      cue("at-end", 100),
    ]);

    session.play();
    manualClock.emitAt(1_100);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 100 } });
    expect(manualClock.activeSubscriptions).toBe(0);

    const beforeEnd = deferredCueExecutor.pending[0];
    if (!beforeEnd) throw new Error("Expected the pre-endpoint cue.");
    await settleCue(beforeEnd);
    expect(session.getSnapshot().phase).toBe("playing");
    const atEnd = deferredCueExecutor.pending[1];
    if (!atEnd) throw new Error("Expected the endpoint cue.");
    await settleCue(atEnd);
    expect(session.getSnapshot()).toMatchObject({ phase: "completed", position: { timeMs: 100 } });
  });

  it("resumes endpoint completion after reposition interrupts cue settlement", async () => {
    const { deferredCueExecutor, manualClock, session } = createHarness(100, [cue("at-end", 100)]);
    const reports: PresentationCueReport[] = [];
    session.subscribeCueReports((report) => reports.push(report));

    session.play();
    manualClock.emitAt(1_100);
    const atEnd = deferredCueExecutor.pending[0];
    if (!atEnd) throw new Error("Expected the endpoint cue.");
    expect(session.getSnapshot()).toMatchObject({
      phase: "playing",
      advancement: "suspended",
      position: { timeMs: 100, side: "after-actions" },
    });

    session.beginReposition("seek");
    expect(atEnd.signal.aborted).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      phase: "paused",
      advancement: "suspended",
      position: { timeMs: 100, side: "after-actions" },
    });
    expect(reports).toEqual([
      {
        runNumber: 1,
        surfaceId: "surface-1",
        cueId: "at-end",
        scheduledAtMs: 100,
        outcome: { kind: "session-interrupted", reason: "seek" },
      },
    ]);

    await settleCue(atEnd);
    session.pause();
    session.play();
    expect(session.getSnapshot()).toMatchObject({
      phase: "completed",
      position: { timeMs: 100, side: "after-actions" },
    });
    expect(deferredCueExecutor.pending).toHaveLength(1);
    expect(reports).toHaveLength(1);
  });

  it("rearms only future reconstructable cues after backward Seek", async () => {
    const { deferredCueExecutor, manualClock, session } = createHarness(500, [
      cue("zero", 0),
      cue("early", 100, "reconstruct-state"),
      cue("middle", 200),
    ]);

    expectSeekOk(seek(session, 200));
    expectSeekOk(seek(session, 50));
    expect(deferredCueExecutor.pending).toHaveLength(0);

    session.play();
    manualClock.emitAt(1_100);
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-early",
    ]);
    await settleCue(deferredCueExecutor.pending[0]!);

    manualClock.emitAt(1_250);
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-early",
    ]);
  });

  it("uses position side for exact cue consumption and same-millisecond reversal", async () => {
    const deferredCueExecutor = createDeferredCueExecutor();
    const { session } = createHarness(
      300,
      [cue("state", 100, "reconstruct-state"), cue("one-shot", 100, "consume")],
      deferredCueExecutor,
      [beforeManualWait("boundary", 100)],
    );
    const boundary = session.resolveSeekPosition(100);
    if (boundary.isErr()) throw new Error("Expected the boundary position.");

    session.seek(boundary.value);
    session.play();
    await Promise.resolve();
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      position: { timeMs: 100, side: "before-actions" },
    });
    expect(deferredCueExecutor.pending).toHaveLength(0);

    expectAdvanceOk(session.advance());
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-state",
    ]);
    await settleCue(deferredCueExecutor.pending[0]!);
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-state",
      "command-one-shot",
    ]);
    await settleCue(deferredCueExecutor.pending[1]!);
    session.pause();

    session.seek(boundary.value);
    session.play();
    await Promise.resolve();
    expectAdvanceOk(session.advance());
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-state",
      "command-one-shot",
      "command-state",
    ]);
  });

  it("consumes exact after-actions cues without firing them and keeps the Wait eligible", async () => {
    const deferredCueExecutor = createDeferredCueExecutor();
    const { session } = createHarness(
      300,
      [cue("state", 100, "reconstruct-state"), cue("one-shot", 100, "consume")],
      deferredCueExecutor,
      [afterManualWait("boundary", 100)],
    );

    expectSeekOk(seek(session, 100));
    expect(session.getSnapshot()).toMatchObject({
      phase: "paused",
      position: { timeMs: 100, side: "after-actions" },
    });
    session.play();
    await Promise.resolve();
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("boundary") },
    });
    expect(deferredCueExecutor.pending).toHaveLength(0);
  });

  it("bypasses Wait playback on forward Seek without satisfying learner requirements", async () => {
    const skippedRequirement: CompiledLearnerRequirement = Object.freeze({
      kind: "event",
      ownerId: "owner-skipped" as EmbeddedNodeId,
      targetId: "target-skipped" as EmbeddedNodeId,
      type: "skipped-event",
    });
    const reachedRequirement: CompiledLearnerRequirement = Object.freeze({
      kind: "event",
      ownerId: "owner-reached" as EmbeddedNodeId,
      targetId: "target-reached" as EmbeddedNodeId,
      type: "reached-event",
    });
    const { deferredCueExecutor, deferredGatePort, manualClock, session } = createHarness(
      400,
      [cue("crossed", 50)],
      createDeferredCueExecutor(),
      [
        beforeLearnerWait("skipped-learner", 100, skippedRequirement),
        beforeManualWait("skipped-manual", 200),
        beforeLearnerWait("reached-learner", 300, reachedRequirement),
      ],
    );

    expectSeekOk(seek(session, 250));
    expect(session.getSnapshot()).toMatchObject({
      phase: "paused",
      position: { timeMs: 250 },
      outstandingLearnerWait: { waitId: waitId("skipped-learner") },
    });
    expect(deferredCueExecutor.pending).toHaveLength(0);
    expect(deferredGatePort.pending).toHaveLength(0);

    session.play();
    manualClock.emitAt(1_050);
    await Promise.resolve();
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", waitId: waitId("reached-learner"), status: "waiting" },
      position: { timeMs: 300 },
      outstandingLearnerWait: { waitId: waitId("skipped-learner") },
    });
    expect(deferredGatePort.pending[0]?.requirement).toBe(reachedRequirement);

    const reachedObservation = deferredGatePort.pending[0];
    if (!reachedObservation) throw new Error("Expected the reached learner observation.");
    await settleGate(reachedObservation);
    expect(session.getSnapshot().outstandingLearnerWait).toEqual({
      waitId: waitId("skipped-learner"),
      position: { timeMs: 100, side: "before-actions" },
    });
  });

  it.each([
    {
      requirementKind: "event",
      requirement: Object.freeze({
        kind: "event",
        ownerId: "owner-rearmed-event" as EmbeddedNodeId,
        targetId: "target-rearmed-event" as EmbeddedNodeId,
        type: "completed",
      }) satisfies CompiledLearnerRequirement,
    },
    {
      requirementKind: "state",
      requirement: Object.freeze({
        kind: "state",
        ownerId: "owner-rearmed-state" as EmbeddedNodeId,
        targetId: "target-rearmed-state" as EmbeddedNodeId,
        key: "complete",
        equals: true,
      }) satisfies CompiledLearnerRequirement,
    },
  ])(
    "rearms a released $requirementKind learner Wait after seeking backward before it",
    async ({ requirement }) => {
      const { deferredCueExecutor, deferredGatePort, manualClock, session } = createHarness(
        400,
        [cue("once", 75)],
        createDeferredCueExecutor(),
        [beforeLearnerWait("rearmed", 100, requirement), beforeLearnerWait("later", 300)],
        true,
      );

      session.play();
      manualClock.emitAt(1_100);
      const firstExecution = deferredCueExecutor.pending[0];
      if (!firstExecution) throw new Error("Expected the once-per-run cue.");
      await settleCue(firstExecution);
      const firstObservation = deferredGatePort.pending[0];
      if (!firstObservation) throw new Error("Expected the first learner observation.");
      await settleGate(firstObservation);
      expect(session.getSnapshot()).toMatchObject({
        phase: "playing",
        outstandingLearnerWait: { waitId: waitId("later") },
      });

      session.pause();
      session.play();
      await Promise.resolve();
      expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 100 } });
      expect(deferredGatePort.pending).toHaveLength(1);
      session.pause();

      expectSeekOk(seek(session, 50));
      expect(session.getSnapshot()).toMatchObject({
        phase: "paused",
        position: { timeMs: 50 },
        outstandingLearnerWait: { waitId: waitId("rearmed") },
      });

      session.play();
      manualClock.emitAt(1_150);
      await Promise.resolve();
      expect(session.getSnapshot()).toMatchObject({
        phase: "held",
        hold: { kind: "learner", waitId: waitId("rearmed"), status: "waiting" },
        position: { timeMs: 100 },
        outstandingLearnerWait: { waitId: waitId("rearmed") },
      });
      expect(deferredCueExecutor.pending).toHaveLength(1);
      expect(deferredGatePort.pending).toHaveLength(2);
      expect(deferredGatePort.pending[1]?.requirement).toBe(requirement);
    },
  );

  it("keeps an exact endpoint Wait eligible for Play after Seek", async () => {
    const { manualClock, session } = createHarness(100, [], createDeferredCueExecutor(), [
      beforeManualWait("endpoint", 100),
    ]);

    expectSeekOk(seek(session, 100));
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", position: { timeMs: 100 } });
    expect(manualClock.activeSubscriptions).toBe(0);

    session.play();
    await Promise.resolve();
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("endpoint") },
      position: { timeMs: 100 },
    });
  });

  it("leaves an active Wait unchanged after an out-of-range Seek", async () => {
    const { manualClock, session } = createHarness(200, [], createDeferredCueExecutor(), [
      beforeManualWait("active", 100),
    ]);
    session.play();
    manualClock.emitAt(1_100);
    await Promise.resolve();
    const heldSnapshot = session.getSnapshot();

    const result = seek(session, 201);
    expect(result.isErr()).toBe(true);
    if (result.isOk()) throw new Error("Expected an out-of-range Seek to fail.");
    expect(result.error).toEqual({
      reason: "seek-out-of-range",
      requestedTimeMs: 201,
      durationMs: 200,
    });
    expect(session.getSnapshot()).toBe(heldSnapshot);
  });

  it("keeps rejected Cue Executor work at a Wait boundary observable as an actor defect", async () => {
    vi.useFakeTimers();
    try {
      const { deferredCueExecutor, gateWaitUntilSatisfied, session } = createHarness(
        1_000,
        [cue("rejected", 0)],
        createDeferredCueExecutor(),
        [afterManualWait("blocked", 0)],
      );
      const reportListener = vi.fn();
      session.subscribeCueReports(reportListener);
      session.play();
      const execution = deferredCueExecutor.pending[0];
      if (!execution) throw new Error("Expected rejected cue work.");
      const defect = new Error("Cue Executor rejected.");
      expect(session.getSnapshot()).toMatchObject({
        phase: "playing",
        position: { timeMs: 0 },
        outstandingLearnerWait: null,
      });
      expect(gateWaitUntilSatisfied).not.toHaveBeenCalled();

      execution.reject(defect);
      await Promise.resolve();
      await Promise.resolve();

      expect(reportListener).not.toHaveBeenCalled();
      expect(gateWaitUntilSatisfied).not.toHaveBeenCalled();
      expect(() => vi.runOnlyPendingTimers()).toThrow(defect);
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a synchronous Cue Executor throw at a Wait boundary observable", async () => {
    vi.useFakeTimers();
    try {
      const defect = new Error("Cue Executor threw.");
      const execute = vi.fn(
        (
          _input: Parameters<PresentationCueExecutor["execute"]>[0],
        ): Promise<PresentationCueExecutionOutcome> => {
          throw defect;
        },
      );
      const gate = createDeferredGatePort();
      const session = createPresentationPlaybackSession({
        timeline: Object.freeze({
          surfaceId: "surface-1",
          durationMs: 1_000,
          cues: Object.freeze([cue("throwing", 0)]),
          waits: Object.freeze([afterManualWait("blocked", 0)]),
        }),
        monotonicClock: createManualClock().clock,
        cueExecutor: Object.freeze({ execute }),
        gatePort: gate.gatePort,
        autoAdvance: false,
      });

      session.play();
      await Promise.resolve();
      await Promise.resolve();

      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
      expect(gate.waitUntilSatisfied).not.toHaveBeenCalled();
      expect(() => vi.runOnlyPendingTimers()).toThrow(defect);
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("interrupts old-run work on Restart and replays every cue in the new run", async () => {
    const { deferredCueExecutor, manualClock, session } = createHarness(500, [
      cue("first", 100),
      cue("second", 200),
    ]);
    const reports: PresentationCueReport[] = [];
    session.subscribeCueReports((report) => reports.push(report));

    session.play();
    manualClock.emitAt(1_250);
    const oldFirst = deferredCueExecutor.pending[0];
    if (!oldFirst) throw new Error("Expected old-run cue work.");

    session.restart();
    expect(oldFirst.signal.aborted).toBe(true);
    expect(session.getSnapshot()).toMatchObject({
      phase: "awaiting-start",
      position: { timeMs: 0, side: "before-actions" },
      advancement: "suspended",
      runNumber: 2,
    });
    expect(reports.map(({ cueId, outcome }) => [cueId, outcome])).toEqual([
      ["first", { kind: "session-interrupted", reason: "restart" }],
      ["second", { kind: "session-interrupted", reason: "restart" }],
    ]);

    session.play();
    manualClock.emitAt(1_500);
    expect(deferredCueExecutor.pending[1]?.command.type).toBe("command-first");
    const newFirst = deferredCueExecutor.pending[1];
    if (!newFirst) throw new Error("Expected first cue in the restarted run.");
    await settleCue(oldFirst);
    expect(reports).toHaveLength(2);
    expect(deferredCueExecutor.pending).toHaveLength(2);
    await settleCue(newFirst);
    expect(deferredCueExecutor.pending[2]?.command.type).toBe("command-second");
    const newSecond = deferredCueExecutor.pending[2];
    if (!newSecond) throw new Error("Expected second cue in the restarted run.");
    await settleCue(newSecond);
    expect(
      reports.slice(2).map(({ runNumber, cueId, outcome }) => ({
        runNumber,
        cueId,
        outcome,
      })),
    ).toEqual([
      { runNumber: 2, cueId: "first", outcome: { kind: "succeeded" } },
      { runNumber: 2, cueId: "second", outcome: { kind: "succeeded" } },
    ]);
  });

  it("resets Wait passage and learner projection when Restart begins a new run", async () => {
    const { deferredCueExecutor, deferredGatePort, manualClock, session } = createHarness(
      300,
      [cue("repeatable", 50)],
      createDeferredCueExecutor(),
      [beforeLearnerWait("learner", 100), beforeManualWait("manual", 200)],
      true,
    );

    session.play();
    manualClock.emitAt(1_100);
    const firstCue = deferredCueExecutor.pending[0];
    if (!firstCue) throw new Error("Expected the first-run cue.");
    await settleCue(firstCue);
    const firstObservation = deferredGatePort.pending[0];
    if (!firstObservation) throw new Error("Expected the first-run learner observation.");
    await settleGate(firstObservation);
    manualClock.emitAt(1_200);
    await Promise.resolve();
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("manual") },
      outstandingLearnerWait: null,
    });
    expectAdvanceOk(session.advance());

    session.restart();
    expect(session.getSnapshot()).toMatchObject({
      phase: "awaiting-start",
      position: { timeMs: 0 },
      runNumber: 2,
      outstandingLearnerWait: { waitId: waitId("learner") },
    });

    session.play();
    manualClock.emitAt(1_300);
    const secondCue = deferredCueExecutor.pending[1];
    if (!secondCue) throw new Error("Expected the second-run cue.");
    await settleCue(secondCue);
    const secondObservation = deferredGatePort.pending[1];
    if (!secondObservation) throw new Error("Expected the second-run learner observation.");
    await settleGate(secondObservation);
    manualClock.emitAt(1_400);
    await Promise.resolve();
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("manual") },
      position: { timeMs: 200 },
      runNumber: 2,
    });
    expect(deferredCueExecutor.pending).toHaveLength(2);
    expect(deferredGatePort.pending).toHaveLength(2);
  });

  it.each([
    {
      operation: "Seek",
      reason: "seek",
      interrupt: (session: PresentationPlaybackSession) => seek(session, 50),
    },
    {
      operation: "Stop",
      reason: "stop",
      interrupt: (session: PresentationPlaybackSession) => session.stop(),
    },
  ] as const)(
    "$operation aborts active work, reports every unsettled cue, and ignores late settlement",
    async ({ reason, interrupt }) => {
      const { deferredCueExecutor, manualClock, session } = createHarness(500, [
        cue("first", 100),
        cue("second", 200),
      ]);
      const reports: PresentationCueReport[] = [];
      session.subscribeCueReports((report) => reports.push(report));
      session.play();
      manualClock.emitAt(1_250);
      const active = deferredCueExecutor.pending[0];
      if (!active) throw new Error("Expected active cue work.");

      interrupt(session);
      expect(active.signal.aborted).toBe(true);
      expect(reports.map(({ cueId, outcome }) => [cueId, outcome])).toEqual([
        ["first", { kind: "session-interrupted", reason }],
        ["second", { kind: "session-interrupted", reason }],
      ]);

      await settleCue(active);
      expect(reports).toHaveLength(2);
      expect(deferredCueExecutor.pending).toHaveLength(1);
    },
  );

  it.each([
    {
      operation: "Seek",
      reason: "seek",
      leave: (session: PresentationPlaybackSession) => expectSeekOk(seek(session, 50)),
      expectedSnapshot: {
        phase: "paused",
        position: { timeMs: 50 },
        runNumber: 1,
        outstandingLearnerWait: { waitId: waitId("abandoned") },
      },
    },
    {
      operation: "Restart",
      reason: "restart",
      leave: (session: PresentationPlaybackSession) => session.restart(),
      expectedSnapshot: {
        phase: "awaiting-start",
        position: { timeMs: 0, side: "before-actions" },
        advancement: "suspended",
        runNumber: 2,
        outstandingLearnerWait: { waitId: waitId("abandoned") },
      },
    },
    {
      operation: "Stop",
      reason: "stop",
      leave: (session: PresentationPlaybackSession) => session.stop(),
      expectedSnapshot: {
        phase: "stopped",
        position: { timeMs: 100 },
        runNumber: 1,
        outstandingLearnerWait: { waitId: waitId("abandoned") },
      },
    },
  ] as const)(
    "$operation interrupts cue settling before a Wait without activating it",
    async ({ reason, leave, expectedSnapshot }) => {
      const { deferredCueExecutor, deferredGatePort, manualClock, session } = createHarness(
        400,
        [cue("before", 50), cue("at-wait", 100), cue("later", 150)],
        createDeferredCueExecutor(),
        [beforeLearnerWait("abandoned", 100)],
      );
      const reports: PresentationCueReport[] = [];
      session.subscribeCueReports((report) => reports.push(report));
      session.play();
      manualClock.emitAt(1_200);
      const activeCue = deferredCueExecutor.pending[0];
      if (!activeCue) throw new Error("Expected active cue work before the Wait.");
      expect(deferredGatePort.pending).toHaveLength(0);

      leave(session);

      expect(activeCue.signal.aborted).toBe(true);
      expect(reports).toEqual([
        {
          runNumber: 1,
          surfaceId: "surface-1",
          cueId: "before",
          scheduledAtMs: 50,
          outcome: { kind: "session-interrupted", reason },
        },
      ]);
      expect(session.getSnapshot()).toMatchObject(expectedSnapshot);
      expect(deferredGatePort.pending).toHaveLength(0);
      expect(deferredCueExecutor.pending).toHaveLength(1);
      const snapshotAfterExit = session.getSnapshot();

      await settleCue(activeCue);
      expect(reports).toHaveLength(1);
      expect(deferredGatePort.pending).toHaveLength(0);
      expect(deferredCueExecutor.pending).toHaveLength(1);
      expect(session.getSnapshot()).toBe(snapshotAfterExit);
    },
  );

  it("ignores an abandoned cue settlement after Seek activates a new Wait passage", async () => {
    const { deferredCueExecutor, deferredGatePort, manualClock, session } = createHarness(
      400,
      [cue("old-passage", 50)],
      createDeferredCueExecutor(),
      [beforeLearnerWait("repeatable", 100)],
    );
    const reports: PresentationCueReport[] = [];
    session.subscribeCueReports((report) => reports.push(report));
    session.play();
    manualClock.emitAt(1_100);
    const oldCue = deferredCueExecutor.pending[0];
    if (!oldCue) throw new Error("Expected the abandoned cue execution.");

    expectSeekOk(seek(session, 50));
    session.play();
    manualClock.emitAt(1_150);
    await Promise.resolve();
    const currentObservation = deferredGatePort.pending[0];
    if (!currentObservation) throw new Error("Expected the new-passage learner observation.");
    const currentWaitingSnapshot = session.getSnapshot();
    expect(currentWaitingSnapshot).toMatchObject({
      phase: "held",
      hold: { kind: "learner", waitId: waitId("repeatable"), status: "waiting" },
      outstandingLearnerWait: { waitId: waitId("repeatable") },
    });
    expect(reports).toEqual([
      {
        runNumber: 1,
        surfaceId: "surface-1",
        cueId: "old-passage",
        scheduledAtMs: 50,
        outcome: { kind: "session-interrupted", reason: "seek" },
      },
    ]);

    await settleCue(oldCue);
    expect(session.getSnapshot()).toBe(currentWaitingSnapshot);
    expect(reports).toHaveLength(1);

    await settleGate(currentObservation);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", waitId: waitId("repeatable"), status: "ready" },
      outstandingLearnerWait: null,
    });
  });

  it("Pause stops only the clock while cue work continues to drain", async () => {
    const { deferredCueExecutor, manualClock, session } = createHarness(500, [
      cue("first", 100),
      cue("second", 200),
    ]);
    const reports: PresentationCueReport[] = [];
    session.subscribeCueReports((report) => reports.push(report));
    session.play();
    manualClock.emitAt(1_250);
    session.pause();
    expect(manualClock.activeSubscriptions).toBe(0);

    const first = deferredCueExecutor.pending[0];
    if (!first) throw new Error("Expected the active cue.");
    await settleCue(first);
    const second = deferredCueExecutor.pending[1];
    if (!second) throw new Error("Expected the queued cue.");
    await settleCue(second);

    expect(session.getSnapshot()).toMatchObject({ phase: "paused", position: { timeMs: 250 } });
    expect(reports.map(({ cueId }) => cueId)).toEqual(["first", "second"]);
  });

  it("Dispose aborts cue work and closes both streams without a disposal report", async () => {
    const { deferredCueExecutor, deferredGatePort, manualClock, session } = createHarness(
      500,
      [cue("first", 50), cue("second", 100)],
      createDeferredCueExecutor(),
      [beforeLearnerWait("abandoned", 100)],
    );
    const snapshotListener = vi.fn();
    const reportListener = vi.fn();
    session.subscribe(snapshotListener);
    session.subscribeCueReports(reportListener);
    session.play();
    manualClock.emitAt(1_200);
    const active = deferredCueExecutor.pending[0];
    if (!active) throw new Error("Expected active cue work.");
    expect(deferredGatePort.pending).toHaveLength(0);
    snapshotListener.mockClear();

    session.dispose();
    expect(active.signal.aborted).toBe(true);
    expect(manualClock.activeSubscriptions).toBe(0);
    expect(reportListener).not.toHaveBeenCalled();

    await settleCue(active);
    manualClock.emitAt(2_000);
    expect(snapshotListener).not.toHaveBeenCalled();
    expect(reportListener).not.toHaveBeenCalled();
    expect(deferredGatePort.pending).toHaveLength(0);
  });

  it.each(["resolve", "reject"] as const)(
    "Dispose aborts learner waiting and ignores a late gate %s",
    async (settlement) => {
      vi.useFakeTimers();
      try {
        const { deferredGatePort, manualClock, session } = createHarness(
          400,
          [],
          createDeferredCueExecutor(),
          [beforeLearnerWait("disposed", 100)],
        );
        const snapshotListener = vi.fn();
        const reportListener = vi.fn();
        const unsubscribeSnapshot = session.subscribe(snapshotListener);
        const unsubscribeReports = session.subscribeCueReports(reportListener);
        session.play();
        manualClock.emitAt(1_100);
        await Promise.resolve();
        const observation = deferredGatePort.pending[0];
        if (!observation) throw new Error("Expected the disposed learner observation.");
        const abortListener = vi.fn();
        observation.signal.addEventListener("abort", abortListener);
        snapshotListener.mockClear();

        session.dispose();
        session.dispose();

        expect(observation.signal.aborted).toBe(true);
        expect(abortListener).toHaveBeenCalledTimes(1);
        if (settlement === "resolve") observation.resolve();
        else observation.reject(new Error("Late disposed gate rejection."));
        await Promise.resolve();
        await Promise.resolve();
        expect(() => vi.runOnlyPendingTimers()).not.toThrow();
        expect(snapshotListener).not.toHaveBeenCalled();
        expect(reportListener).not.toHaveBeenCalled();
        unsubscribeSnapshot();
        unsubscribeSnapshot();
        unsubscribeReports();
        unsubscribeReports();
        expectDisposedSessionDefects(session);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("starts with one frozen Scaffold snapshot and no XState surface", () => {
    const { session } = createHarness();
    const snapshot = session.getSnapshot();

    expect(snapshot).toEqual({
      phase: "awaiting-start",
      runNumber: 1,
      surfaceId: "surface-1",
      position: { timeMs: 0, side: "before-actions" },
      advancement: "suspended",
      durationMs: 1_000,
      outstandingLearnerWait: null,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(session.getSnapshot()).toBe(snapshot);
    expect(Object.keys(snapshot).sort()).toEqual([
      "advancement",
      "durationMs",
      "outstandingLearnerWait",
      "phase",
      "position",
      "runNumber",
      "surfaceId",
    ]);
    expect(Object.keys(session).sort()).toEqual([
      "advance",
      "beginAdvanceMediaStart",
      "beginMediaStart",
      "beginReposition",
      "cancelMediaStart",
      "dispose",
      "getSnapshot",
      "pause",
      "play",
      "resolveSeekPosition",
      "restart",
      "seek",
      "stop",
      "subscribe",
      "subscribeCueReports",
      "useInternalClock",
      "useNarrationClock",
    ]);
  });

  it("publishes the real media-start lifecycle without changing phase or position", () => {
    const { session } = createHarness();
    const listener = vi.fn();
    session.subscribe(listener);
    const initial = session.getSnapshot();

    session.beginMediaStart();
    const awaiting = session.getSnapshot();
    expect(awaiting).toMatchObject({
      phase: "awaiting-start",
      position: { timeMs: 0, side: "before-actions" },
      advancement: "awaiting-media-start",
    });
    expect(awaiting).not.toBe(initial);
    expect(listener).toHaveBeenCalledTimes(1);

    session.beginMediaStart();
    expect(session.getSnapshot()).toBe(awaiting);
    expect(listener).toHaveBeenCalledTimes(1);

    session.cancelMediaStart();
    expect(session.getSnapshot()).toMatchObject({ advancement: "suspended" });
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("caches snapshots and notifies subscribers only when public state changes", () => {
    const { manualClock, session } = createHarness();
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    const initialSnapshot = session.getSnapshot();

    session.pause();
    expect(listener).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toBe(initialSnapshot);

    session.play();
    const playingSnapshot = session.getSnapshot();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(playingSnapshot.phase).toBe("playing");

    session.play();
    manualClock.emitAt(1_000);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot()).toBe(playingSnapshot);

    manualClock.emitAt(1_050);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(session.getSnapshot()).not.toBe(playingSnapshot);

    unsubscribe();
    unsubscribe();
    manualClock.emitAt(1_100);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("anchors Play, pauses at the last confirmed sample, and resumes without paused wall time", () => {
    const { manualClock, session } = createHarness();

    session.play();
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 0 } });
    expect(manualClock.activeSubscriptions).toBe(1);

    manualClock.emitAt(1_125.9);
    expect(session.getSnapshot().position.timeMs).toBe(125);

    session.play();
    expect(manualClock.subscriptionsStarted).toBe(1);
    manualClock.setNowMs(1_300);
    session.pause();
    const pausedSnapshot = session.getSnapshot();
    expect(pausedSnapshot).toMatchObject({ phase: "paused", position: { timeMs: 125 } });
    expect(manualClock.activeSubscriptions).toBe(0);

    session.pause();
    expect(session.getSnapshot()).toBe(pausedSnapshot);

    manualClock.setNowMs(2_000);
    session.play();
    manualClock.emitAt(2_075.8);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 200 } });
    expect(manualClock.subscriptionsStarted).toBe(2);
    expect(manualClock.maximumActiveSubscriptions).toBe(1);
  });

  it("uses confirmed narration time and freezes through buffering and pending Seek", () => {
    const { manualClock, session } = createHarness();
    const narration = createNarrationClock(100);

    session.play();
    manualClock.emitAt(1_100);
    expect(session.getSnapshot().position.timeMs).toBe(100);

    session.useNarrationClock(narration.source);
    expect(manualClock.activeSubscriptions).toBe(1);
    expect(narration.activeSubscriptions).toBe(0);

    narration.setLiveTimeMs(175);
    manualClock.emitAt(1_101);
    expect(session.getSnapshot().position.timeMs).toBe(175);
    narration.publish("buffering", 300);
    manualClock.emitAt(1_102);
    narration.publish("seeking", 600);
    manualClock.emitAt(1_103);
    expect(session.getSnapshot().position.timeMs).toBe(175);

    session.pause();
    narration.publish("playing", 600);
    expectSeekOk(seek(session, 600));
    session.play();
    narration.publish("playing", 650);
    manualClock.emitAt(1_104);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 650 } });
    expect(narration.maximumActiveSubscriptions).toBe(0);
  });

  it("freezes a failed narration clock until explicit internal-clock continuation", () => {
    const { manualClock, session } = createHarness();
    const narration = createNarrationClock(100);

    session.play();
    manualClock.emitAt(1_100);
    session.useNarrationClock(narration.source);
    narration.setLiveTimeMs(150);
    manualClock.emitAt(1_101);
    narration.publish("failed", 900);
    manualClock.emitAt(1_102);
    expect(session.getSnapshot().position.timeMs).toBe(150);

    manualClock.emitAt(3_000);
    expect(session.getSnapshot().position.timeMs).toBe(150);

    session.useInternalClock();
    expect(narration.activeSubscriptions).toBe(0);
    expect(manualClock.activeSubscriptions).toBe(1);
    expect(session.getSnapshot().position.timeMs).toBe(150);
    manualClock.emitAt(3_050);
    expect(session.getSnapshot().position.timeMs).toBe(200);
  });

  it("rejects a narration clock owned by another Surface as an invariant defect", () => {
    const { session } = createHarness();
    const narration = createNarrationClock(0, "surface-2" as EmbeddedNodeId);

    expect(() => session.useNarrationClock(narration.source)).toThrowError(/different Surface/i);
    expect(session.getSnapshot()).toMatchObject({
      surfaceId: "surface-1",
      position: { timeMs: 0 },
    });
  });

  it("does not duplicate cue crossings when the active clock is replaced", async () => {
    const deferredCueExecutor = createDeferredCueExecutor();
    const { manualClock, session } = createHarness(1_000, [cue("once", 125)], deferredCueExecutor);
    const narration = createNarrationClock(100);

    session.play();
    manualClock.emitAt(1_100);
    session.useNarrationClock(narration.source);
    narration.setLiveTimeMs(150);
    manualClock.emitAt(1_101);
    expect(deferredCueExecutor.pending).toHaveLength(1);

    session.useInternalClock();
    narration.publish("playing", 500);
    manualClock.emitAt(1_200);
    expect(deferredCueExecutor.pending).toHaveLength(1);
    expect(manualClock.maximumActiveSubscriptions).toBe(1);
    expect(narration.maximumActiveSubscriptions).toBe(0);

    const execution = deferredCueExecutor.pending[0];
    if (!execution) throw new Error("Expected one cue execution.");
    await settleCue(execution);
  });

  it("rejects non-finite Play, Resume, and playing Seek anchors as defects", () => {
    const initialPlay = createHarness();
    initialPlay.manualClock.setNowMs(Number.NaN);
    expect(() => initialPlay.session.play()).toThrowError(/finite/i);

    const resume = createHarness();
    resume.session.play();
    resume.manualClock.emitAt(1_100);
    resume.session.pause();
    resume.manualClock.setNowMs(Number.POSITIVE_INFINITY);
    expect(() => resume.session.play()).toThrowError(/finite/i);

    const playingSeek = createHarness();
    playingSeek.session.play();
    playingSeek.manualClock.setNowMs(Number.NEGATIVE_INFINITY);
    expect(() => seek(playingSeek.session, 200)).toThrowError(/finite/i);
  });

  it("rejects a clock projection behind the last confirmed playhead", () => {
    const { manualClock, session } = createHarness();
    session.play();
    manualClock.emitAt(1_200);
    const confirmedSnapshot = session.getSnapshot();
    expect(confirmedSnapshot.position.timeMs).toBe(200);

    expect(() => manualClock.emitAt(1_100)).toThrowError(/behind.*confirmed/i);
    expect(session.getSnapshot()).toBe(confirmedSnapshot);
  });

  it("clamps natural progression at the duration and stops clock work", () => {
    const { manualClock, session } = createHarness(300);

    session.play();
    manualClock.emitAt(1_299);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 299 } });

    manualClock.emitAt(1_350);
    const completedSnapshot = session.getSnapshot();
    expect(completedSnapshot).toMatchObject({ phase: "completed", position: { timeMs: 300 } });
    expect(manualClock.activeSubscriptions).toBe(0);
    expect(manualClock.maximumActiveSubscriptions).toBe(1);

    manualClock.emitAt(2_000);
    expect(session.getSnapshot()).toBe(completedSnapshot);
  });

  it("seeks absolutely in awaiting, playing, paused, and completed phases", () => {
    const { manualClock, session } = createHarness();
    const initialSnapshot = session.getSnapshot();

    expectSeekOk(seek(session, 0));
    expect(session.getSnapshot()).not.toBe(initialSnapshot);
    expect(session.getSnapshot()).toMatchObject({
      phase: "awaiting-start",
      position: { timeMs: 0, side: "after-actions" },
    });

    expectSeekOk(seek(session, 250));
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", position: { timeMs: 250 } });

    session.play();
    manualClock.emitAt(1_100);
    expect(session.getSnapshot().position.timeMs).toBe(350);

    manualClock.setNowMs(1_250);
    expectSeekOk(seek(session, 400));
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", position: { timeMs: 400 } });
    expect(manualClock.activeSubscriptions).toBe(1);
    expect(manualClock.subscriptionsStarted).toBe(2);

    manualClock.emitAt(1_300);
    expect(session.getSnapshot().position.timeMs).toBe(450);
    session.pause();

    expectSeekOk(seek(session, 200));
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", position: { timeMs: 200 } });

    expectSeekOk(seek(session, 1_000));
    expect(session.getSnapshot()).toMatchObject({
      phase: "completed",
      position: { timeMs: 1_000 },
    });

    expectSeekOk(seek(session, 600));
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", position: { timeMs: 600 } });

    expectSeekOk(seek(session, 1_000));
    expect(session.getSnapshot()).toMatchObject({
      phase: "completed",
      position: { timeMs: 1_000 },
    });
  });

  it("returns frozen range diagnostics without changing playback or active clock work", () => {
    const { manualClock, session } = createHarness();
    session.play();
    manualClock.emitAt(1_100);
    const beforeRejection = session.getSnapshot();
    const subscriptionsBeforeRejection = manualClock.subscriptionsStarted;

    for (const requestedTimeMs of [-1, 1_001]) {
      const result = seek(session, requestedTimeMs);
      expect(result.isErr()).toBe(true);
      if (result.isOk()) throw new Error("Expected out-of-range Seek to fail.");
      expect(result.error).toEqual({
        reason: "seek-out-of-range",
        requestedTimeMs,
        durationMs: 1_000,
      });
      expect(Object.isFrozen(result.error)).toBe(true);
    }

    expect(session.getSnapshot()).toBe(beforeRejection);
    expect(manualClock.activeSubscriptions).toBe(1);
    expect(manualClock.subscriptionsStarted).toBe(subscriptionsBeforeRejection);
  });

  it("stops idempotently at the last confirmed time and requires Restart before reuse", () => {
    const { manualClock, session } = createHarness();
    session.play();
    manualClock.emitAt(1_240);
    manualClock.setNowMs(1_500);

    session.stop();
    const stoppedSnapshot = session.getSnapshot();
    expect(stoppedSnapshot).toMatchObject({
      phase: "stopped",
      position: { timeMs: 240 },
      runNumber: 1,
    });
    expect(manualClock.activeSubscriptions).toBe(0);

    session.stop();
    expect(session.getSnapshot()).toBe(stoppedSnapshot);
    expect(() => session.play()).toThrowError(/stopped/i);
    expect(() => session.pause()).toThrowError(/stopped/i);
    expect(() => seek(session, 100)).toThrowError(/stopped/i);
    expect(session.getSnapshot()).toBe(stoppedSnapshot);

    session.restart();
    expect(session.getSnapshot()).toEqual({
      phase: "awaiting-start",
      runNumber: 2,
      surfaceId: "surface-1",
      position: { timeMs: 0, side: "before-actions" },
      advancement: "suspended",
      durationMs: 1_000,
      outstandingLearnerWait: null,
    });
  });

  it.each([
    "awaiting-start",
    "playing",
    "paused",
    "completed",
    "stopped",
  ] satisfies readonly PresentationPlaybackPhase[])(
    "restarts from %s as a new awaiting run",
    (phase) => {
      const { manualClock, session } = createHarnessInPhase(phase);

      session.restart();

      expect(session.getSnapshot()).toEqual({
        phase: "awaiting-start",
        runNumber: 2,
        surfaceId: "surface-1",
        position: { timeMs: 0, side: "before-actions" },
        advancement: "suspended",
        durationMs: 1_000,
        outstandingLearnerWait: null,
      });
      expect(Object.isFrozen(session.getSnapshot())).toBe(true);
      expect(manualClock.activeSubscriptions).toBe(0);
    },
  );

  it.each([
    "awaiting-start",
    "playing",
    "paused",
    "completed",
    "stopped",
  ] satisfies readonly PresentationPlaybackPhase[])(
    "disposes terminally and idempotently from %s",
    (phase) => {
      const { manualClock, session } = createHarnessInPhase(phase);
      const listener = vi.fn();
      const unsubscribe = session.subscribe(listener);

      session.dispose();
      session.dispose();
      expect(manualClock.activeSubscriptions).toBe(0);

      manualClock.emitAt(3_000);
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
      unsubscribe();
      expectDisposedSessionDefects(session);
    },
  );
});

describe("createAnimationFramePresentationMonotonicClock", () => {
  it("cancels active frame work idempotently and ignores a stale callback", () => {
    let nextFrameId = 1;
    const callbacks = new Map<number, FrameRequestCallback>();
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId;
      nextFrameId += 1;
      callbacks.set(frameId, callback);
      return frameId;
    });
    const cancelAnimationFrame = vi.fn((frameId: number) => {
      callbacks.delete(frameId);
    });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    try {
      const clock = createAnimationFramePresentationMonotonicClock();
      const listener = vi.fn();
      const unsubscribe = clock.subscribe(listener);
      expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

      const firstCallback = callbacks.get(1);
      if (!firstCallback) throw new Error("Expected the first animation-frame callback.");
      callbacks.delete(1);
      firstCallback(16);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

      const staleCallback = callbacks.get(2);
      if (!staleCallback) throw new Error("Expected the second animation-frame callback.");
      unsubscribe();
      unsubscribe();
      expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
      expect(cancelAnimationFrame).toHaveBeenCalledWith(2);

      staleCallback(32);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
