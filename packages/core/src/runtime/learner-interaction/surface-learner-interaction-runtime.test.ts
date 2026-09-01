import type { EmbeddedNodeId } from "@scaffold/contracts";
import { Result } from "better-result";
import { expect, it, vi } from "vite-plus/test";

import type {
  ControlCommandRequest,
  ControlCommandResult,
  ControlEvent,
  ControlEventListener,
  EventSource,
} from "@/document/control-binding/control-binding";

import type {
  CompiledControlEventReference,
  CompiledLearnerInteractionRule,
  CompiledSurfaceLearnerInteractionProgram,
} from "./compiled-learner-interaction-program";
import { createLearnerInteractionEventKey } from "./compiled-learner-interaction-program";
import { createSurfaceLearnerInteractionRuntime } from "./surface-learner-interaction-runtime";

const SURFACE_ID = "surface-runtime" as EmbeddedNodeId;
const OWNER_A_ID = "owner-a" as EmbeddedNodeId;
const OWNER_B_ID = "owner-b" as EmbeddedNodeId;
const TARGET_A_ID = "target-a" as EmbeddedNodeId;
const TARGET_B_ID = "target-b" as EmbeddedNodeId;

function createTestEventSource() {
  const listeners = new Set<ControlEventListener>();
  let subscriptionsStarted = 0;
  let unsubscriptionsCompleted = 0;
  const eventSource: EventSource = {
    subscribe(listener) {
      subscriptionsStarted += 1;
      listeners.add(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        listeners.delete(listener);
        unsubscriptionsCompleted += 1;
      };
    },
  };
  return {
    eventSource,
    emit(event: ControlEvent) {
      return [...listeners].map((listener) =>
        (listener as (event: ControlEvent) => unknown)(event),
      );
    },
    emitVoid(event: ControlEvent) {
      for (const listener of [...listeners]) listener(event);
    },
    get listenerCount() {
      return listeners.size;
    },
    get subscriptionsStarted() {
      return subscriptionsStarted;
    },
    get unsubscriptionsCompleted() {
      return unsubscriptionsCompleted;
    },
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

function eventReference(
  ownerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
  type: string,
): CompiledControlEventReference {
  return { ownerId, targetId, type };
}

function rule(id: string, when: CompiledControlEventReference): CompiledLearnerInteractionRule {
  return {
    id,
    when,
    conditions: [],
    commands: [{ kind: "navigate-surface", surfaceId: SURFACE_ID }],
  };
}

function commandRule(
  id: string,
  when: CompiledControlEventReference,
): CompiledLearnerInteractionRule {
  return {
    id,
    when,
    conditions: [],
    commands: [
      {
        kind: "target-command",
        ownerId: when.ownerId,
        targetId: when.targetId,
        type: when.type,
      },
    ],
  };
}

function programWithBuckets(
  buckets: readonly (readonly [
    CompiledControlEventReference,
    readonly CompiledLearnerInteractionRule[],
  ])[],
): CompiledSurfaceLearnerInteractionProgram {
  return {
    surfaceId: SURFACE_ID,
    rulesByEvent: new Map(
      buckets.map(([reference, rules]) => [createLearnerInteractionEventKey(reference), rules]),
    ),
  };
}

it("publishes gate satisfaction observation before the matching event turn settles", async () => {
  const selected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  const commandCompletion = deferred<ControlCommandResult>();
  const binding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    commandExecutor: { execute: vi.fn(() => commandCompletion.promise) },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[selected, [commandRule("rule-observation", selected)]]]),
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const statuses: string[] = [];
  runtime.subscribeGateObservation(() => {
    statuses.push(runtime.getGateObservationSnapshot().status);
  });

  expect(runtime.getGateObservationSnapshot()).toEqual({ status: "inactive" });
  expect(Object.isFrozen(runtime.getGateObservationSnapshot())).toBe(true);

  const gate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });
  expect(runtime.getGateObservationSnapshot()).toEqual({
    status: "awaiting-satisfaction",
  });

  const [turnCompletion] = ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });

  expect(runtime.getGateObservationSnapshot()).toEqual({
    status: "satisfaction-observed",
  });
  expect(gateSettled).toBe(false);

  commandCompletion.resolve(Result.ok());
  await turnCompletion;
  await gate;

  expect(runtime.getGateObservationSnapshot()).toEqual({ status: "inactive" });
  expect(statuses).toEqual([
    "awaiting-satisfaction",
    "satisfaction-observed",
    "inactive",
  ]);
  runtime.dispose();
});

it("reopens a state gate when its pre-turn satisfaction no longer holds after commands", async () => {
  const selected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerAEvents = createTestEventSource();
  const ownerBEvents = createTestEventSource();
  const commandCompletion = deferred<ControlCommandResult>();
  let completion = "pending";
  const ownerABinding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerAEvents.eventSource,
    commandExecutor: {
      execute: vi.fn(() => {
        completion = "pending";
        return commandCompletion.promise;
      }),
    },
  };
  const ownerBBinding = {
    ownerId: OWNER_B_ID,
    eventSource: ownerBEvents.eventSource,
    stateReader: { read: vi.fn(() => completion) },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[selected, [commandRule("rule-state-observation", selected)]]]),
    controlBindings: {
      get: vi.fn((ownerId: EmbeddedNodeId) =>
        ownerId === OWNER_A_ID ? ownerABinding : ownerBBinding,
      ),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const controller = new AbortController();
  const gate = runtime.waitUntilSatisfied(
    {
      kind: "state",
      ownerId: OWNER_B_ID,
      targetId: TARGET_B_ID,
      key: "completion",
      equals: "complete",
    },
    { signal: controller.signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });
  completion = "complete";

  const [turnCompletion] = ownerAEvents.emit({ targetId: TARGET_A_ID, type: "selected" });

  expect(runtime.getGateObservationSnapshot()).toEqual({
    status: "satisfaction-observed",
  });
  expect(gateSettled).toBe(false);

  commandCompletion.resolve(Result.ok());
  await turnCompletion;
  await flushPromises();

  expect(runtime.getGateObservationSnapshot()).toEqual({
    status: "awaiting-satisfaction",
  });
  expect(gateSettled).toBe(false);

  controller.abort();
  expect(runtime.getGateObservationSnapshot()).toEqual({ status: "inactive" });
  runtime.dispose();
});

it("publishes changed gate observations only and rejects observation after disposal", () => {
  const ownerEvents = createTestEventSource();
  const binding = { ownerId: OWNER_A_ID, eventSource: ownerEvents.eventSource };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: { surfaceId: SURFACE_ID, rulesByEvent: new Map() },
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const listener = vi.fn();
  const unsubscribe = runtime.subscribeGateObservation(listener);
  const firstController = new AbortController();
  void runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: firstController.signal },
  );

  expect(listener).toHaveBeenCalledOnce();
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "expanded" });
  expect(listener).toHaveBeenCalledOnce();

  firstController.abort();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(runtime.getGateObservationSnapshot()).toEqual({ status: "inactive" });

  unsubscribe();
  unsubscribe();
  const secondController = new AbortController();
  void runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: secondController.signal },
  );
  expect(listener).toHaveBeenCalledTimes(2);
  secondController.abort();

  runtime.dispose();
  expect(() => runtime.getGateObservationSnapshot()).toThrow(/termination/i);
  expect(() => runtime.subscribeGateObservation(vi.fn())).toThrow(/termination/i);
});

it("subscribes once per unique static event owner and unsubscribes them on disposal", () => {
  const ownerASelected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerAExpanded = eventReference(OWNER_A_ID, TARGET_A_ID, "expanded");
  const ownerBActivated = eventReference(OWNER_B_ID, TARGET_B_ID, "activated");
  const program = programWithBuckets([
    [ownerASelected, [rule("rule-a-1", ownerASelected), rule("rule-a-2", ownerASelected)]],
    [ownerAExpanded, [rule("rule-a-3", ownerAExpanded)]],
    [ownerBActivated, [rule("rule-b-1", ownerBActivated)]],
  ]);
  const ownerAEvents = createTestEventSource();
  const ownerBEvents = createTestEventSource();

  const runtime = createSurfaceLearnerInteractionRuntime({
    program,
    controlBindings: {
      get: vi.fn((ownerId: EmbeddedNodeId) => {
        if (ownerId === OWNER_A_ID) {
          return { ownerId, eventSource: ownerAEvents.eventSource };
        }
        if (ownerId === OWNER_B_ID) {
          return { ownerId, eventSource: ownerBEvents.eventSource };
        }
        return undefined;
      }),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });

  expect(Object.isFrozen(runtime)).toBe(true);
  expect(ownerAEvents.subscriptionsStarted).toBe(1);
  expect(ownerBEvents.subscriptionsStarted).toBe(1);
  expect(ownerAEvents.listenerCount).toBe(1);
  expect(ownerBEvents.listenerCount).toBe(1);

  runtime.dispose();

  expect(ownerAEvents.listenerCount).toBe(0);
  expect(ownerBEvents.listenerCount).toBe(0);
  expect(ownerAEvents.unsubscriptionsCompleted).toBe(1);
  expect(ownerBEvents.unsubscriptionsCompleted).toBe(1);
});

it("supports idempotent report unsubscription and rejects subscriptions after disposal", () => {
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: { surfaceId: SURFACE_ID, rulesByEvent: new Map() },
    controlBindings: { get: vi.fn() },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const listener = vi.fn();

  const unsubscribe = runtime.subscribeReports(listener);
  unsubscribe();
  unsubscribe();
  runtime.dispose();
  runtime.dispose();

  expect(() => runtime.subscribeReports(listener)).toThrow(/after.*disposal/i);
});

it.each([
  {
    name: "current Control Binding",
    binding: undefined,
    expected: /current Control Binding/,
  },
  {
    name: "Event Source",
    binding: { ownerId: OWNER_A_ID },
    expected: /Event Source/,
  },
])("rejects construction when a static owner has no $name", ({ binding, expected }) => {
  const reference = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const program = programWithBuckets([[reference, [rule("rule-defect", reference)]]]);

  expect(() =>
    createSurfaceLearnerInteractionRuntime({
      program,
      controlBindings: { get: vi.fn(() => binding) },
      semanticTargets: { activate: vi.fn() },
      surfaceNavigation: {
        navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
      },
      semanticInteractionOrigin: "learner-interaction-rule",
    }),
  ).toThrow(expected);
});

it("drains committed events in FIFO order with monotonic turn numbers and one active command", async () => {
  const firstReference = eventReference(OWNER_A_ID, TARGET_A_ID, "first");
  const secondReference = eventReference(OWNER_A_ID, TARGET_A_ID, "second");
  const thirdReference = eventReference(OWNER_B_ID, TARGET_B_ID, "third");
  const program = programWithBuckets([
    [
      firstReference,
      [commandRule("rule-first-a", firstReference), commandRule("rule-first-b", firstReference)],
    ],
    [secondReference, [commandRule("rule-second", secondReference)]],
    [thirdReference, [commandRule("rule-third", thirdReference)]],
  ]);
  const ownerAEvents = createTestEventSource();
  const ownerBEvents = createTestEventSource();
  const firstExecution = deferred<ControlCommandResult>();
  let activeCommands = 0;
  let maximumActiveCommands = 0;
  const execute = vi.fn(async (request: ControlCommandRequest) => {
    activeCommands += 1;
    maximumActiveCommands = Math.max(maximumActiveCommands, activeCommands);
    try {
      if (request.type === "first" && execute.mock.calls.length === 1) {
        return await firstExecution.promise;
      }
      return Result.ok();
    } finally {
      activeCommands -= 1;
    }
  });
  const runtime = createSurfaceLearnerInteractionRuntime({
    program,
    controlBindings: {
      get: vi.fn((ownerId: EmbeddedNodeId) => {
        if (ownerId === OWNER_A_ID) {
          return {
            ownerId,
            eventSource: ownerAEvents.eventSource,
            commandExecutor: { execute },
          };
        }
        if (ownerId === OWNER_B_ID) {
          return {
            ownerId,
            eventSource: ownerBEvents.eventSource,
            commandExecutor: { execute },
          };
        }
        return undefined;
      }),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const reports: Parameters<Parameters<typeof runtime.subscribeReports>[0]>[0][] = [];
  const reportsComplete = deferred<void>();
  runtime.subscribeReports((report) => {
    reports.push(report);
    if (reports.length === 4) reportsComplete.resolve();
  });

  ownerAEvents.emit({ targetId: TARGET_A_ID, type: "first" });
  await flushPromises();
  expect(execute).toHaveBeenCalledTimes(1);

  ownerAEvents.emit({ targetId: TARGET_A_ID, type: "second" });
  ownerAEvents.emit({ targetId: TARGET_A_ID, type: "unmatched" });
  ownerBEvents.emit({ targetId: TARGET_B_ID, type: "third" });
  await flushPromises();
  expect(execute).toHaveBeenCalledTimes(1);

  firstExecution.resolve(Result.ok());
  await reportsComplete.promise;

  expect(reports.map(({ turnNumber }) => turnNumber)).toEqual([1, 2, 3, 4]);
  expect(reports.map(({ event }) => event.type)).toEqual(["first", "second", "unmatched", "third"]);
  expect(reports[2]?.ruleEvaluations).toEqual([]);
  expect(execute.mock.calls.map(([request]) => request.type)).toEqual([
    "first",
    "first",
    "second",
    "third",
  ]);
  expect(maximumActiveCommands).toBe(1);
  expect(ownerAEvents.subscriptionsStarted).toBe(1);
  expect(ownerBEvents.subscriptionsStarted).toBe(1);

  runtime.dispose();
});

it("becomes idle after a void Event Source delivery so a later task can run", async () => {
  const selected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[selected, [commandRule("rule-selected", selected)]]]),
    controlBindings: {
      get: vi.fn(() => ({
        ownerId: OWNER_A_ID,
        eventSource: ownerEvents.eventSource,
        commandExecutor: { execute: vi.fn(async () => Result.ok()) },
      })),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const reportDelivered = deferred<void>();
  const laterTask = deferred<void>();
  runtime.subscribeReports(() => reportDelivered.resolve());

  ownerEvents.emitVoid({ targetId: TARGET_A_ID, type: "selected" });
  setTimeout(() => laterTask.resolve(), 0);

  await reportDelivered.promise;
  await laterTask.promise;
  runtime.dispose();
});

it("restarts for an event queued while a completed drain is still marked active", async () => {
  const firstReference = eventReference(OWNER_A_ID, TARGET_A_ID, "first");
  const secondReference = eventReference(OWNER_A_ID, TARGET_A_ID, "second");
  const ownerEvents = createTestEventSource();
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([
      [firstReference, [commandRule("rule-first", firstReference)]],
      [secondReference, [commandRule("rule-second", secondReference)]],
    ]),
    controlBindings: {
      get: vi.fn(() => ({
        ownerId: OWNER_A_ID,
        eventSource: ownerEvents.eventSource,
        commandExecutor: { execute: vi.fn(async () => Result.ok()) },
      })),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const eventTypes: string[] = [];
  const bothReportsDelivered = deferred<void>();
  runtime.subscribeReports((report) => {
    eventTypes.push(report.event.type);
    if (report.event.type === "first") {
      queueMicrotask(() =>
        ownerEvents.emitVoid({ targetId: TARGET_A_ID, type: "second" }),
      );
      return;
    }
    runtime.dispose();
    bothReportsDelivered.resolve();
  });

  ownerEvents.emitVoid({ targetId: TARGET_A_ID, type: "first" });
  await bothReportsDelivered.promise;

  expect(eventTypes).toEqual(["first", "second"]);
});

it("publishes reports only to current listeners and retains no history", async () => {
  const reference = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[reference, [commandRule("rule-selected", reference)]]]),
    controlBindings: {
      get: vi.fn(() => ({
        ownerId: OWNER_A_ID,
        eventSource: ownerEvents.eventSource,
        commandExecutor: { execute: vi.fn(async () => Result.ok()) },
      })),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const firstListener = vi.fn();
  const secondListener = vi.fn();
  const firstReportDelivered = deferred<void>();
  const unsubscribeFirst = runtime.subscribeReports((report) => {
    firstListener(report);
    firstReportDelivered.resolve();
  });

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await firstReportDelivered.promise;
  expect(firstListener).toHaveBeenCalledTimes(1);

  const unsubscribeSecond = runtime.subscribeReports(secondListener);
  expect(secondListener).not.toHaveBeenCalled();

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();
  expect(firstListener).toHaveBeenCalledTimes(2);
  expect(secondListener).toHaveBeenCalledTimes(1);

  unsubscribeFirst();
  unsubscribeFirst();
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();
  expect(firstListener).toHaveBeenCalledTimes(2);
  expect(secondListener).toHaveBeenCalledTimes(2);

  unsubscribeSecond();
  runtime.dispose();
});

it("delivers the successful navigation report before making the outgoing runtime terminal", async () => {
  const reference = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  const navigation = deferred<ReturnType<typeof Result.ok<void>>>();
  const navigate = vi.fn(async () => await navigation.promise);
  const binding = { ownerId: OWNER_A_ID, eventSource: ownerEvents.eventSource };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[reference, [rule("rule-navigate", reference)]]]),
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: { navigate },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const reports: Parameters<Parameters<typeof runtime.subscribeReports>[0]>[0][] = [];
  const reportDelivered = deferred<void>();
  runtime.subscribeReports((report) => {
    reports.push(report);
    reportDelivered.resolve();
  });
  const gate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(navigate).toHaveBeenCalledWith(
    SURFACE_ID,
    expect.any(AbortSignal),
    { satisfiesActiveLearnerRequirement: true },
  );

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  navigation.resolve(Result.ok());
  await reportDelivered.promise;
  await flushPromises();

  expect(reports).toHaveLength(1);
  expect(reports[0]?.end).toBe("surface-navigation-committed");
  expect(ownerEvents.listenerCount).toBe(0);
  expect(ownerEvents.unsubscriptionsCompleted).toBe(1);
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();
  expect(navigate).toHaveBeenCalledTimes(1);
  expect(reports).toHaveLength(1);
  expect(gateSettled).toBe(false);
  expect(() => runtime.subscribeReports(vi.fn())).toThrow(/termination/i);

  runtime.dispose();
  expect(ownerEvents.unsubscriptionsCompleted).toBe(1);
});

it("marks navigation from an unrelated event turn as not satisfying the active requirement", async () => {
  const reference = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  const navigate = vi.fn(async () => Result.err({ reason: "cancelled" as const }));
  const binding = { ownerId: OWNER_A_ID, eventSource: ownerEvents.eventSource };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[reference, [rule("rule-navigate", reference)]]]),
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: { navigate },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const gateAbort = new AbortController();
  void runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_B_ID, type: "expanded" },
    { signal: gateAbort.signal },
  );

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();

  expect(navigate).toHaveBeenCalledWith(
    SURFACE_ID,
    expect.any(AbortSignal),
    { satisfiesActiveLearnerRequirement: false },
  );
  gateAbort.abort();
  runtime.dispose();
});

it("marks navigation after authoritative state equality as satisfying the active requirement", async () => {
  const reference = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  let completion = "pending";
  const navigate = vi.fn(async () => Result.err({ reason: "cancelled" as const }));
  const binding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    stateReader: { read: vi.fn(() => completion) },
    commandExecutor: {
      execute: vi.fn(async () => {
        completion = "complete";
        return Result.ok();
      }),
    },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([
      [
        reference,
        [
          {
            id: "rule-complete-and-navigate",
            when: reference,
            conditions: [],
            commands: [
              {
                kind: "target-command",
                ownerId: OWNER_A_ID,
                targetId: TARGET_A_ID,
                type: "complete",
              },
              { kind: "navigate-surface", surfaceId: SURFACE_ID },
            ],
          },
        ],
      ],
    ]),
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: { navigate },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const gate = runtime.waitUntilSatisfied(
    {
      kind: "state",
      ownerId: OWNER_A_ID,
      targetId: TARGET_A_ID,
      key: "completion",
      equals: "complete",
    },
    { signal: new AbortController().signal },
  );

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await gate;

  expect(navigate).toHaveBeenCalledWith(
    SURFACE_ID,
    expect.any(AbortSignal),
    { satisfiesActiveLearnerRequirement: true },
  );
  runtime.dispose();
});

it("aborts active work and suppresses queued and stale reports on idempotent disposal", async () => {
  const firstReference = eventReference(OWNER_A_ID, TARGET_A_ID, "first");
  const secondReference = eventReference(OWNER_A_ID, TARGET_A_ID, "second");
  const ownerEvents = createTestEventSource();
  const firstExecution = deferred<ControlCommandResult>();
  const execute = vi.fn(async (request: ControlCommandRequest) => {
    if (request.type === "first") return await firstExecution.promise;
    return Result.ok();
  });
  const binding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    commandExecutor: { execute },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([
      [firstReference, [commandRule("rule-first", firstReference)]],
      [secondReference, [commandRule("rule-second", secondReference)]],
    ]),
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const listener = vi.fn();
  runtime.subscribeReports(listener);
  const gate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "first" },
    { signal: new AbortController().signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "first" });
  await flushPromises();
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "second" });
  expect(execute).toHaveBeenCalledTimes(1);

  runtime.dispose();
  runtime.dispose();
  const activeRequest = execute.mock.calls[0]?.[0];
  expect(activeRequest?.signal.aborted).toBe(true);
  expect(ownerEvents.listenerCount).toBe(0);
  expect(ownerEvents.unsubscriptionsCompleted).toBe(1);

  firstExecution.resolve(Result.ok());
  await flushPromises();
  expect(execute).toHaveBeenCalledTimes(1);
  expect(listener).not.toHaveBeenCalled();
  expect(gateSettled).toBe(false);
  expect(() => runtime.subscribeReports(listener)).toThrow(/after.*disposal/i);
});

it("surfaces a rejected turn defect and terminates before starting queued work", async () => {
  const firstReference = eventReference(OWNER_A_ID, TARGET_A_ID, "first");
  const secondReference = eventReference(OWNER_A_ID, TARGET_A_ID, "second");
  const ownerEvents = createTestEventSource();
  const firstExecution = deferred<ControlCommandResult>();
  const sentinelDefect = new Error("sentinel command defect");
  const execute = vi.fn(async (request: ControlCommandRequest) => {
    if (request.type === "first") return await firstExecution.promise;
    return Result.ok();
  });
  const binding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    commandExecutor: { execute },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([
      [firstReference, [commandRule("rule-first-defect", firstReference)]],
      [secondReference, [commandRule("rule-second-after-defect", secondReference)]],
    ]),
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const reportListener = vi.fn();
  runtime.subscribeReports(reportListener);
  const gate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "first" },
    { signal: new AbortController().signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });

  const [turnCompletion] = ownerEvents.emit({ targetId: TARGET_A_ID, type: "first" });
  await flushPromises();
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "second" });

  firstExecution.reject(sentinelDefect);

  await expect(turnCompletion).rejects.toBe(sentinelDefect);
  expect(execute).toHaveBeenCalledTimes(1);
  expect(reportListener).not.toHaveBeenCalled();
  expect(gateSettled).toBe(false);
  expect(ownerEvents.listenerCount).toBe(0);
  expect(ownerEvents.unsubscriptionsCompleted).toBe(1);
  expect(() => runtime.subscribeReports(vi.fn())).toThrow(/termination/i);
});

it("observes an exact post-registration event and settles its gate after report delivery", async () => {
  const ownerEvents = createTestEventSource();
  const binding = { ownerId: OWNER_A_ID, eventSource: ownerEvents.eventSource };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: { surfaceId: SURFACE_ID, rulesByEvent: new Map() },
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const settlementOrder: string[] = [];
  runtime.subscribeReports((report) => settlementOrder.push(`report:${report.event.type}`));

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  const gate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  void gate.then(() => settlementOrder.push("gate"));
  expect(ownerEvents.listenerCount).toBe(1);

  ownerEvents.emit({ targetId: TARGET_B_ID, type: "selected" });
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "expanded" });
  await flushPromises();
  expect(settlementOrder).toEqual(["report:selected", "report:expanded"]);

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await gate;

  expect(settlementOrder).toEqual([
    "report:selected",
    "report:expanded",
    "report:selected",
    "gate",
  ]);
  expect(ownerEvents.listenerCount).toBe(0);
  expect(ownerEvents.unsubscriptionsCompleted).toBe(1);
  runtime.dispose();
});

it("satisfies a state gate from one immediate exact State Reader value", async () => {
  const ownerEvents = createTestEventSource();
  const read = vi.fn(() => "complete" as const);
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: { surfaceId: SURFACE_ID, rulesByEvent: new Map() },
    controlBindings: {
      get: vi.fn(() => ({
        ownerId: OWNER_A_ID,
        eventSource: ownerEvents.eventSource,
        stateReader: { read },
      })),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });

  await runtime.waitUntilSatisfied(
    {
      kind: "state",
      ownerId: OWNER_A_ID,
      targetId: TARGET_A_ID,
      key: "completion",
      equals: "complete",
    },
    { signal: new AbortController().signal },
  );

  expect(runtime.getGateObservationSnapshot()).toEqual({ status: "inactive" });
  expect(read).toHaveBeenCalledOnce();
  expect(read).toHaveBeenCalledWith({ targetId: TARGET_A_ID, key: "completion" });
  expect(ownerEvents.subscriptionsStarted).toBe(0);
  runtime.dispose();
});

it("re-reads an initially false state gate after an empty-program learner turn", async () => {
  const ownerEvents = createTestEventSource();
  let completion = "pending";
  const read = vi.fn(() => completion);
  const binding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    stateReader: { read },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: { surfaceId: SURFACE_ID, rulesByEvent: new Map() },
    controlBindings: {
      get: vi.fn(() => binding),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const settlementOrder: string[] = [];
  runtime.subscribeReports(() => settlementOrder.push("report"));

  const gate = runtime.waitUntilSatisfied(
    {
      kind: "state",
      ownerId: OWNER_A_ID,
      targetId: TARGET_A_ID,
      key: "completion",
      equals: "complete",
    },
    { signal: new AbortController().signal },
  );
  void gate.then(() => settlementOrder.push("gate"));
  expect(read).toHaveBeenCalledOnce();
  expect(ownerEvents.listenerCount).toBe(1);

  completion = "complete";
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "changed" });
  await gate;

  expect(read).toHaveBeenCalledTimes(3);
  expect(settlementOrder).toEqual(["report", "gate"]);
  expect(ownerEvents.listenerCount).toBe(0);
  expect(ownerEvents.unsubscriptionsCompleted).toBe(1);
  runtime.dispose();
});

it("shares one static owner subscription across satisfied and aborted gates", async () => {
  const selected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  const binding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    commandExecutor: { execute: vi.fn(async () => Result.ok()) },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[selected, [commandRule("rule-selected", selected)]]]),
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });

  const satisfiedGate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  expect(ownerEvents.subscriptionsStarted).toBe(1);
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await satisfiedGate;
  expect(ownerEvents.listenerCount).toBe(1);
  expect(ownerEvents.unsubscriptionsCompleted).toBe(0);

  const abortController = new AbortController();
  const abortedGate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "expanded" },
    { signal: abortController.signal },
  );
  let abortedGateSettled = false;
  void abortedGate.then(() => {
    abortedGateSettled = true;
  });
  abortController.abort();
  await flushPromises();
  expect(abortedGateSettled).toBe(false);
  expect(ownerEvents.listenerCount).toBe(1);
  expect(ownerEvents.subscriptionsStarted).toBe(1);

  runtime.dispose();
  expect(ownerEvents.listenerCount).toBe(0);
  expect(ownerEvents.unsubscriptionsCompleted).toBe(1);
});

it("does not settle an event gate aborted after its match while the turn is pending", async () => {
  const selected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  const firstExecution = deferred<ControlCommandResult>();
  const execute = vi.fn(async () => {
    if (execute.mock.calls.length === 1) return await firstExecution.promise;
    return Result.ok();
  });
  const binding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    commandExecutor: { execute },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[selected, [commandRule("rule-selected", selected)]]]),
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const firstGateController = new AbortController();
  const firstGate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: firstGateController.signal },
  );
  let firstGateSettled = false;
  void firstGate.then(() => {
    firstGateSettled = true;
  });

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();
  expect(execute).toHaveBeenCalledTimes(1);
  firstGateController.abort();

  const laterGate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  firstExecution.resolve(Result.ok());
  await laterGate;

  expect(firstGateSettled).toBe(false);
  expect(execute).toHaveBeenCalledTimes(2);
  runtime.dispose();
});

it("re-reads state after rule commands so their committed effects can satisfy the gate", async () => {
  const selected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerAEvents = createTestEventSource();
  const ownerBEvents = createTestEventSource();
  let completion = "pending";
  const ownerABinding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerAEvents.eventSource,
    commandExecutor: {
      execute: vi.fn(async () => {
        completion = "complete";
        return Result.ok();
      }),
    },
  };
  const read = vi.fn(() => completion);
  const ownerBBinding = {
    ownerId: OWNER_B_ID,
    eventSource: ownerBEvents.eventSource,
    stateReader: { read },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[selected, [commandRule("rule-selected", selected)]]]),
    controlBindings: {
      get: vi.fn((ownerId: EmbeddedNodeId) =>
        ownerId === OWNER_A_ID ? ownerABinding : ownerBBinding,
      ),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const gate = runtime.waitUntilSatisfied(
    {
      kind: "state",
      ownerId: OWNER_B_ID,
      targetId: TARGET_B_ID,
      key: "completion",
      equals: "complete",
    },
    { signal: new AbortController().signal },
  );

  ownerAEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await gate;

  expect(read).toHaveBeenCalledTimes(3);
  expect(ownerAEvents.listenerCount).toBe(1);
  expect(ownerBEvents.listenerCount).toBe(0);
  runtime.dispose();
});

it("settles a matching event gate after expected command, semantic, and navigation outcomes", async () => {
  const selected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  const commandCompletion = deferred<ControlCommandResult>();
  const binding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    commandExecutor: {
      execute: vi.fn(async () => await commandCompletion.promise),
    },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([
      [
        selected,
        [
          {
            id: "rule-expected-outcomes",
            when: selected,
            conditions: [],
            commands: [
              {
                kind: "target-command",
                ownerId: OWNER_A_ID,
                targetId: TARGET_A_ID,
                type: "play",
              },
              { kind: "reveal-target", targetId: TARGET_B_ID },
              { kind: "navigate-surface", surfaceId: SURFACE_ID },
            ],
          },
        ],
      ],
    ]),
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: {
      activate: vi.fn(async (requestedId: EmbeddedNodeId) => ({
        kind: "missing-target" as const,
        requestedId,
      })),
    },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const outcomes: string[] = [];
  runtime.subscribeReports((report) => {
    outcomes.push(...report.commandExecutions.map(({ outcome }) => outcome.kind));
  });
  const gate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();
  expect(gateSettled).toBe(false);
  expect(outcomes).toEqual([]);

  commandCompletion.resolve(Result.err({ reason: "playback-not-allowed" }));
  await gate;

  expect(outcomes).toEqual(["control-command-error", "target-not-reached", "navigation-cancelled"]);
  runtime.dispose();
});

it("does not register an already-aborted gate and permits a later requirement", async () => {
  const ownerEvents = createTestEventSource();
  const binding = { ownerId: OWNER_A_ID, eventSource: ownerEvents.eventSource };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: { surfaceId: SURFACE_ID, rulesByEvent: new Map() },
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const abortedController = new AbortController();
  abortedController.abort();
  const abortedGate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: abortedController.signal },
  );
  let abortedGateSettled = false;
  void abortedGate.then(() => {
    abortedGateSettled = true;
  });
  await flushPromises();
  expect(abortedGateSettled).toBe(false);
  expect(ownerEvents.subscriptionsStarted).toBe(0);

  const laterGate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await laterGate;
  runtime.dispose();
});

it("removes an aborted false-state observation and permits a later immediate state gate", async () => {
  const ownerEvents = createTestEventSource();
  let completion = "pending";
  const binding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    stateReader: { read: vi.fn(() => completion) },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: { surfaceId: SURFACE_ID, rulesByEvent: new Map() },
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const abortController = new AbortController();
  const abortedGate = runtime.waitUntilSatisfied(
    {
      kind: "state",
      ownerId: OWNER_A_ID,
      targetId: TARGET_A_ID,
      key: "completion",
      equals: "complete",
    },
    { signal: abortController.signal },
  );
  let abortedGateSettled = false;
  void abortedGate.then(() => {
    abortedGateSettled = true;
  });
  expect(ownerEvents.listenerCount).toBe(1);

  abortController.abort();
  await flushPromises();
  expect(abortedGateSettled).toBe(false);
  expect(ownerEvents.listenerCount).toBe(0);

  completion = "complete";
  await runtime.waitUntilSatisfied(
    {
      kind: "state",
      ownerId: OWNER_A_ID,
      targetId: TARGET_A_ID,
      key: "completion",
      equals: "complete",
    },
    { signal: new AbortController().signal },
  );
  expect(ownerEvents.subscriptionsStarted).toBe(1);
  runtime.dispose();
});

it.each([
  {
    name: "current Control Binding for an event",
    binding: undefined,
    requirement: {
      kind: "event" as const,
      ownerId: OWNER_A_ID,
      targetId: TARGET_A_ID,
      type: "selected",
    },
    expected: /current Control Binding/,
  },
  {
    name: "Event Source for an event",
    binding: { ownerId: OWNER_A_ID },
    requirement: {
      kind: "event" as const,
      ownerId: OWNER_A_ID,
      targetId: TARGET_A_ID,
      type: "selected",
    },
    expected: /Event Source/,
  },
  {
    name: "State Reader for state",
    binding: { ownerId: OWNER_A_ID, eventSource: createTestEventSource().eventSource },
    requirement: {
      kind: "state" as const,
      ownerId: OWNER_A_ID,
      targetId: TARGET_A_ID,
      key: "completion",
      equals: "complete",
    },
    expected: /State Reader/,
  },
  {
    name: "Event Source for an initially false state",
    binding: {
      ownerId: OWNER_A_ID,
      stateReader: { read: vi.fn(() => "pending") },
    },
    requirement: {
      kind: "state" as const,
      ownerId: OWNER_A_ID,
      targetId: TARGET_A_ID,
      key: "completion",
      equals: "complete",
    },
    expected: /Event Source/,
  },
])(
  "keeps a missing $name observable as a synchronous defect",
  ({ binding, requirement, expected }) => {
    const runtime = createSurfaceLearnerInteractionRuntime({
      program: { surfaceId: SURFACE_ID, rulesByEvent: new Map() },
      controlBindings: { get: vi.fn(() => binding) },
      semanticTargets: { activate: vi.fn() },
      surfaceNavigation: {
        navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
      },
      semanticInteractionOrigin: "learner-interaction-rule",
    });

    expect(() =>
      runtime.waitUntilSatisfied(requirement, { signal: new AbortController().signal }),
    ).toThrow(expected);
    runtime.dispose();
  },
);

it("rejects a simultaneous second gate and a gate call after disposal", () => {
  const ownerEvents = createTestEventSource();
  const binding = { ownerId: OWNER_A_ID, eventSource: ownerEvents.eventSource };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: { surfaceId: SURFACE_ID, rulesByEvent: new Map() },
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const requirement = {
    kind: "event" as const,
    ownerId: OWNER_A_ID,
    targetId: TARGET_A_ID,
    type: "selected",
  };
  void runtime.waitUntilSatisfied(requirement, { signal: new AbortController().signal });

  expect(() =>
    runtime.waitUntilSatisfied(requirement, { signal: new AbortController().signal }),
  ).toThrow(/second learner requirement/i);

  runtime.dispose();
  expect(() =>
    runtime.waitUntilSatisfied(requirement, { signal: new AbortController().signal }),
  ).toThrow(/after runtime termination/i);
});

it("rejects a gate when its static owner binding identity has become stale", () => {
  const selected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  let currentBinding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    commandExecutor: { execute: vi.fn(async () => Result.ok()) },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[selected, [commandRule("rule-selected", selected)]]]),
    controlBindings: { get: vi.fn(() => currentBinding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  currentBinding = {
    ownerId: OWNER_A_ID,
    eventSource: createTestEventSource().eventSource,
    commandExecutor: { execute: vi.fn(async () => Result.ok()) },
  };

  expect(() =>
    runtime.waitUntilSatisfied(
      { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
      { signal: new AbortController().signal },
    ),
  ).toThrow(/stale Control Binding/);
  runtime.dispose();
});

it("rejects event-gate settlement when its binding becomes stale during the turn", async () => {
  const selected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerEvents = createTestEventSource();
  const commandStarted = deferred<void>();
  const commandCompletion = deferred<ControlCommandResult>();
  const execute = vi.fn(async () => {
    commandStarted.resolve();
    return await commandCompletion.promise;
  });
  let currentBinding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    commandExecutor: { execute },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[selected, [commandRule("rule-selected", selected)]]]),
    controlBindings: { get: vi.fn(() => currentBinding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const reportListener = vi.fn();
  runtime.subscribeReports(reportListener);
  const gate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });

  const [turnCompletion] = ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await commandStarted.promise;
  currentBinding = {
    ownerId: OWNER_A_ID,
    eventSource: createTestEventSource().eventSource,
    commandExecutor: { execute },
  };
  const turnOutcome = Promise.resolve(turnCompletion).then(
    () => ({ kind: "resolved" as const }),
    (error: unknown) => ({ kind: "rejected" as const, error }),
  );
  commandCompletion.resolve(Result.ok());

  const outcome = await turnOutcome;
  runtime.dispose();
  expect(outcome.kind).toBe("rejected");
  if (outcome.kind === "rejected") {
    expect(outcome.error).toBeInstanceOf(Error);
    expect((outcome.error as Error).message).toMatch(/stale Control Binding/);
  }
  expect(reportListener).toHaveBeenCalledOnce();
  expect(gateSettled).toBe(false);
});

it("does not re-read or settle a state gate after a rejected learner turn", async () => {
  const selected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerAEvents = createTestEventSource();
  const ownerBEvents = createTestEventSource();
  const commandCompletion = deferred<ControlCommandResult>();
  const sentinelDefect = new Error("state gate turn defect");
  let completion = "pending";
  const ownerABinding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerAEvents.eventSource,
    commandExecutor: {
      execute: vi.fn(async () => {
        completion = "complete";
        return await commandCompletion.promise;
      }),
    },
  };
  const read = vi.fn(() => completion);
  const ownerBBinding = {
    ownerId: OWNER_B_ID,
    eventSource: ownerBEvents.eventSource,
    stateReader: { read },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[selected, [commandRule("rule-state-defect", selected)]]]),
    controlBindings: {
      get: vi.fn((ownerId: EmbeddedNodeId) =>
        ownerId === OWNER_A_ID ? ownerABinding : ownerBBinding,
      ),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const reportListener = vi.fn();
  runtime.subscribeReports(reportListener);
  const gate = runtime.waitUntilSatisfied(
    {
      kind: "state",
      ownerId: OWNER_B_ID,
      targetId: TARGET_B_ID,
      key: "completion",
      equals: "complete",
    },
    { signal: new AbortController().signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });

  const [turnCompletion] = ownerAEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();
  commandCompletion.reject(sentinelDefect);
  await expect(turnCompletion).rejects.toBe(sentinelDefect);

  expect(read).toHaveBeenCalledTimes(2);
  expect(gateSettled).toBe(false);
  expect(reportListener).not.toHaveBeenCalled();
  expect(ownerAEvents.listenerCount).toBe(0);
  expect(ownerBEvents.listenerCount).toBe(0);
  expect(() =>
    runtime.waitUntilSatisfied(
      {
        kind: "state",
        ownerId: OWNER_B_ID,
        targetId: TARGET_B_ID,
        key: "completion",
        equals: "complete",
      },
      { signal: new AbortController().signal },
    ),
  ).toThrow(/after runtime termination/i);
});

it("requires the exact subscribed owner as well as target and type for an event gate", async () => {
  const ownerASelected = eventReference(OWNER_A_ID, TARGET_A_ID, "selected");
  const ownerBSelected = eventReference(OWNER_B_ID, TARGET_A_ID, "selected");
  const ownerAEvents = createTestEventSource();
  const ownerBEvents = createTestEventSource();
  const ownerABinding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerAEvents.eventSource,
    commandExecutor: { execute: vi.fn(async () => Result.ok()) },
  };
  const ownerBBinding = {
    ownerId: OWNER_B_ID,
    eventSource: ownerBEvents.eventSource,
    commandExecutor: { execute: vi.fn(async () => Result.ok()) },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([
      [ownerASelected, [commandRule("rule-owner-a", ownerASelected)]],
      [ownerBSelected, [commandRule("rule-owner-b", ownerBSelected)]],
    ]),
    controlBindings: {
      get: vi.fn((ownerId: EmbeddedNodeId) =>
        ownerId === OWNER_A_ID ? ownerABinding : ownerBBinding,
      ),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const gate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });

  ownerBEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();
  expect(gateSettled).toBe(false);

  ownerAEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await gate;
  runtime.dispose();
});

it("disposal removes a gate-only owner and cannot publish stale satisfaction", async () => {
  const ownerEvents = createTestEventSource();
  const binding = { ownerId: OWNER_A_ID, eventSource: ownerEvents.eventSource };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: { surfaceId: SURFACE_ID, rulesByEvent: new Map() },
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const reportListener = vi.fn();
  runtime.subscribeReports(reportListener);
  const gate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });
  expect(ownerEvents.listenerCount).toBe(1);

  runtime.dispose();
  runtime.dispose();
  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();

  expect(ownerEvents.listenerCount).toBe(0);
  expect(ownerEvents.unsubscriptionsCompleted).toBe(1);
  expect(gateSettled).toBe(false);
  expect(reportListener).not.toHaveBeenCalled();
});

it("does not let a programmatic rule command fabricate the event required by a gate", async () => {
  const trigger = eventReference(OWNER_A_ID, TARGET_A_ID, "trigger");
  const ownerEvents = createTestEventSource();
  const binding = {
    ownerId: OWNER_A_ID,
    eventSource: ownerEvents.eventSource,
    commandExecutor: { execute: vi.fn(async () => Result.ok()) },
  };
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[trigger, [commandRule("rule-trigger", trigger)]]]),
    controlBindings: { get: vi.fn(() => binding) },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const gate = runtime.waitUntilSatisfied(
    { kind: "event", ownerId: OWNER_A_ID, targetId: TARGET_A_ID, type: "selected" },
    { signal: new AbortController().signal },
  );
  let gateSettled = false;
  void gate.then(() => {
    gateSettled = true;
  });

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "trigger" });
  await flushPromises();
  expect(binding.commandExecutor.execute).toHaveBeenCalledOnce();
  expect(gateSettled).toBe(false);

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await gate;
  runtime.dispose();
});
