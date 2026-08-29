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
import type {
  PresentationCueExecutionOutcome,
  PresentationCueExecutor,
  PresentationTargetCommand,
} from "./presentation-cue-executor";
import { createPresentationCueExecutor } from "./presentation-cue-executor";
import {
  createAnimationFramePresentationMonotonicClock,
  type PresentationMonotonicClockPort,
} from "./presentation-monotonic-clock";
import {
  createPresentationPlaybackSession,
  type PresentationAdvanceResult,
  type PresentationCueReport,
  type PresentationPlaybackPhase,
  type PresentationPlaybackSession,
  type PresentationSeekResult,
} from "./presentation-playback-session";
import type { PresentationGatePort } from "./presentation-progression-gate";

function createManualClock(initialNowMs = 1_000) {
  let nowMs = initialNowMs;
  let activeSubscriptions = 0;
  let maximumActiveSubscriptions = 0;
  let subscriptionsStarted = 0;
  const listeners = new Set<() => void>();

  const clock: PresentationMonotonicClockPort = {
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

function cue(id: string, atMs: number): CompiledPresentationCue {
  return Object.freeze({
    id,
    atMs,
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

function manualWait(id: string, atMs: number): CompiledPresentationWait {
  return Object.freeze({ kind: "manual-wait", id: waitId(id), atMs });
}

function learnerWait(
  id: string,
  atMs: number,
  requirement: CompiledLearnerRequirement = Object.freeze({
    kind: "event",
    ownerId: `owner-${id}` as EmbeddedNodeId,
    targetId: `target-${id}` as EmbeddedNodeId,
    type: `event-${id}`,
  }),
): CompiledPresentationWait {
  return Object.freeze({ kind: "learner-wait", id: waitId(id), atMs, requirement });
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

function expectDisposedSessionDefects(session: PresentationPlaybackSession): void {
  const operations: ReadonlyArray<readonly [string, () => unknown]> = [
    ["getSnapshot", () => session.getSnapshot()],
    ["subscribe", () => session.subscribe(() => undefined)],
    ["subscribeCueReports", () => session.subscribeCueReports(() => undefined)],
    ["play", () => session.play()],
    ["pause", () => session.pause()],
    ["seek", () => session.seek(0)],
    ["advance", () => session.advance()],
    ["restart", () => session.restart()],
    ["stop", () => session.stop()],
  ];

  for (const [operation, invoke] of operations) {
    expect(invoke, operation).toThrowError(/disposed/i);
  }
}

describe("createPresentationCueExecutor", () => {
  it("prepares the target before a fresh binding lookup and executes the exact command", async () => {
    const ownerId = "owner-current" as EmbeddedNodeId;
    const targetId = "target-current" as EmbeddedNodeId;
    const signal = new AbortController().signal;
    const order: string[] = [];
    const eventSubscribe = vi.fn();
    const staleExecute = vi.fn(async () => Result.ok());
    const execute = vi.fn(async (_request: ControlCommandRequest) => {
      order.push("execute");
      return Result.ok();
    });
    let currentBinding: ControlBinding = { ownerId, commandExecutor: { execute: staleExecute } };
    const semanticTargets = {
      activate: vi.fn(async () => {
        order.push("activate");
        currentBinding = {
          ownerId,
          commandExecutor: { execute },
          eventSource: { subscribe: eventSubscribe },
        };
        return { kind: "reached" as const, requestedId: targetId };
      }),
    };
    const controlBindings = {
      get: vi.fn(() => {
        order.push("get");
        return currentBinding;
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
    expect(staleExecute).not.toHaveBeenCalled();
    expect(eventSubscribe).not.toHaveBeenCalled();
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
    "maps semantic $kind without reading Control Bindings",
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
        get: vi.fn(() => ({
          ownerId: secondCue.command.ownerId,
          commandExecutor: { execute },
          eventSource: { subscribe: eventSubscribe },
        })),
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
      manualWait("manual", 100),
    ]);
    const learnerWaits = createHarness(1_000, [], createDeferredCueExecutor(), [
      manualWait("manual", 50),
      learnerWait("learner-first", 100),
      learnerWait("learner-next", 200),
    ]);

    expect(noWaits.session.getSnapshot().outstandingLearnerWait).toBeNull();
    expect(manualOnly.session.getSnapshot().outstandingLearnerWait).toBeNull();
    expect(learnerWaits.session.getSnapshot().outstandingLearnerWait).toEqual({
      waitId: waitId("learner-first"),
    });
    expect(Object.isFrozen(learnerWaits.session.getSnapshot().outstandingLearnerWait)).toBe(true);
    expect(learnerWaits.gateWaitUntilSatisfied).not.toHaveBeenCalled();
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
      [cue("prepare-gate", 100), cue("later", 200)],
      createDeferredCueExecutor(),
      [learnerWait("event-gate", 100, requirement)],
    );

    session.play();
    manualClock.emitAt(1_250);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 100 });
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
      currentTimeMs: 100,
      outstandingLearnerWait: { waitId: waitId("event-gate") },
    });
    expect(deferredCueExecutor.pending).toHaveLength(1);
  });

  it("moves a pending learner Wait to ready before manual advancement", async () => {
    const { deferredGatePort, manualClock, session } = createHarness(
      1_000,
      [],
      createDeferredCueExecutor(),
      [learnerWait("current", 100), learnerWait("next", 300)],
    );

    session.play();
    manualClock.emitAt(1_200);
    await Promise.resolve();
    const waitingSnapshot = session.getSnapshot();
    expect(waitingSnapshot).toMatchObject({
      phase: "held",
      hold: { kind: "learner", waitId: waitId("current"), status: "waiting" },
      currentTimeMs: 100,
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

    const observation = deferredGatePort.pending[0];
    if (!observation) throw new Error("Expected the learner gate observation.");
    await settleGate(observation);

    const readySnapshot = session.getSnapshot();
    expect(readySnapshot).toMatchObject({
      phase: "held",
      hold: { kind: "learner", waitId: waitId("current"), status: "ready" },
      currentTimeMs: 100,
      outstandingLearnerWait: { waitId: waitId("next") },
    });
    expect(Object.isFrozen(readySnapshot.hold)).toBe(true);
    expect(Object.isFrozen(readySnapshot.outstandingLearnerWait)).toBe(true);
    session.play();
    session.pause();
    expect(session.getSnapshot()).toBe(readySnapshot);

    expectAdvanceOk(session.advance());
    manualClock.emitAt(1_250);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 150 });
  });

  it("auto-advances inline after observing the exact state requirement", async () => {
    const requirement: CompiledLearnerRequirement = Object.freeze({
      kind: "state",
      ownerId: "owner-state-gate" as EmbeddedNodeId,
      targetId: "target-state-gate" as EmbeddedNodeId,
      key: "completed",
      equals: true,
    });
    const { deferredGatePort, manualClock, session } = createHarness(
      1_000,
      [],
      createDeferredCueExecutor(),
      [learnerWait("state-gate", 100, requirement), learnerWait("later-gate", 300)],
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
      currentTimeMs: 100,
      outstandingLearnerWait: { waitId: waitId("later-gate") },
    });
    expect(manualClock.activeSubscriptions).toBe(1);
    manualClock.emitAt(1_250);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 150 });
  });

  it("auto-completes an endpoint learner Wait after clearing the outstanding fact", async () => {
    const { deferredGatePort, manualClock, session } = createHarness(
      100,
      [],
      createDeferredCueExecutor(),
      [learnerWait("endpoint-gate", 100)],
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
      currentTimeMs: 100,
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
        [learnerWait("rejected-gate", 100)],
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
          waits: Object.freeze([learnerWait("throwing-gate", 0, requirement)]),
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
      [manualWait("zero", 0)],
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
      currentTimeMs: 0,
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
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 0 });
    expect(manualClock.activeSubscriptions).toBe(1);

    const duplicateAdvance = session.advance();
    expect(duplicateAdvance.isErr()).toBe(true);
    if (duplicateAdvance.isOk()) throw new Error("Expected duplicate advance to fail.");
    expect(duplicateAdvance.error).toEqual({ reason: "not-at-checkpoint", phase: "playing" });
    expect(Object.isFrozen(duplicateAdvance.error)).toBe(true);
  });

  it("clamps an inline manual Wait and re-anchors playback after advance", async () => {
    const { manualClock, session } = createHarness(1_000, [], createDeferredCueExecutor(), [
      manualWait("inline", 100),
    ]);

    session.play();
    manualClock.emitAt(1_200);
    await Promise.resolve();

    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("inline") },
      currentTimeMs: 100,
    });
    expect(manualClock.activeSubscriptions).toBe(0);

    expectAdvanceOk(session.advance());
    manualClock.emitAt(1_250);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 150 });
  });

  it("completes only after advancing a manual Wait at the duration", async () => {
    const { manualClock, session } = createHarness(100, [], createDeferredCueExecutor(), [
      manualWait("endpoint", 100),
    ]);

    session.play();
    manualClock.emitAt(1_100);
    await Promise.resolve();

    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "manual", waitId: waitId("endpoint") },
      currentTimeMs: 100,
    });
    expectAdvanceOk(session.advance());
    expect(session.getSnapshot()).toMatchObject({ phase: "completed", currentTimeMs: 100 });
  });

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
      [manualWait("boundary", 100)],
    );
    const reports: PresentationCueReport[] = [];
    session.subscribeCueReports((report) => reports.push(report));

    session.play();
    manualClock.emitAt(1_200);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 100 });
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
      currentTimeMs: 100,
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
    expect(session.getSnapshot().currentTimeMs).toBe(200);
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
      "currentTimeMs",
      "durationMs",
      "outstandingLearnerWait",
      "phase",
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
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 100 });
    expect(manualClock.activeSubscriptions).toBe(0);

    const beforeEnd = deferredCueExecutor.pending[0];
    if (!beforeEnd) throw new Error("Expected the pre-endpoint cue.");
    await settleCue(beforeEnd);
    expect(session.getSnapshot().phase).toBe("playing");
    const atEnd = deferredCueExecutor.pending[1];
    if (!atEnd) throw new Error("Expected the endpoint cue.");
    await settleCue(atEnd);
    expect(session.getSnapshot()).toMatchObject({ phase: "completed", currentTimeMs: 100 });
  });

  it("consumes forward-Seek cues without execution and never rearms them on backward Seek", () => {
    const { deferredCueExecutor, manualClock, session } = createHarness(500, [
      cue("zero", 0),
      cue("early", 100),
      cue("middle", 200),
      cue("later", 300),
    ]);

    expectSeekOk(session.seek(200));
    expectSeekOk(session.seek(50));
    expect(deferredCueExecutor.pending).toHaveLength(0);

    session.play();
    manualClock.emitAt(1_250);
    expect(deferredCueExecutor.pending.map(({ command }) => command.type)).toEqual([
      "command-later",
    ]);
  });

  it("keeps rejected Cue Executor work observable as an actor defect", async () => {
    vi.useFakeTimers();
    try {
      const { deferredCueExecutor, session } = createHarness(1_000, [cue("rejected", 0)]);
      const reportListener = vi.fn();
      session.subscribeCueReports(reportListener);
      session.play();
      const execution = deferredCueExecutor.pending[0];
      if (!execution) throw new Error("Expected rejected cue work.");
      const defect = new Error("Cue Executor rejected.");

      execution.reject(defect);
      await Promise.resolve();
      await Promise.resolve();

      expect(reportListener).not.toHaveBeenCalled();
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
      currentTimeMs: 0,
      runNumber: 2,
    });
    expect(reports.map(({ cueId, outcome }) => [cueId, outcome])).toEqual([
      ["first", { kind: "session-interrupted", reason: "restart" }],
      ["second", { kind: "session-interrupted", reason: "restart" }],
    ]);

    await settleCue(oldFirst);
    expect(reports).toHaveLength(2);
    session.play();
    manualClock.emitAt(1_500);
    expect(deferredCueExecutor.pending[1]?.command.type).toBe("command-first");
    const newFirst = deferredCueExecutor.pending[1];
    if (!newFirst) throw new Error("Expected first cue in the restarted run.");
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

  it.each([
    {
      operation: "Seek",
      reason: "seek",
      interrupt: (session: PresentationPlaybackSession) => session.seek(50),
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

    expect(session.getSnapshot()).toMatchObject({ phase: "paused", currentTimeMs: 250 });
    expect(reports.map(({ cueId }) => cueId)).toEqual(["first", "second"]);
  });

  it("Dispose aborts cue work and closes both streams without a disposal report", async () => {
    const { deferredCueExecutor, manualClock, session } = createHarness(500, [
      cue("first", 100),
      cue("second", 200),
    ]);
    const snapshotListener = vi.fn();
    const reportListener = vi.fn();
    session.subscribe(snapshotListener);
    session.subscribeCueReports(reportListener);
    session.play();
    manualClock.emitAt(1_250);
    const active = deferredCueExecutor.pending[0];
    if (!active) throw new Error("Expected active cue work.");
    snapshotListener.mockClear();

    session.dispose();
    expect(active.signal.aborted).toBe(true);
    expect(manualClock.activeSubscriptions).toBe(0);
    expect(reportListener).not.toHaveBeenCalled();

    await settleCue(active);
    manualClock.emitAt(2_000);
    expect(snapshotListener).not.toHaveBeenCalled();
    expect(reportListener).not.toHaveBeenCalled();
  });

  it("starts with one frozen Scaffold snapshot and no XState surface", () => {
    const { session } = createHarness();
    const snapshot = session.getSnapshot();

    expect(snapshot).toEqual({
      phase: "awaiting-start",
      runNumber: 1,
      surfaceId: "surface-1",
      currentTimeMs: 0,
      durationMs: 1_000,
      outstandingLearnerWait: null,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(session.getSnapshot()).toBe(snapshot);
    expect(Object.keys(snapshot).sort()).toEqual([
      "currentTimeMs",
      "durationMs",
      "outstandingLearnerWait",
      "phase",
      "runNumber",
      "surfaceId",
    ]);
    expect(Object.keys(session).sort()).toEqual([
      "advance",
      "dispose",
      "getSnapshot",
      "pause",
      "play",
      "restart",
      "seek",
      "stop",
      "subscribe",
      "subscribeCueReports",
    ]);
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
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 0 });
    expect(manualClock.activeSubscriptions).toBe(1);

    manualClock.emitAt(1_125.9);
    expect(session.getSnapshot().currentTimeMs).toBe(125);

    session.play();
    expect(manualClock.subscriptionsStarted).toBe(1);
    manualClock.setNowMs(1_300);
    session.pause();
    const pausedSnapshot = session.getSnapshot();
    expect(pausedSnapshot).toMatchObject({ phase: "paused", currentTimeMs: 125 });
    expect(manualClock.activeSubscriptions).toBe(0);

    session.pause();
    expect(session.getSnapshot()).toBe(pausedSnapshot);

    manualClock.setNowMs(2_000);
    session.play();
    manualClock.emitAt(2_075.8);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 200 });
    expect(manualClock.subscriptionsStarted).toBe(2);
    expect(manualClock.maximumActiveSubscriptions).toBe(1);
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
    expect(() => playingSeek.session.seek(200)).toThrowError(/finite/i);
  });

  it("rejects a clock projection behind the last confirmed playhead", () => {
    const { manualClock, session } = createHarness();
    session.play();
    manualClock.emitAt(1_200);
    const confirmedSnapshot = session.getSnapshot();
    expect(confirmedSnapshot.currentTimeMs).toBe(200);

    expect(() => manualClock.emitAt(1_100)).toThrowError(/behind.*confirmed/i);
    expect(session.getSnapshot()).toBe(confirmedSnapshot);
  });

  it("clamps natural progression at the duration and stops clock work", () => {
    const { manualClock, session } = createHarness(300);

    session.play();
    manualClock.emitAt(1_299);
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 299 });

    manualClock.emitAt(1_350);
    const completedSnapshot = session.getSnapshot();
    expect(completedSnapshot).toMatchObject({ phase: "completed", currentTimeMs: 300 });
    expect(manualClock.activeSubscriptions).toBe(0);
    expect(manualClock.maximumActiveSubscriptions).toBe(1);

    manualClock.emitAt(2_000);
    expect(session.getSnapshot()).toBe(completedSnapshot);
  });

  it("seeks absolutely in awaiting, playing, paused, and completed phases", () => {
    const { manualClock, session } = createHarness();
    const initialSnapshot = session.getSnapshot();

    expectSeekOk(session.seek(0));
    expect(session.getSnapshot()).toBe(initialSnapshot);

    expectSeekOk(session.seek(250));
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", currentTimeMs: 250 });

    session.play();
    manualClock.emitAt(1_100);
    expect(session.getSnapshot().currentTimeMs).toBe(350);

    manualClock.setNowMs(1_250);
    expectSeekOk(session.seek(400));
    expect(session.getSnapshot()).toMatchObject({ phase: "playing", currentTimeMs: 400 });
    expect(manualClock.activeSubscriptions).toBe(1);
    expect(manualClock.subscriptionsStarted).toBe(2);

    manualClock.emitAt(1_300);
    expect(session.getSnapshot().currentTimeMs).toBe(450);
    session.pause();

    expectSeekOk(session.seek(200));
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", currentTimeMs: 200 });

    expectSeekOk(session.seek(1_000));
    expect(session.getSnapshot()).toMatchObject({ phase: "completed", currentTimeMs: 1_000 });

    expectSeekOk(session.seek(600));
    expect(session.getSnapshot()).toMatchObject({ phase: "paused", currentTimeMs: 600 });

    expectSeekOk(session.seek(1_000));
    expect(session.getSnapshot()).toMatchObject({ phase: "completed", currentTimeMs: 1_000 });
  });

  it("returns frozen range diagnostics without changing playback or active clock work", () => {
    const { manualClock, session } = createHarness();
    session.play();
    manualClock.emitAt(1_100);
    const beforeRejection = session.getSnapshot();
    const subscriptionsBeforeRejection = manualClock.subscriptionsStarted;

    for (const requestedTimeMs of [-1, 1_001]) {
      const result = session.seek(requestedTimeMs);
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
    expect(stoppedSnapshot).toMatchObject({ phase: "stopped", currentTimeMs: 240, runNumber: 1 });
    expect(manualClock.activeSubscriptions).toBe(0);

    session.stop();
    expect(session.getSnapshot()).toBe(stoppedSnapshot);
    expect(() => session.play()).toThrowError(/stopped/i);
    expect(() => session.pause()).toThrowError(/stopped/i);
    expect(() => session.seek(100)).toThrowError(/stopped/i);
    expect(session.getSnapshot()).toBe(stoppedSnapshot);

    session.restart();
    expect(session.getSnapshot()).toEqual({
      phase: "awaiting-start",
      runNumber: 2,
      surfaceId: "surface-1",
      currentTimeMs: 0,
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
        currentTimeMs: 0,
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
