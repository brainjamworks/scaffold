import { Result } from "better-result";
import { describe, expect, it, vi } from "vite-plus/test";
import type { EmbeddedNodeId } from "@scaffold/contracts";

import type {
  ControlCommandRequest,
  ControlCommandResult,
  ControlEvent,
  ControlEventListener,
  EventSource,
} from "@/document/control-binding/control-binding";
import type { SurfaceId } from "@/document/model/course-structure";
import type { CompiledSurfaceLearnerInteractionProgram } from "@/runtime/learner-interaction/compiled-learner-interaction-program";
import { createLearnerInteractionEventKey } from "@/runtime/learner-interaction/compiled-learner-interaction-program";
import type {
  CompiledInternalClockSurfaceTimeline,
  PresentationWaitId,
} from "@/runtime/presentation/compiled-presentation-program";
import type {
  SurfaceChangeRefused,
  SurfaceChangeResult,
} from "./slideshow-surface-change";

import {
  createSlideshowSurfaceRuntimeComposition,
  type SlideshowSurfaceRuntimeProgram,
  type SlideshowSurfaceRuntimeProgramSource,
} from "./slideshow-surface-runtime-composition";

const SURFACE_ID = "surface00001" as SurfaceId;
const OTHER_SURFACE_ID = "surface00002" as SurfaceId;
const OWNER_ID = "controlown001" as EmbeddedNodeId;
const TARGET_ID = "controltgt001" as EmbeddedNodeId;

describe("createSlideshowSurfaceRuntimeComposition", () => {
  it("constructs an awaiting-start Presentation over one empty learner runtime", () => {
    const timeline: CompiledInternalClockSurfaceTimeline = Object.freeze({
      surfaceId: SURFACE_ID,
      durationMs: 1_000,
      cues: Object.freeze([]),
      waits: Object.freeze([]),
    });
    const program: SlideshowSurfaceRuntimeProgram = Object.freeze({
      presentation: Object.freeze({ timeline, autoAdvance: false }),
    });
    const programSource: SlideshowSurfaceRuntimeProgramSource = vi.fn((surfaceId) =>
      surfaceId === SURFACE_ID ? program : undefined,
    );
    const selectedProgram = programSource(SURFACE_ID);
    if (!selectedProgram) throw new Error("Expected the configured Surface program.");
    const getControlBinding = vi.fn();
    const activateSemanticTarget = vi.fn();
    const requestSurfaceChange = vi.fn(() => Result.ok());

    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: selectedProgram,
      controlBindings: { get: getControlBinding },
      semanticTargets: { activate: activateSemanticTarget },
      requestSurfaceChange,
    });

    expect(Object.isFrozen(composition)).toBe(true);
    expect(composition.surfaceId).toBe(SURFACE_ID);
    expect(Object.isFrozen(composition.learnerRuntime)).toBe(true);
    expect(composition.presentationSession?.getSnapshot()).toMatchObject({
      surfaceId: SURFACE_ID,
      phase: "awaiting-start",
      currentTimeMs: 0,
    });
    expect(getControlBinding).not.toHaveBeenCalled();
    expect(activateSemanticTarget).not.toHaveBeenCalled();
    expect(requestSurfaceChange).not.toHaveBeenCalled();

    composition.dispose();
  });

  it.each([
    {
      name: "learner program",
      program: {
        learnerInteractions: learnerProgram(OTHER_SURFACE_ID),
      } satisfies SlideshowSurfaceRuntimeProgram,
      expected:
        'Slideshow learner program Surface "surface00002" does not match active Surface "surface00001".',
    },
    {
      name: "Presentation Timeline",
      program: {
        learnerInteractions: learnerProgram(SURFACE_ID),
        presentation: {
          timeline: timeline(OTHER_SURFACE_ID),
          autoAdvance: false,
        },
      } satisfies SlideshowSurfaceRuntimeProgram,
      expected:
        'Slideshow Presentation Timeline Surface "surface00002" does not match active Surface "surface00001".',
    },
  ])("rejects a mismatched $name before subscribing", ({ program, expected }) => {
    const subscribe = vi.fn(() => vi.fn());
    const get = vi.fn(() => ({ ownerId: OWNER_ID, eventSource: { subscribe } }));

    expect(() =>
      createSlideshowSurfaceRuntimeComposition({
        surfaceId: SURFACE_ID,
        program,
        controlBindings: { get },
        semanticTargets: { activate: vi.fn() },
        requestSurfaceChange: vi.fn(() => Result.ok()),
      }),
    ).toThrow(expected);
    expect(get).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it("uses one learner runtime for rule turns and the Presentation gate", async () => {
    const events = createTestEventSource();
    const execute = vi.fn(
      async (_request: ControlCommandRequest): Promise<ControlCommandResult> => Result.ok(),
    );
    const activate = vi.fn(async (requestedId: EmbeddedNodeId) => ({
      kind: "reached" as const,
      requestedId,
    }));
    const binding = {
      ownerId: OWNER_ID,
      eventSource: events.eventSource,
      commandExecutor: { execute },
    };
    const when = { ownerId: OWNER_ID, targetId: TARGET_ID, type: "selected" } as const;
    const interactions = Object.freeze<CompiledSurfaceLearnerInteractionProgram>({
      surfaceId: SURFACE_ID,
      rulesByEvent: new Map([
        [
          createLearnerInteractionEventKey(when),
          [
            {
              id: "rule-command",
              when,
              conditions: [],
              commands: [
                {
                  kind: "target-command",
                  ownerId: OWNER_ID,
                  targetId: TARGET_ID,
                  type: "rule-command",
                },
              ],
            },
          ],
        ],
      ]),
    });
    const presentationTimeline = Object.freeze<CompiledInternalClockSurfaceTimeline>({
      surfaceId: SURFACE_ID,
      durationMs: 100,
      cues: [
        {
          id: "presentation-cue",
          atMs: 0,
          command: {
            kind: "target-command",
            ownerId: OWNER_ID,
            targetId: TARGET_ID,
            type: "presentation-command",
          },
        },
      ],
      waits: [
        {
          kind: "learner-wait",
          id: "learner-wait" as PresentationWaitId,
          atMs: 0,
          requirement: { kind: "event", ...when },
        },
      ],
    });
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: {
        learnerInteractions: interactions,
        presentation: { timeline: presentationTimeline, autoAdvance: false },
      },
      controlBindings: {
        get: () => binding,
      },
      semanticTargets: { activate },
      requestSurfaceChange: vi.fn(() => Result.ok()),
    });
    const report = vi.fn();
    composition.learnerRuntime.subscribeReports(report);
    const session = composition.presentationSession;
    if (!session) throw new Error("Expected a Presentation Session.");

    expect(session.getSnapshot().phase).toBe("awaiting-start");
    expect(events.subscriptionsStarted).toBe(1);
    expect(execute).not.toHaveBeenCalled();
    session.play();
    await flushPromises();
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", status: "waiting" },
    });
    expect(activate).toHaveBeenCalledWith(TARGET_ID, {
      origin: "configured-presentation",
      signal: expect.any(AbortSignal),
    });

    await events.emit({ targetId: TARGET_ID, type: "selected" });
    await flushPromises();

    expect(report).toHaveBeenCalledOnce();
    expect(execute.mock.calls.map(([request]) => request.type)).toEqual([
      "presentation-command",
      "rule-command",
    ]);
    expect(events.listenerCount).toBe(1);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", status: "ready" },
    });
    composition.dispose();
  });

  it("rolls back the learner runtime when Presentation construction throws", () => {
    const events = createTestEventSource();
    const constructionDefect = new Error("invalid Presentation policy");
    const throwingPresentation = {
      timeline: timeline(SURFACE_ID),
      get autoAdvance(): boolean {
        throw constructionDefect;
      },
    };
    const binding = { ownerId: OWNER_ID, eventSource: events.eventSource };

    expect(() =>
      createSlideshowSurfaceRuntimeComposition({
        surfaceId: SURFACE_ID,
        program: {
          learnerInteractions: learnerProgram(SURFACE_ID),
          presentation: throwingPresentation,
        },
        controlBindings: { get: () => binding },
        semanticTargets: { activate: vi.fn() },
        requestSurfaceChange: vi.fn(() => Result.ok()),
      }),
    ).toThrow(constructionDefect);
    expect(events.subscriptionsStarted).toBe(1);
    expect(events.unsubscriptionsCompleted).toBe(1);
    expect(events.listenerCount).toBe(0);
  });

  it("maps blocked learner navigation to the typed cancelled outcome", async () => {
    const events = createTestEventSource();
    const refusal: SurfaceChangeRefused = Object.freeze({
      reason: "surface-exit-blocked",
      activeSurfaceId: SURFACE_ID,
      targetSurfaceId: OTHER_SURFACE_ID,
      blockers: Object.freeze([
        Object.freeze({
          reason: "quiz-not-complete" as const,
          ownerId: "quiz-one",
          surfaceId: SURFACE_ID,
          attemptStatus: "in_progress" as const,
        }),
      ] as const),
    });
    const requestSurfaceChange = vi.fn((): SurfaceChangeResult => Result.err(refusal));
    const composition = createLearnerOnlyComposition(events, requestSurfaceChange);
    const report = vi.fn();
    composition.learnerRuntime.subscribeReports(report);

    await events.emit({ targetId: TARGET_ID, type: "selected" });
    await flushPromises();

    expect(composition.presentationSession).toBeUndefined();
    expect(requestSurfaceChange).toHaveBeenCalledWith(OTHER_SURFACE_ID);
    expect(report).toHaveBeenCalledWith(
      expect.objectContaining({
        commandExecutions: [
          {
            address: { ruleId: "rule-1", commandIndex: 0 },
            outcome: { kind: "navigation-cancelled" },
          },
        ],
        end: "completed",
      }),
    );
    expect(events.listenerCount).toBe(1);
    composition.dispose();
  });

  it.each([
    ["unknown Surface", new Error("unknown Slideshow Surface")],
    ["lifecycle", new Error("active Surface lifecycle changed")],
  ])("preserves a thrown $0 navigation defect", async (_name, defect) => {
    const events = createTestEventSource();
    const requestSurfaceChange = vi.fn((): SurfaceChangeResult => {
      throw defect;
    });
    const composition = createLearnerOnlyComposition(events, requestSurfaceChange);

    await expect(events.emit({ targetId: TARGET_ID, type: "selected" })).rejects.toBe(defect);

    expect(requestSurfaceChange).toHaveBeenCalledWith(OTHER_SURFACE_ID);
    expect(events.listenerCount).toBe(0);
    composition.dispose();
  });

  it("rejects an undeclared Surface-change error instead of converting it to cancellation", async () => {
    const events = createTestEventSource();
    const requestSurfaceChange = vi.fn(
      () => Result.err({ reason: "unexpected" }) as unknown as SurfaceChangeResult,
    );
    const composition = createLearnerOnlyComposition(events, requestSurfaceChange);

    let observedDefect: unknown;
    try {
      await events.emit({ targetId: TARGET_ID, type: "selected" });
    } catch (error) {
      observedDefect = error;
    } finally {
      composition.dispose();
    }

    expect(observedDefect).toEqual(
      new Error('Unexpected Slideshow Surface change error "unexpected".'),
    );
    expect(events.listenerCount).toBe(0);
  });

  it("uses an empty learner program as the Presentation gate", async () => {
    const events = createTestEventSource();
    const binding = { ownerId: OWNER_ID, eventSource: events.eventSource };
    const gateTimeline = Object.freeze<CompiledInternalClockSurfaceTimeline>({
      surfaceId: SURFACE_ID,
      durationMs: 100,
      cues: Object.freeze([]),
      waits: Object.freeze([
        {
          kind: "learner-wait",
          id: "empty-program-wait" as PresentationWaitId,
          atMs: 0,
          requirement: {
            kind: "event",
            ownerId: OWNER_ID,
            targetId: TARGET_ID,
            type: "selected",
          },
        },
      ]),
    });
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { presentation: { timeline: gateTimeline, autoAdvance: false } },
      controlBindings: { get: () => binding },
      semanticTargets: { activate: vi.fn() },
      requestSurfaceChange: vi.fn(() => Result.ok()),
    });
    const session = composition.presentationSession;
    if (!session) throw new Error("Expected a Presentation Session.");
    expect(events.subscriptionsStarted).toBe(0);

    session.play();
    await flushPromises();
    expect(events.subscriptionsStarted).toBe(1);
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", status: "waiting" },
    });

    await events.emit({ targetId: TARGET_ID, type: "selected" });
    await flushPromises();
    expect(session.getSnapshot()).toMatchObject({
      phase: "held",
      hold: { kind: "learner", status: "ready" },
    });
    composition.dispose();
    expect(events.listenerCount).toBe(0);
  });

  it("disposes Presentation before learner subscriptions without stale reports", async () => {
    const disposalOrder: string[] = [];
    const events = createTestEventSource(() => disposalOrder.push("learner"));
    const pendingCommand = deferred<ControlCommandResult>();
    let commandSignal: AbortSignal | undefined;
    const execute = vi.fn(({ signal }: { readonly signal: AbortSignal }) => {
      commandSignal = signal;
      signal.addEventListener("abort", () => disposalOrder.push("presentation"), { once: true });
      return pendingCommand.promise;
    });
    const binding = {
      ownerId: OWNER_ID,
      eventSource: events.eventSource,
      commandExecutor: { execute },
    };
    const disposalTimeline = Object.freeze<CompiledInternalClockSurfaceTimeline>({
      surfaceId: SURFACE_ID,
      durationMs: 100,
      cues: [
        {
          id: "pending-cue",
          atMs: 0,
          command: {
            kind: "target-command",
            ownerId: OWNER_ID,
            targetId: TARGET_ID,
            type: "pending-command",
          },
        },
      ],
      waits: [
        { kind: "manual-wait", id: "manual-wait" as PresentationWaitId, atMs: 0 },
      ],
    });
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: {
        learnerInteractions: learnerProgram(SURFACE_ID),
        presentation: { timeline: disposalTimeline, autoAdvance: false },
      },
      controlBindings: { get: () => binding },
      semanticTargets: {
        activate: vi.fn(async (requestedId: EmbeddedNodeId) => ({
          kind: "reached" as const,
          requestedId,
        })),
      },
      requestSurfaceChange: vi.fn(() => Result.ok()),
    });
    const learnerReport = vi.fn();
    const cueReport = vi.fn();
    composition.learnerRuntime.subscribeReports(learnerReport);
    const session = composition.presentationSession;
    if (!session) throw new Error("Expected a Presentation Session.");
    session.subscribeCueReports(cueReport);
    session.play();
    await flushPromises();
    expect(execute).toHaveBeenCalledOnce();

    composition.dispose();
    composition.dispose();

    expect(commandSignal?.aborted).toBe(true);
    expect(disposalOrder).toEqual(["presentation", "learner"]);
    expect(events.unsubscriptionsCompleted).toBe(1);
    expect(events.listenerCount).toBe(0);
    pendingCommand.resolve(Result.ok());
    await flushPromises();
    expect(learnerReport).not.toHaveBeenCalled();
    expect(cueReport).not.toHaveBeenCalled();
    expect(() => session.getSnapshot()).toThrow(
      "Cannot read a disposed Presentation Playback Session.",
    );
  });

  it("checks cancellation before committing learner Surface navigation", async () => {
    const events = createTestEventSource();
    const pendingCommand = deferred<ControlCommandResult>();
    let commandSignal: AbortSignal | undefined;
    const execute = vi.fn(({ signal }: { readonly signal: AbortSignal }) => {
      commandSignal = signal;
      return pendingCommand.promise;
    });
    const binding = {
      ownerId: OWNER_ID,
      eventSource: events.eventSource,
      commandExecutor: { execute },
    };
    const requestSurfaceChange = vi.fn(() => Result.ok());
    const report = vi.fn();
    const when = { ownerId: OWNER_ID, targetId: TARGET_ID, type: "selected" } as const;
    const interactions: CompiledSurfaceLearnerInteractionProgram = {
      surfaceId: SURFACE_ID,
      rulesByEvent: new Map([
        [
          createLearnerInteractionEventKey(when),
          [
            {
              id: "cancel-before-navigation",
              when,
              conditions: [],
              commands: [
                {
                  kind: "target-command",
                  ownerId: OWNER_ID,
                  targetId: TARGET_ID,
                  type: "pending-command",
                },
                { kind: "navigate-surface", surfaceId: OTHER_SURFACE_ID },
              ],
            },
          ],
        ],
      ]),
    };
    const composition = createSlideshowSurfaceRuntimeComposition({
      surfaceId: SURFACE_ID,
      program: { learnerInteractions: interactions },
      controlBindings: { get: () => binding },
      semanticTargets: { activate: vi.fn() },
      requestSurfaceChange,
    });
    composition.learnerRuntime.subscribeReports(report);

    const turn = events.emit({ targetId: TARGET_ID, type: "selected" });
    await flushPromises();
    expect(execute).toHaveBeenCalledOnce();
    composition.dispose();
    pendingCommand.resolve(Result.ok());
    await turn;
    await flushPromises();

    expect(commandSignal?.aborted).toBe(true);
    expect(requestSurfaceChange).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
    expect(events.listenerCount).toBe(0);
  });
});

function createLearnerOnlyComposition(
  events: ReturnType<typeof createTestEventSource>,
  requestSurfaceChange: () => SurfaceChangeResult,
) {
  const binding = { ownerId: OWNER_ID, eventSource: events.eventSource };
  return createSlideshowSurfaceRuntimeComposition({
    surfaceId: SURFACE_ID,
    program: { learnerInteractions: learnerProgram(SURFACE_ID) },
    controlBindings: { get: () => binding },
    semanticTargets: { activate: vi.fn() },
    requestSurfaceChange,
  });
}

function timeline(surfaceId: SurfaceId): CompiledInternalClockSurfaceTimeline {
  return Object.freeze({
    surfaceId,
    durationMs: 1_000,
    cues: Object.freeze([]),
    waits: Object.freeze([]),
  });
}

function learnerProgram(surfaceId: SurfaceId): CompiledSurfaceLearnerInteractionProgram {
  const when = { ownerId: OWNER_ID, targetId: TARGET_ID, type: "selected" } as const;
  return Object.freeze({
    surfaceId,
    rulesByEvent: new Map([
      [
        createLearnerInteractionEventKey(when),
        Object.freeze([
          Object.freeze({
            id: "rule-1",
            when,
            conditions: Object.freeze([]),
            commands: Object.freeze([
              { kind: "navigate-surface" as const, surfaceId: OTHER_SURFACE_ID },
            ]) as readonly [{ readonly kind: "navigate-surface"; readonly surfaceId: SurfaceId }],
          }),
        ]),
      ],
    ]),
  });
}

function createTestEventSource(onUnsubscribe: () => void = () => undefined): {
  readonly eventSource: EventSource;
  readonly subscriptionsStarted: number;
  readonly unsubscriptionsCompleted: number;
  readonly listenerCount: number;
  emit(event: ControlEvent): Promise<void>;
} {
  const listeners = new Set<ControlEventListener>();
  let subscriptionsStarted = 0;
  let unsubscriptionsCompleted = 0;
  return {
    eventSource: {
      subscribe(listener) {
        subscriptionsStarted += 1;
        listeners.add(listener);
        let subscribed = true;
        return () => {
          if (!subscribed) return;
          subscribed = false;
          listeners.delete(listener);
          unsubscriptionsCompleted += 1;
          onUnsubscribe();
        };
      },
    },
    get subscriptionsStarted() {
      return subscriptionsStarted;
    },
    get listenerCount() {
      return listeners.size;
    },
    get unsubscriptionsCompleted() {
      return unsubscriptionsCompleted;
    },
    async emit(event) {
      await Promise.all(
        [...listeners].map((listener) =>
          Promise.resolve(
            (listener as (received: ControlEvent) => Promise<void> | undefined)(event),
          ),
        ),
      );
    },
  };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
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
