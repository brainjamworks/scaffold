import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";

import type {
  ControlCommandError,
  ControlCommandRequest,
  ControlCommandResult,
  ControlEvent,
} from "@/document/control-binding/control-binding";
import type { SemanticTargetInteractionResult } from "@/document/semantic-target-interaction/semantic-target-interaction-coordinator";

import type {
  CompiledControlEventReference,
  CompiledLearnerInteractionRule,
  CompiledSurfaceLearnerInteractionProgram,
} from "./compiled-learner-interaction-program";
import { createLearnerInteractionEventKey } from "./compiled-learner-interaction-program";
import { executeLearnerInteractionEventTurn } from "./learner-interaction-event-turn";

const SURFACE_ID = "surface-1" as EmbeddedNodeId;
const OWNER_ID = "owner-1" as EmbeddedNodeId;
const TARGET_ID = "target-1" as EmbeddedNodeId;
const EVENT_REFERENCE: CompiledControlEventReference = {
  ownerId: OWNER_ID,
  targetId: TARGET_ID,
  type: "selected",
};

function programWithRules(
  rules: readonly CompiledLearnerInteractionRule[],
  reference = EVENT_REFERENCE,
): CompiledSurfaceLearnerInteractionProgram {
  return {
    surfaceId: SURFACE_ID,
    rulesByEvent: new Map([[createLearnerInteractionEventKey(reference), rules]]),
  };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function expectDeeplyFrozenPlainData(value: unknown): void {
  if (typeof value !== "object" || value === null) return;
  expect(value).not.toBeInstanceOf(Error);
  expect(value).not.toBeInstanceOf(Promise);
  expect(value).not.toBeInstanceOf(AbortSignal);
  expect(Object.isFrozen(value)).toBe(true);
  if (!Array.isArray(value)) expect(Object.getPrototypeOf(value)).toBe(Object.prototype);
  for (const child of Object.values(value)) expectDeeplyFrozenPlainData(child);
}

it("returns a frozen completed report when the event has no exact rule bucket", async () => {
  const event: ControlEvent = { targetId: TARGET_ID, type: "selected" };
  const program: CompiledSurfaceLearnerInteractionProgram = {
    surfaceId: SURFACE_ID,
    rulesByEvent: new Map(),
  };
  const semanticTargets = { activate: vi.fn() };
  const controlBindings = { get: vi.fn() };
  const surfaceNavigation = { navigate: vi.fn(async () => Result.ok()) };

  const report = await executeLearnerInteractionEventTurn({
    turnNumber: 4,
    ownerId: OWNER_ID,
    event,
    program,
    controlBindings,
    semanticTargets,
    surfaceNavigation,
    semanticInteractionOrigin: "learner-interaction-rule",
    signal: new AbortController().signal,
  });

  expect(report).toEqual({
    turnNumber: 4,
    event,
    ruleEvaluations: [],
    commandExecutions: [],
    end: "completed",
  });
  expect(report.event).not.toBe(event);
  expect(Object.isFrozen(report)).toBe(true);
  expect(Object.isFrozen(report.event)).toBe(true);
  expect(Object.isFrozen(report.ruleEvaluations)).toBe(true);
  expect(Object.isFrozen(report.commandExecutions)).toBe(true);
  expect(semanticTargets.activate).not.toHaveBeenCalled();
  expect(controlBindings.get).not.toHaveBeenCalled();
  expect(surfaceNavigation.navigate).not.toHaveBeenCalled();
});

it("matches an exact zero-condition rule and records expected navigation cancellation", async () => {
  const destinationId = "surface-2" as EmbeddedNodeId;
  const rule = {
    id: "rule-zero-conditions",
    when: EVENT_REFERENCE,
    conditions: [],
    commands: [{ kind: "navigate-surface", surfaceId: destinationId }],
  } as const satisfies CompiledLearnerInteractionRule;
  const signal = new AbortController().signal;
  const navigate = vi.fn(async () => Result.err({ reason: "cancelled" as const }));

  const report = await executeLearnerInteractionEventTurn({
    turnNumber: 5,
    ownerId: OWNER_ID,
    event: { targetId: TARGET_ID, type: "selected" },
    program: programWithRules([rule]),
    controlBindings: { get: vi.fn() },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: { navigate },
    semanticInteractionOrigin: "learner-interaction-rule",
    signal,
  });

  expect(report).toEqual({
    turnNumber: 5,
    event: { targetId: TARGET_ID, type: "selected" },
    ruleEvaluations: [{ kind: "matched", ruleId: "rule-zero-conditions", conditions: [] }],
    commandExecutions: [
      {
        address: { ruleId: "rule-zero-conditions", commandIndex: 0 },
        outcome: { kind: "navigation-cancelled" },
      },
    ],
    end: "completed",
  });
  expect(navigate).toHaveBeenCalledWith(destinationId, signal);
});

it.each([
  {
    name: "owner",
    ownerId: "owner-other" as EmbeddedNodeId,
    event: { targetId: TARGET_ID, type: "selected" },
  },
  {
    name: "target",
    ownerId: OWNER_ID,
    event: { targetId: "target-other" as EmbeddedNodeId, type: "selected" },
  },
  {
    name: "type",
    ownerId: OWNER_ID,
    event: { targetId: TARGET_ID, type: "expanded" },
  },
])("does not select a rule when the event $name differs", async ({ ownerId, event }) => {
  const navigate = vi.fn(async () => Result.ok());
  const rule = {
    id: "rule-exact-event",
    when: EVENT_REFERENCE,
    conditions: [],
    commands: [{ kind: "navigate-surface", surfaceId: SURFACE_ID }],
  } as const satisfies CompiledLearnerInteractionRule;

  const report = await executeLearnerInteractionEventTurn({
    turnNumber: 5,
    ownerId,
    event,
    program: programWithRules([rule]),
    controlBindings: { get: vi.fn() },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: { navigate },
    semanticInteractionOrigin: "learner-interaction-rule",
    signal: new AbortController().signal,
  });

  expect(report.ruleEvaluations).toEqual([]);
  expect(report.commandExecutions).toEqual([]);
  expect(navigate).not.toHaveBeenCalled();
});

it("reads unique condition state before commands and evaluates every rule against that view", async () => {
  const stateOwnerId = "owner-state" as EmbeddedNodeId;
  const stateTargetId = "target-state" as EmbeddedNodeId;
  const signal = new AbortController().signal;
  const operations: string[] = [];
  let complete = false;
  const read = vi.fn(({ key }: { readonly key: string }) => {
    operations.push(`read:${key}`);
    return key === "complete" ? complete : true;
  });
  const execute = vi.fn(async (request: ControlCommandRequest) => {
    operations.push(`command:${request.type}`);
    if (request.type === "set-complete") complete = true;
    return Result.ok();
  });
  const controlBindings = {
    get: vi.fn((ownerId: EmbeddedNodeId) => {
      if (ownerId !== stateOwnerId) return undefined;
      return { ownerId, stateReader: { read }, commandExecutor: { execute } };
    }),
  };
  const sharedCondition = {
    ownerId: stateOwnerId,
    targetId: stateTargetId,
    key: "complete",
  } as const;
  const rules = [
    {
      id: "rule-equals",
      when: EVENT_REFERENCE,
      conditions: [{ ...sharedCondition, operator: "equals", value: false }],
      commands: [
        {
          kind: "target-command",
          ownerId: stateOwnerId,
          targetId: stateTargetId,
          type: "set-complete",
          input: true,
        },
      ],
    },
    {
      id: "rule-not-equals",
      when: EVENT_REFERENCE,
      conditions: [{ ...sharedCondition, operator: "not-equals", value: true }],
      commands: [
        {
          kind: "target-command",
          ownerId: stateOwnerId,
          targetId: stateTargetId,
          type: "focus",
        },
      ],
    },
    {
      id: "rule-not-matched",
      when: EVENT_REFERENCE,
      conditions: [
        { ...sharedCondition, operator: "equals", value: true },
        {
          ownerId: stateOwnerId,
          targetId: stateTargetId,
          key: "enabled",
          operator: "equals",
          value: true,
        },
      ],
      commands: [
        {
          kind: "target-command",
          ownerId: stateOwnerId,
          targetId: stateTargetId,
          type: "must-not-run",
        },
      ],
    },
  ] as const satisfies readonly CompiledLearnerInteractionRule[];

  const report = await executeLearnerInteractionEventTurn({
    turnNumber: 6,
    ownerId: OWNER_ID,
    event: { targetId: TARGET_ID, type: "selected" },
    program: programWithRules(rules),
    controlBindings,
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: { navigate: vi.fn(async () => Result.ok()) },
    semanticInteractionOrigin: "learner-interaction-rule",
    signal,
  });

  expect(operations).toEqual([
    "read:complete",
    "read:enabled",
    "command:set-complete",
    "command:focus",
  ]);
  expect(read).toHaveBeenCalledTimes(2);
  expect(report.ruleEvaluations).toEqual([
    {
      kind: "matched",
      ruleId: "rule-equals",
      conditions: [{ conditionIndex: 0, actualValue: false, matched: true }],
    },
    {
      kind: "matched",
      ruleId: "rule-not-equals",
      conditions: [{ conditionIndex: 0, actualValue: false, matched: true }],
    },
    {
      kind: "not-matched",
      ruleId: "rule-not-matched",
      conditions: [
        { conditionIndex: 0, actualValue: false, matched: false },
        { conditionIndex: 1, actualValue: true, matched: true },
      ],
    },
  ]);
  expect(report.commandExecutions).toEqual([
    {
      address: { ruleId: "rule-equals", commandIndex: 0 },
      outcome: { kind: "succeeded" },
    },
    {
      address: { ruleId: "rule-not-equals", commandIndex: 0 },
      outcome: { kind: "succeeded" },
    },
  ]);
  expect(execute).toHaveBeenNthCalledWith(1, {
    targetId: stateTargetId,
    type: "set-complete",
    input: true,
    signal,
  });
  expect(execute).toHaveBeenNthCalledWith(2, {
    targetId: stateTargetId,
    type: "focus",
    signal,
  });
});

it("reveals a target with the configured origin and shared signal", async () => {
  const revealTargetId = "target-reveal" as EmbeddedNodeId;
  const rule = {
    id: "rule-reveal",
    when: EVENT_REFERENCE,
    conditions: [],
    commands: [{ kind: "reveal-target", targetId: revealTargetId }],
  } as const satisfies CompiledLearnerInteractionRule;
  const signal = new AbortController().signal;
  const activate = vi.fn(async () => ({ kind: "reached" as const, requestedId: revealTargetId }));

  const report = await executeLearnerInteractionEventTurn({
    turnNumber: 7,
    ownerId: OWNER_ID,
    event: { targetId: TARGET_ID, type: "selected" },
    program: programWithRules([rule]),
    controlBindings: { get: vi.fn() },
    semanticTargets: { activate },
    surfaceNavigation: { navigate: vi.fn(async () => Result.ok()) },
    semanticInteractionOrigin: "author-preview",
    signal,
  });

  expect(activate).toHaveBeenCalledWith(revealTargetId, {
    origin: "author-preview",
    signal,
  });
  expect(report.commandExecutions).toEqual([
    {
      address: { ruleId: "rule-reveal", commandIndex: 0 },
      outcome: { kind: "succeeded" },
    },
  ]);
});

it.each([
  { kind: "missing-target", requestedId: "target-reveal" as EmbeddedNodeId },
  {
    kind: "unavailable",
    requestedId: "target-reveal" as EmbeddedNodeId,
    ownerId: "owner-semantic" as EmbeddedNodeId,
    childId: "child-semantic" as EmbeddedNodeId,
    nearestReachableOwnerId: null,
    reason: "owner-unmounted",
  },
  {
    kind: "refused",
    requestedId: "target-reveal" as EmbeddedNodeId,
    ownerId: "owner-semantic" as EmbeddedNodeId,
    childId: "child-semantic" as EmbeddedNodeId,
    nearestReachableOwnerId: "owner-nearest" as EmbeddedNodeId,
    reason: "authority-boundary",
  },
  { kind: "interrupted", requestedId: "target-reveal" as EmbeddedNodeId },
] satisfies readonly Exclude<SemanticTargetInteractionResult, { readonly kind: "reached" }>[])(
  "records semantic $kind as an exact target-not-reached outcome",
  async (semanticResult) => {
    const rule = {
      id: `rule-${semanticResult.kind}`,
      when: EVENT_REFERENCE,
      conditions: [],
      commands: [{ kind: "reveal-target", targetId: semanticResult.requestedId }],
    } as const satisfies CompiledLearnerInteractionRule;

    const report = await executeLearnerInteractionEventTurn({
      turnNumber: 8,
      ownerId: OWNER_ID,
      event: { targetId: TARGET_ID, type: "selected" },
      program: programWithRules([rule]),
      controlBindings: { get: vi.fn() },
      semanticTargets: { activate: vi.fn(async () => semanticResult) },
      surfaceNavigation: { navigate: vi.fn(async () => Result.ok()) },
      semanticInteractionOrigin: "learner-interaction-rule",
      signal: new AbortController().signal,
    });

    expect(report.commandExecutions).toEqual([
      {
        address: { ruleId: `rule-${semanticResult.kind}`, commandIndex: 0 },
        outcome: { kind: "target-not-reached", result: semanticResult },
      },
    ]);
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
  "records Control Command $reason with exact facts and no semantic activation",
  async (error) => {
    const commandOwnerId = "owner-command-error" as EmbeddedNodeId;
    const commandTargetId = "target-command-error" as EmbeddedNodeId;
    const execute = vi.fn(async () => Result.err(error));
    const activate = vi.fn();
    const rule = {
      id: `rule-${error.reason}`,
      when: EVENT_REFERENCE,
      conditions: [],
      commands: [
        {
          kind: "target-command",
          ownerId: commandOwnerId,
          targetId: commandTargetId,
          type: "run",
        },
      ],
    } as const satisfies CompiledLearnerInteractionRule;

    const report = await executeLearnerInteractionEventTurn({
      turnNumber: 9,
      ownerId: OWNER_ID,
      event: { targetId: TARGET_ID, type: "selected" },
      program: programWithRules([rule]),
      controlBindings: {
        get: vi.fn(() => ({ ownerId: commandOwnerId, commandExecutor: { execute } })),
      },
      semanticTargets: { activate },
      surfaceNavigation: { navigate: vi.fn(async () => Result.ok()) },
      semanticInteractionOrigin: "learner-interaction-rule",
      signal: new AbortController().signal,
    });

    expect(report.commandExecutions).toEqual([
      {
        address: { ruleId: `rule-${error.reason}`, commandIndex: 0 },
        outcome: { kind: "control-command-error", error },
      },
    ]);
    const outcome = report.commandExecutions[0]?.outcome;
    expect(outcome?.kind).toBe("control-command-error");
    if (outcome?.kind !== "control-command-error") {
      throw new Error("Expected a Control Command error outcome.");
    }
    expect(outcome.error).not.toBe(error);
    expect(activate).not.toHaveBeenCalled();
  },
);

it("preserves ordered outcomes until successful navigation skips every later command", async () => {
  const revealTargetId = "target-missing" as EmbeddedNodeId;
  const commandOwnerId = "owner-ordered" as EmbeddedNodeId;
  const commandTargetId = "target-ordered" as EmbeddedNodeId;
  const cancelledSurfaceId = "surface-cancelled" as EmbeddedNodeId;
  const committedSurfaceId = "surface-committed" as EmbeddedNodeId;
  const controlError = { reason: "playback-not-allowed" as const };
  const activate = vi.fn(async () => ({
    kind: "missing-target" as const,
    requestedId: revealTargetId,
  }));
  const execute = vi
    .fn<(request: ControlCommandRequest) => Promise<ControlCommandResult>>()
    .mockImplementationOnce(async () => Result.err(controlError))
    .mockImplementationOnce(async () => Result.ok());
  const navigate = vi
    .fn()
    .mockImplementationOnce(async () => Result.err({ reason: "cancelled" as const }))
    .mockImplementationOnce(async () => Result.ok());
  const rules = [
    {
      id: "rule-expected-outcomes",
      when: EVENT_REFERENCE,
      conditions: [],
      commands: [
        { kind: "reveal-target", targetId: revealTargetId },
        {
          kind: "target-command",
          ownerId: commandOwnerId,
          targetId: commandTargetId,
          type: "refuse",
        },
        { kind: "navigate-surface", surfaceId: cancelledSurfaceId },
        {
          kind: "target-command",
          ownerId: commandOwnerId,
          targetId: commandTargetId,
          type: "succeed",
        },
      ],
    },
    {
      id: "rule-navigation",
      when: EVENT_REFERENCE,
      conditions: [],
      commands: [
        { kind: "navigate-surface", surfaceId: committedSurfaceId },
        { kind: "reveal-target", targetId: "target-skipped" as EmbeddedNodeId },
      ],
    },
    {
      id: "rule-after-navigation",
      when: EVENT_REFERENCE,
      conditions: [],
      commands: [
        {
          kind: "target-command",
          ownerId: commandOwnerId,
          targetId: commandTargetId,
          type: "must-not-run",
        },
      ],
    },
  ] as const satisfies readonly CompiledLearnerInteractionRule[];

  const report = await executeLearnerInteractionEventTurn({
    turnNumber: 10,
    ownerId: OWNER_ID,
    event: { targetId: TARGET_ID, type: "selected" },
    program: programWithRules(rules),
    controlBindings: {
      get: vi.fn(() => ({ ownerId: commandOwnerId, commandExecutor: { execute } })),
    },
    semanticTargets: { activate },
    surfaceNavigation: { navigate },
    semanticInteractionOrigin: "learner-interaction-rule",
    signal: new AbortController().signal,
  });

  expect(report.commandExecutions).toEqual([
    {
      address: { ruleId: "rule-expected-outcomes", commandIndex: 0 },
      outcome: {
        kind: "target-not-reached",
        result: { kind: "missing-target", requestedId: revealTargetId },
      },
    },
    {
      address: { ruleId: "rule-expected-outcomes", commandIndex: 1 },
      outcome: { kind: "control-command-error", error: controlError },
    },
    {
      address: { ruleId: "rule-expected-outcomes", commandIndex: 2 },
      outcome: { kind: "navigation-cancelled" },
    },
    {
      address: { ruleId: "rule-expected-outcomes", commandIndex: 3 },
      outcome: { kind: "succeeded" },
    },
    {
      address: { ruleId: "rule-navigation", commandIndex: 0 },
      outcome: { kind: "succeeded" },
    },
    {
      address: { ruleId: "rule-navigation", commandIndex: 1 },
      outcome: { kind: "skipped", reason: "surface-navigation-committed" },
    },
    {
      address: { ruleId: "rule-after-navigation", commandIndex: 0 },
      outcome: { kind: "skipped", reason: "surface-navigation-committed" },
    },
  ]);
  expect(report.end).toBe("surface-navigation-committed");
  expect(activate).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledTimes(2);
  expect(navigate).toHaveBeenNthCalledWith(1, cancelledSurfaceId, expect.any(AbortSignal));
  expect(navigate).toHaveBeenNthCalledWith(2, committedSurfaceId, expect.any(AbortSignal));
});

it("awaits each command before starting the next one", async () => {
  const commandOwnerId = "owner-sequential" as EmbeddedNodeId;
  const commandTargetId = "target-sequential" as EmbeddedNodeId;
  const firstExecution = deferred<ControlCommandResult>();
  let activeExecutions = 0;
  let maximumActiveExecutions = 0;
  const execute = vi.fn(async (request: ControlCommandRequest) => {
    activeExecutions += 1;
    maximumActiveExecutions = Math.max(maximumActiveExecutions, activeExecutions);
    try {
      if (request.type === "first") return await firstExecution.promise;
      return Result.ok();
    } finally {
      activeExecutions -= 1;
    }
  });
  const rule = {
    id: "rule-sequential",
    when: EVENT_REFERENCE,
    conditions: [],
    commands: [
      {
        kind: "target-command",
        ownerId: commandOwnerId,
        targetId: commandTargetId,
        type: "first",
      },
      {
        kind: "target-command",
        ownerId: commandOwnerId,
        targetId: commandTargetId,
        type: "second",
      },
    ],
  } as const satisfies CompiledLearnerInteractionRule;

  const turn = executeLearnerInteractionEventTurn({
    turnNumber: 11,
    ownerId: OWNER_ID,
    event: { targetId: TARGET_ID, type: "selected" },
    program: programWithRules([rule]),
    controlBindings: {
      get: vi.fn(() => ({ ownerId: commandOwnerId, commandExecutor: { execute } })),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: { navigate: vi.fn(async () => Result.ok()) },
    semanticInteractionOrigin: "learner-interaction-rule",
    signal: new AbortController().signal,
  });
  await flushPromises();

  expect(execute).toHaveBeenCalledTimes(1);
  expect(maximumActiveExecutions).toBe(1);

  firstExecution.resolve(Result.ok());
  await turn;

  expect(execute).toHaveBeenCalledTimes(2);
  expect(maximumActiveExecutions).toBe(1);
});

it("stops before dispatching another command when aborted during the current command", async () => {
  const commandOwnerId = "owner-aborted" as EmbeddedNodeId;
  const commandTargetId = "target-aborted" as EmbeddedNodeId;
  const controller = new AbortController();
  const firstExecution = deferred<ControlCommandResult>();
  const execute = vi.fn(async (request: ControlCommandRequest) => {
    if (request.type === "first") return await firstExecution.promise;
    return Result.ok();
  });
  const rule = {
    id: "rule-aborted",
    when: EVENT_REFERENCE,
    conditions: [],
    commands: [
      {
        kind: "target-command",
        ownerId: commandOwnerId,
        targetId: commandTargetId,
        type: "first",
      },
      {
        kind: "target-command",
        ownerId: commandOwnerId,
        targetId: commandTargetId,
        type: "must-not-run",
      },
    ],
  } as const satisfies CompiledLearnerInteractionRule;

  const turn = executeLearnerInteractionEventTurn({
    turnNumber: 12,
    ownerId: OWNER_ID,
    event: { targetId: TARGET_ID, type: "selected" },
    program: programWithRules([rule]),
    controlBindings: {
      get: vi.fn(() => ({ ownerId: commandOwnerId, commandExecutor: { execute } })),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: { navigate: vi.fn(async () => Result.ok()) },
    semanticInteractionOrigin: "learner-interaction-rule",
    signal: controller.signal,
  });
  await flushPromises();

  expect(execute).toHaveBeenCalledTimes(1);
  controller.abort();
  firstExecution.resolve(Result.err({ reason: "cancelled" }));

  await expect(turn).rejects.toBe(controller.signal.reason);
  expect(execute).toHaveBeenCalledTimes(1);
});

describe("programming defects", () => {
  it.each([
    {
      name: "missing binding",
      get: () => undefined,
      expected: /current Control Binding/,
    },
    {
      name: "missing State Reader",
      get: () => ({ ownerId: "owner-state-defect" as EmbeddedNodeId }),
      expected: /State Reader/,
    },
  ])("rejects condition evaluation for a $name", async ({ get, expected }) => {
    const stateOwnerId = "owner-state-defect" as EmbeddedNodeId;
    const rule = {
      id: "rule-state-defect",
      when: EVENT_REFERENCE,
      conditions: [
        {
          ownerId: stateOwnerId,
          targetId: "target-state-defect" as EmbeddedNodeId,
          key: "complete",
          operator: "equals",
          value: true,
        },
      ],
      commands: [{ kind: "navigate-surface", surfaceId: SURFACE_ID }],
    } as const satisfies CompiledLearnerInteractionRule;

    await expect(
      executeLearnerInteractionEventTurn({
        turnNumber: 12,
        ownerId: OWNER_ID,
        event: { targetId: TARGET_ID, type: "selected" },
        program: programWithRules([rule]),
        controlBindings: { get: vi.fn(get) },
        semanticTargets: { activate: vi.fn() },
        surfaceNavigation: { navigate: vi.fn(async () => Result.ok()) },
        semanticInteractionOrigin: "learner-interaction-rule",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(expected);
  });

  it.each([
    {
      name: "missing binding",
      get: () => undefined,
      expected: /current Control Binding/,
    },
    {
      name: "missing Command Executor",
      get: () => ({ ownerId: "owner-command-defect" as EmbeddedNodeId }),
      expected: /Command Executor/,
    },
  ])("rejects target-command execution for a $name", async ({ get, expected }) => {
    const commandOwnerId = "owner-command-defect" as EmbeddedNodeId;
    const rule = {
      id: "rule-command-defect",
      when: EVENT_REFERENCE,
      conditions: [],
      commands: [
        {
          kind: "target-command",
          ownerId: commandOwnerId,
          targetId: "target-command-defect" as EmbeddedNodeId,
          type: "run",
        },
      ],
    } as const satisfies CompiledLearnerInteractionRule;

    await expect(
      executeLearnerInteractionEventTurn({
        turnNumber: 13,
        ownerId: OWNER_ID,
        event: { targetId: TARGET_ID, type: "selected" },
        program: programWithRules([rule]),
        controlBindings: { get: vi.fn(get) },
        semanticTargets: { activate: vi.fn() },
        surfaceNavigation: { navigate: vi.fn(async () => Result.ok()) },
        semanticInteractionOrigin: "learner-interaction-rule",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(expected);
  });

  it("rejects a semantic result for a different target", async () => {
    const requestedId = "target-requested" as EmbeddedNodeId;
    const rule = {
      id: "rule-semantic-identity",
      when: EVENT_REFERENCE,
      conditions: [],
      commands: [{ kind: "reveal-target", targetId: requestedId }],
    } as const satisfies CompiledLearnerInteractionRule;

    await expect(
      executeLearnerInteractionEventTurn({
        turnNumber: 14,
        ownerId: OWNER_ID,
        event: { targetId: TARGET_ID, type: "selected" },
        program: programWithRules([rule]),
        controlBindings: { get: vi.fn() },
        semanticTargets: {
          activate: vi.fn(async () => ({
            kind: "reached" as const,
            requestedId: "target-other" as EmbeddedNodeId,
          })),
        },
        surfaceNavigation: { navigate: vi.fn(async () => Result.ok()) },
        semanticInteractionOrigin: "learner-interaction-rule",
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/semantic target identity/i);
  });

  it("preserves a thrown state-reader defect", async () => {
    const defect = new Error("state reader defect");
    const stateOwnerId = "owner-state-throw" as EmbeddedNodeId;
    const rule = {
      id: "rule-state-throw",
      when: EVENT_REFERENCE,
      conditions: [
        {
          ownerId: stateOwnerId,
          targetId: "target-state-throw" as EmbeddedNodeId,
          key: "value",
          operator: "equals",
          value: true,
        },
      ],
      commands: [{ kind: "navigate-surface", surfaceId: SURFACE_ID }],
    } as const satisfies CompiledLearnerInteractionRule;

    await expect(
      executeLearnerInteractionEventTurn({
        turnNumber: 15,
        ownerId: OWNER_ID,
        event: { targetId: TARGET_ID, type: "selected" },
        program: programWithRules([rule]),
        controlBindings: {
          get: vi.fn(() => ({
            ownerId: stateOwnerId,
            stateReader: {
              read() {
                throw defect;
              },
            },
          })),
        },
        semanticTargets: { activate: vi.fn() },
        surfaceNavigation: { navigate: vi.fn(async () => Result.ok()) },
        semanticInteractionOrigin: "learner-interaction-rule",
        signal: new AbortController().signal,
      }),
    ).rejects.toBe(defect);
  });

  it.each(["semantic", "command", "navigation"] as const)(
    "preserves a rejected $kind dependency",
    async (kind) => {
      const defect = new Error(`${kind} dependency defect`);
      const commandOwnerId = "owner-rejected" as EmbeddedNodeId;
      const command =
        kind === "semantic"
          ? ({
              kind: "reveal-target",
              targetId: "target-rejected" as EmbeddedNodeId,
            } as const)
          : kind === "command"
            ? ({
                kind: "target-command",
                ownerId: commandOwnerId,
                targetId: "target-rejected" as EmbeddedNodeId,
                type: "reject",
              } as const)
            : ({ kind: "navigate-surface", surfaceId: SURFACE_ID } as const);
      const rule = {
        id: `rule-rejected-${kind}`,
        when: EVENT_REFERENCE,
        conditions: [],
        commands: [command],
      } as const satisfies CompiledLearnerInteractionRule;

      await expect(
        executeLearnerInteractionEventTurn({
          turnNumber: 15,
          ownerId: OWNER_ID,
          event: { targetId: TARGET_ID, type: "selected" },
          program: programWithRules([rule]),
          controlBindings: {
            get: vi.fn(() => ({
              ownerId: commandOwnerId,
              commandExecutor: { execute: async () => Promise.reject(defect) },
            })),
          },
          semanticTargets: { activate: async () => Promise.reject(defect) },
          surfaceNavigation: { navigate: async () => Promise.reject(defect) },
          semanticInteractionOrigin: "learner-interaction-rule",
          signal: new AbortController().signal,
        }),
      ).rejects.toBe(defect);
    },
  );
});

it("returns deeply frozen copied plain report data", async () => {
  const dataOwnerId = "owner-plain-data" as EmbeddedNodeId;
  const dataTargetId = "target-plain-data" as EmbeddedNodeId;
  const revealTargetId = "target-plain-reveal" as EmbeddedNodeId;
  const event: ControlEvent = { targetId: TARGET_ID, type: "selected" };
  const semanticResult = {
    kind: "refused" as const,
    requestedId: revealTargetId,
    ownerId: "owner-semantic" as EmbeddedNodeId,
    childId: "child-semantic" as EmbeddedNodeId,
    nearestReachableOwnerId: dataOwnerId,
    reason: "learner-interaction-precedence" as const,
  };
  const commandError = {
    reason: "seek-out-of-range" as const,
    requestedSeconds: 18,
    durationSeconds: 12,
  };
  const rule = {
    id: "rule-plain-data",
    when: EVENT_REFERENCE,
    conditions: [
      {
        ownerId: dataOwnerId,
        targetId: dataTargetId,
        key: "mode",
        operator: "equals",
        value: "ready",
      },
    ],
    commands: [
      { kind: "reveal-target", targetId: revealTargetId },
      {
        kind: "target-command",
        ownerId: dataOwnerId,
        targetId: dataTargetId,
        type: "seek",
        input: 18,
      },
      { kind: "navigate-surface", surfaceId: SURFACE_ID },
    ],
  } as const satisfies CompiledLearnerInteractionRule;

  const report = await executeLearnerInteractionEventTurn({
    turnNumber: 16,
    ownerId: OWNER_ID,
    event,
    program: programWithRules([rule]),
    controlBindings: {
      get: vi.fn(() => ({
        ownerId: dataOwnerId,
        stateReader: { read: () => "ready" },
        commandExecutor: { execute: async () => Result.err(commandError) },
      })),
    },
    semanticTargets: { activate: async () => semanticResult },
    surfaceNavigation: {
      navigate: async () => Result.err({ reason: "cancelled" as const }),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
    signal: new AbortController().signal,
  });

  expectDeeplyFrozenPlainData(report);
  expect(Object.isFrozen(event)).toBe(false);
  expect(Object.isFrozen(semanticResult)).toBe(false);
  expect(Object.isFrozen(commandError)).toBe(false);
  expect(report.event).not.toBe(event);
  const semanticOutcome = report.commandExecutions[0]?.outcome;
  const controlOutcome = report.commandExecutions[1]?.outcome;
  expect(semanticOutcome?.kind).toBe("target-not-reached");
  expect(controlOutcome?.kind).toBe("control-command-error");
  if (semanticOutcome?.kind !== "target-not-reached") {
    throw new Error("Expected copied semantic report data.");
  }
  if (controlOutcome?.kind !== "control-command-error") {
    throw new Error("Expected copied Control Command report data.");
  }
  expect(semanticOutcome.result).not.toBe(semanticResult);
  expect(controlOutcome.error).not.toBe(commandError);
});

it("executes every command kind without touching a learner Event Source", async () => {
  const commandOwnerId = "owner-no-events" as EmbeddedNodeId;
  const commandTargetId = "target-no-events" as EmbeddedNodeId;
  const subscribe = vi.fn();
  const rule = {
    id: "rule-no-events",
    when: EVENT_REFERENCE,
    conditions: [],
    commands: [
      { kind: "reveal-target", targetId: "target-reveal" as EmbeddedNodeId },
      {
        kind: "target-command",
        ownerId: commandOwnerId,
        targetId: commandTargetId,
        type: "run",
      },
      { kind: "navigate-surface", surfaceId: SURFACE_ID },
    ],
  } as const satisfies CompiledLearnerInteractionRule;

  const report = await executeLearnerInteractionEventTurn({
    turnNumber: 17,
    ownerId: OWNER_ID,
    event: { targetId: TARGET_ID, type: "selected" },
    program: programWithRules([rule]),
    controlBindings: {
      get: vi.fn(() => ({
        ownerId: commandOwnerId,
        eventSource: { subscribe },
        commandExecutor: { execute: async () => Result.ok() },
      })),
    },
    semanticTargets: {
      activate: async (requestedId) => ({ kind: "reached", requestedId }),
    },
    surfaceNavigation: {
      navigate: async () => Result.err({ reason: "cancelled" as const }),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
    signal: new AbortController().signal,
  });

  expect(report.commandExecutions.map(({ outcome }) => outcome.kind)).toEqual([
    "succeeded",
    "succeeded",
    "navigation-cancelled",
  ]);
  expect(subscribe).not.toHaveBeenCalled();
});
