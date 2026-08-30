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
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([[reference, [rule("rule-navigate", reference)]]]),
    controlBindings: {
      get: vi.fn(() => ({ ownerId: OWNER_A_ID, eventSource: ownerEvents.eventSource })),
    },
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

  ownerEvents.emit({ targetId: TARGET_A_ID, type: "selected" });
  await flushPromises();
  expect(navigate).toHaveBeenCalledTimes(1);

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
  expect(() => runtime.subscribeReports(vi.fn())).toThrow(/termination/i);

  runtime.dispose();
  expect(ownerEvents.unsubscriptionsCompleted).toBe(1);
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
  const runtime = createSurfaceLearnerInteractionRuntime({
    program: programWithBuckets([
      [firstReference, [commandRule("rule-first", firstReference)]],
      [secondReference, [commandRule("rule-second", secondReference)]],
    ]),
    controlBindings: {
      get: vi.fn(() => ({
        ownerId: OWNER_A_ID,
        eventSource: ownerEvents.eventSource,
        commandExecutor: { execute },
      })),
    },
    semanticTargets: { activate: vi.fn() },
    surfaceNavigation: {
      navigate: vi.fn(async () => Result.err({ reason: "cancelled" as const })),
    },
    semanticInteractionOrigin: "learner-interaction-rule",
  });
  const listener = vi.fn();
  runtime.subscribeReports(listener);

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
  expect(() => runtime.subscribeReports(listener)).toThrow(/after.*disposal/i);
});
