import { describe, expect, it, vi } from "vite-plus/test";

import {
  LearningEventSchema,
  type LearningEventPort,
  type LearningEvent,
} from "../../host/ports/learning-events";
import { LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS, createLearningEventSession } from "./session";
import { LEARNING_EVENT_VERBS, type CoreLearningEventInput } from "./catalogue";

const ROOT_ACTIVITY_ID = "https://example.com/courses/course-1";
const STARTED_AT = "2026-07-25T10:00:00.000Z";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises(): Promise<void> {
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
}

function learningInput(blockId = "block-1"): CoreLearningEventInput {
  return {
    type: "learner-activity.interacted",
    blockId,
    activityKind: "flashcard",
  };
}

function createSequentialUuidFactory() {
  let sequence = 0;
  return vi.fn(() => {
    sequence += 1;
    return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
  });
}

function createHarness(acceptImplementation: LearningEventPort["accept"] = async () => undefined) {
  let wallTime = Date.parse(STARTED_AT);
  let monotonicTime = 1_000;
  const createUuid = createSequentialUuidFactory();
  const now = vi.fn(() => new Date(wallTime));
  const monotonicNow = vi.fn(() => monotonicTime);
  const accept = vi.fn<LearningEventPort["accept"]>(acceptImplementation);
  const port: LearningEventPort = {
    rootActivityId: ROOT_ACTIVITY_ID,
    accept,
  };
  const session = createLearningEventSession({
    port,
    contentTitle: "Course One",
    createUuid,
    now,
    monotonicNow,
  });

  return {
    session,
    accept,
    createUuid,
    now,
    monotonicNow,
    setWallTime: (value: string) => {
      wallTime = Date.parse(value);
    },
    setMonotonicTime: (value: number) => {
      monotonicTime = value;
    },
  };
}

function expectDeeplyFrozen(value: unknown): void {
  if (typeof value !== "object" || value === null) return;

  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    expectDeeplyFrozen(child);
  }
}

describe("createLearningEventSession", () => {
  it("validates the root Activity IRI before returning a dormant session", () => {
    expect(() =>
      createLearningEventSession({
        port: {
          rootActivityId: "not an absolute IRI",
          accept: async () => undefined,
        },
        contentTitle: "Course One",
        createUuid: createSequentialUuidFactory(),
        now: () => new Date(STARTED_AT),
        monotonicNow: () => 0,
      }),
    ).toThrow();

    const { session } = createHarness();
    const state = session.getState();

    expect(session.rootActivityId).toBe(ROOT_ACTIVITY_ID);
    expect(Object.isFrozen(session)).toBe(true);
    expect(state).toEqual({ status: "dormant" });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("starts explicitly once with initialized first", async () => {
    const { session, accept, createUuid, now } = createHarness();

    session.start();
    session.start();
    await flushPromises();

    expect(session.getState()).toEqual({
      status: "active",
      startedAt: STARTED_AT,
      acceptance: "accepting",
    });
    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept.mock.calls[0]?.[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      timestamp: STARTED_AT,
      verb: LEARNING_EVENT_VERBS.initialized,
    });
    expect(LearningEventSchema.safeParse(accept.mock.calls[0]?.[0]).success).toBe(true);
    expect(createUuid).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(1);
  });

  it("lazily initializes before the first valid learning draft", async () => {
    const { session, accept } = createHarness();

    session.record(learningInput());
    await flushPromises();

    expect(accept.mock.calls.map(([event]) => event.verb.id)).toEqual([
      LEARNING_EVENT_VERBS.initialized.id,
      LEARNING_EVENT_VERBS.interacted.id,
    ]);
  });

  it("contains invalid producer input and caller-owned lifecycle inputs", async () => {
    const { session, accept, createUuid, now, monotonicNow } = createHarness();
    const invalidInput = {
      type: "not.registered",
    } as unknown as CoreLearningEventInput;

    session.record(invalidInput);
    session.record({ type: "session.initialized" });
    session.record({ type: "session.terminated", durationMs: 0 });
    await flushPromises();

    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: null,
      acceptance: "failed",
    });
    expect(accept).not.toHaveBeenCalled();
    expect(createUuid).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(monotonicNow).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "a throwing assessment definition getter",
      input: () => ({
        type: "assessment.answered",
        targetId: "question-one",
        get definition() {
          throw new Error("private definition unavailable");
        },
      }),
    },
    {
      name: "a hostile assessment definition proxy",
      input: () => ({
        type: "assessment.answered",
        targetId: "question-one",
        definition: new Proxy(
          {},
          {
            get() {
              throw new Error("hostile definition access");
            },
          },
        ),
      }),
    },
  ])("contains $name before lazy initialization", async ({ input }) => {
    const { session, accept, createUuid, now, monotonicNow } = createHarness();

    expect(() => session.record(input() as unknown as CoreLearningEventInput)).not.toThrow();
    expect(() => session.record(learningInput("suppressed"))).not.toThrow();
    await flushPromises();

    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: null,
      acceptance: "failed",
    });
    expect(accept).not.toHaveBeenCalled();
    expect(createUuid).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(monotonicNow).not.toHaveBeenCalled();
  });

  it("keeps block and Core authority recording paths separate on the same session type", async () => {
    const publicHarness = createHarness();

    publicHarness.session.recordBlock({ type: "content.completed", completion: true });
    await flushPromises();

    expect(publicHarness.accept).not.toHaveBeenCalled();
    expect(publicHarness.session.getState()).toEqual({
      status: "terminated",
      startedAt: null,
      acceptance: "failed",
    });

    const coreHarness = createHarness();
    coreHarness.session.record({ type: "content.completed", completion: true });
    await flushPromises();

    expect(coreHarness.accept.mock.calls.map(([event]) => event.verb.display.en)).toEqual([
      "initialized",
      "completed",
    ]);
  });

  it("assigns stable distinct identity at admission while acceptance is delayed", async () => {
    const firstAcceptance = deferred<void>();
    const { session, accept, createUuid, now, setWallTime } = createHarness(
      () => firstAcceptance.promise,
    );

    session.start();
    session.record(learningInput("block-1"));
    setWallTime("2030-01-01T00:00:00.000Z");
    await flushPromises();

    expect(accept).toHaveBeenCalledTimes(1);
    expect(createUuid).toHaveBeenCalledTimes(2);
    expect(now).toHaveBeenCalledTimes(2);
    expect(accept.mock.calls[0]?.[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      timestamp: STARTED_AT,
    });

    firstAcceptance.resolve();
    await flushPromises();

    expect(accept).toHaveBeenCalledTimes(2);
    expect(accept.mock.calls[1]?.[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000002",
      timestamp: STARTED_AT,
    });
    expect(accept.mock.calls[0]?.[0].id).not.toBe(accept.mock.calls[1]?.[0].id);
  });

  it("serializes acceptance and closes with one final terminated Event", async () => {
    const acceptances: Array<ReturnType<typeof deferred<void>>> = [];
    const { session, accept, createUuid, setMonotonicTime } = createHarness(() => {
      const acceptance = deferred<void>();
      acceptances.push(acceptance);
      return acceptance.promise;
    });

    session.start();
    session.record(learningInput("block-1"));
    session.record(learningInput("block-2"));
    setMonotonicTime(1_090.067);
    const termination = session.terminate();
    const repeatedTermination = session.terminate();
    session.record(learningInput("ignored"));
    session.start();

    expect(termination).toBe(repeatedTermination);
    expect(session.getState()).toEqual({
      status: "terminating",
      startedAt: STARTED_AT,
      acceptance: "accepting",
    });
    expect(createUuid).toHaveBeenCalledTimes(4);

    await flushPromises();
    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept.mock.calls[0]?.[0].verb.id).toBe(LEARNING_EVENT_VERBS.initialized.id);

    acceptances[0]?.resolve();
    await flushPromises();
    expect(accept).toHaveBeenCalledTimes(2);

    acceptances[1]?.resolve();
    await flushPromises();
    expect(accept).toHaveBeenCalledTimes(3);

    acceptances[2]?.resolve();
    await flushPromises();
    expect(accept).toHaveBeenCalledTimes(4);
    expect(accept.mock.calls.map(([event]) => event.verb.id)).toEqual([
      LEARNING_EVENT_VERBS.initialized.id,
      LEARNING_EVENT_VERBS.interacted.id,
      LEARNING_EVENT_VERBS.interacted.id,
      LEARNING_EVENT_VERBS.terminated.id,
    ]);
    expect(accept.mock.calls[3]?.[0].result?.duration).toBe("PT0.09S");

    let terminationSettled = false;
    void termination.then(() => {
      terminationSettled = true;
    });
    await flushPromises();
    expect(terminationSettled).toBe(false);

    acceptances[3]?.resolve();
    await termination;

    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: STARTED_AT,
      acceptance: "accepted",
    });
  });

  it.each([
    { start: 50.125, finish: 124.999, expected: "PT0.07S" },
    { start: 100, finish: 99, expected: "PT0S" },
  ])(
    "uses non-negative hundredth-second monotonic duration for $start to $finish",
    async ({ start, finish, expected }) => {
      const { session, accept, setMonotonicTime } = createHarness();

      setMonotonicTime(start);
      session.start();
      setMonotonicTime(finish);
      await session.terminate();
      await flushPromises();

      expect(accept.mock.calls.at(-1)?.[0].verb.id).toBe(LEARNING_EVENT_VERBS.terminated.id);
      expect(accept.mock.calls.at(-1)?.[0].result?.duration).toBe(expected);
    },
  );

  it("terminates a dormant session without starting acceptance", async () => {
    const { session, accept, createUuid, now, monotonicNow } = createHarness();

    const termination = session.terminate();

    expect(termination).toBe(session.terminate());
    await termination;
    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: null,
      acceptance: "not-started",
    });
    expect(accept).not.toHaveBeenCalled();
    expect(createUuid).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(monotonicNow).not.toHaveBeenCalled();
  });

  it("isolates asynchronous rejection and discards every waiting event", async () => {
    const firstAcceptance = deferred<void>();
    const { session, accept, createUuid } = createHarness(() => firstAcceptance.promise);

    session.start();
    session.record(learningInput("block-1"));
    session.record(learningInput("block-2"));
    await flushPromises();
    expect(accept).toHaveBeenCalledTimes(1);
    const rejectedEvent = accept.mock.calls[0]?.[0];
    expect(rejectedEvent).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      timestamp: STARTED_AT,
      verb: LEARNING_EVENT_VERBS.initialized,
    });

    firstAcceptance.reject(new Error("host unavailable"));
    await flushPromises();

    expect(session.getState()).toEqual({
      status: "active",
      startedAt: STARTED_AT,
      acceptance: "failed",
    });
    expect(accept).toHaveBeenCalledTimes(1);

    const admittedBeforeFailure = createUuid.mock.calls.length;
    expect(() => session.record(learningInput("ignored"))).not.toThrow();
    expect(createUuid).toHaveBeenCalledTimes(admittedBeforeFailure);
    expect(accept.mock.calls[0]?.[0]).toBe(rejectedEvent);
    await expect(session.terminate()).resolves.toBeUndefined();
    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: STARTED_AT,
      acceptance: "failed",
    });
  });

  it("handles a synchronous port throw behind the asynchronous seam", async () => {
    const { session, accept } = createHarness(() => {
      throw new Error("synchronous adapter failure");
    });

    expect(() => session.start()).not.toThrow();
    expect(accept).not.toHaveBeenCalled();
    await flushPromises();

    expect(accept).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({
      status: "active",
      startedAt: STARTED_AT,
      acceptance: "failed",
    });
  });

  it("settles termination without later accepts when acceptance rejects during close", async () => {
    const firstAcceptance = deferred<void>();
    const { session, accept } = createHarness(() => firstAcceptance.promise);

    session.start();
    session.record(learningInput());
    const termination = session.terminate();
    await flushPromises();

    firstAcceptance.reject(new Error("not accepted"));
    await expect(termination).resolves.toBeUndefined();

    expect(accept).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: STARTED_AT,
      acceptance: "failed",
    });
  });

  it("fails open at the 257th pending event without assigning it identity", async () => {
    const firstAcceptance = deferred<void>();
    const { session, accept, createUuid, now } = createHarness(() => firstAcceptance.promise);

    session.start();
    for (let index = 1; index < LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS; index += 1) {
      session.record(learningInput(`block-${index}`));
    }
    expect(createUuid).toHaveBeenCalledTimes(LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS);
    expect(now).toHaveBeenCalledTimes(LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS);

    expect(() => session.record(learningInput("overflow"))).not.toThrow();
    expect(createUuid).toHaveBeenCalledTimes(LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS);
    expect(now).toHaveBeenCalledTimes(LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS);
    expect(session.getState()).toEqual({
      status: "active",
      startedAt: STARTED_AT,
      acceptance: "failed",
    });

    await flushPromises();
    expect(accept).not.toHaveBeenCalled();
    firstAcceptance.resolve();
    await flushPromises();
    expect(accept).not.toHaveBeenCalled();
    await expect(session.terminate()).resolves.toBeUndefined();
  });

  it("fails termination rather than exceeding a full pending queue", async () => {
    const firstAcceptance = deferred<void>();
    const { session, accept, createUuid, now } = createHarness(() => firstAcceptance.promise);

    session.start();
    for (let index = 1; index < LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS; index += 1) {
      session.record(learningInput(`block-${index}`));
    }

    await expect(session.terminate()).resolves.toBeUndefined();

    expect(createUuid).toHaveBeenCalledTimes(LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS);
    expect(now).toHaveBeenCalledTimes(LEARNING_EVENT_SESSION_MAX_PENDING_EVENTS);
    expect(accept).not.toHaveBeenCalled();
    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: STARTED_AT,
      acceptance: "failed",
    });
  });

  it.each([
    {
      name: "malformed UUID",
      createUuid: () => "not-a-uuid",
      now: () => new Date(STARTED_AT),
    },
    {
      name: "throwing UUID factory",
      createUuid: () => {
        throw new Error("uuid unavailable");
      },
      now: () => new Date(STARTED_AT),
    },
    {
      name: "invalid wall clock",
      createUuid: () => "00000000-0000-4000-8000-000000000001",
      now: () => new Date(Number.NaN),
    },
    {
      name: "throwing wall clock",
      createUuid: () => "00000000-0000-4000-8000-000000000001",
      now: () => {
        throw new Error("clock unavailable");
      },
    },
  ])("contains initial $name failure", async ({ createUuid, now }) => {
    const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
    const session = createLearningEventSession({
      port: { rootActivityId: ROOT_ACTIVITY_ID, accept },
      contentTitle: "Course One",
      createUuid,
      now,
      monotonicNow: () => 0,
    });

    expect(() => session.start()).not.toThrow();
    await flushPromises();

    expect(accept).not.toHaveBeenCalled();
    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: null,
      acceptance: "failed",
    });
    await expect(session.terminate()).resolves.toBeUndefined();
  });

  it("preserves the start instant when later identity materialization fails", async () => {
    const createUuid = vi
      .fn<() => string>()
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("invalid");
    const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
    const session = createLearningEventSession({
      port: { rootActivityId: ROOT_ACTIVITY_ID, accept },
      contentTitle: "Course One",
      createUuid,
      now: () => new Date(STARTED_AT),
      monotonicNow: () => 0,
    });

    session.start();
    expect(() => session.record(learningInput())).not.toThrow();
    await flushPromises();

    expect(accept).not.toHaveBeenCalled();
    expect(session.getState()).toEqual({
      status: "active",
      startedAt: STARTED_AT,
      acceptance: "failed",
    });
    await expect(session.terminate()).resolves.toBeUndefined();
  });

  it("deeply freezes a validated clone before exposing it to the port", async () => {
    const received: LearningEvent[] = [];
    const accept = vi.fn<LearningEventPort["accept"]>(async (event) => {
      expectDeeplyFrozen(event);
      expect(() => {
        (event.object as { id: string }).id = "https://attacker.example/mutated";
      }).toThrow();
      received.push(event);
    });
    const { session } = createHarness(accept);
    const input = structuredClone(learningInput()) as CoreLearningEventInput;

    session.record(input);
    (input as { blockId: string }).blockId = "caller-mutation";
    await flushPromises();

    expect(received).toHaveLength(2);
    expect(received[1]?.verb.display.en).toBe("interacted");
    expect(received[1]?.object.id).not.toContain("caller-mutation");
  });
});
