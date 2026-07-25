import { describe, expect, it, vi } from "vite-plus/test";

import {
  XapiStatementTemplateSchema,
  type XapiPort,
  type XapiStatementDraft,
  type XapiStatementTemplate,
} from "../../host/ports/xapi";
import { XAPI_SESSION_MAX_PENDING_STATEMENTS, createXapiSession } from "./index";
import {
  XAPI_VERBS,
  buildInitializedStatementDraft,
  buildLearnerActivityInteractedStatementDraft,
  buildTerminatedStatementDraft,
} from "./statement-catalogue";

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

function learningDraft(blockId = "block-1"): XapiStatementDraft {
  return buildLearnerActivityInteractedStatementDraft({
    rootActivityId: ROOT_ACTIVITY_ID,
    blockId,
    activityKind: "flashcard",
  });
}

function createSequentialUuidFactory() {
  let sequence = 0;
  return vi.fn(() => {
    sequence += 1;
    return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
  });
}

function createHarness(sendImplementation: XapiPort["send"] = async () => undefined) {
  let wallTime = Date.parse(STARTED_AT);
  let monotonicTime = 1_000;
  const createUuid = createSequentialUuidFactory();
  const now = vi.fn(() => new Date(wallTime));
  const monotonicNow = vi.fn(() => monotonicTime);
  const send = vi.fn<XapiPort["send"]>(sendImplementation);
  const port: XapiPort = {
    activityId: ROOT_ACTIVITY_ID,
    send,
  };
  const session = createXapiSession({
    port,
    courseTitle: "Course One",
    createUuid,
    now,
    monotonicNow,
  });

  return {
    session,
    send,
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

describe("createXapiSession", () => {
  it("validates the root Activity IRI before returning a dormant session", () => {
    expect(() =>
      createXapiSession({
        port: {
          activityId: "not an absolute IRI",
          send: async () => undefined,
        },
        courseTitle: "Course One",
        createUuid: createSequentialUuidFactory(),
        now: () => new Date(STARTED_AT),
        monotonicNow: () => 0,
      }),
    ).toThrow();

    const { session } = createHarness();
    const state = session.getState();

    expect(state).toEqual({ status: "dormant" });
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("starts explicitly once with initialized first", async () => {
    const { session, send, createUuid, now } = createHarness();

    session.start();
    session.start();
    await flushPromises();

    expect(session.getState()).toEqual({
      status: "active",
      startedAt: STARTED_AT,
      delivery: "accepting",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      timestamp: STARTED_AT,
      verb: XAPI_VERBS.initialized,
    });
    expect(XapiStatementTemplateSchema.safeParse(send.mock.calls[0]?.[0]).success).toBe(true);
    expect(createUuid).toHaveBeenCalledTimes(1);
    expect(now).toHaveBeenCalledTimes(1);
  });

  it("lazily initializes before the first valid learning draft", async () => {
    const { session, send } = createHarness();

    session.record(learningDraft());
    await flushPromises();

    expect(send.mock.calls.map(([statement]) => statement.verb.id)).toEqual([
      XAPI_VERBS.initialized.id,
      XAPI_VERBS.interacted.id,
    ]);
  });

  it("ignores invalid and caller-owned lifecycle drafts without leaving dormancy", async () => {
    const { session, send, createUuid, now, monotonicNow } = createHarness();
    const invalidDraft = {
      verb: { id: "invalid", display: { en: "invalid" } },
      object: { objectType: "Activity", id: "invalid" },
    } as XapiStatementDraft;

    session.record(invalidDraft);
    session.record(
      buildInitializedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        title: "Course One",
      }),
    );
    session.record(
      buildTerminatedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        title: "Course One",
        durationMs: 0,
      }),
    );
    await flushPromises();

    expect(session.getState()).toEqual({ status: "dormant" });
    expect(send).not.toHaveBeenCalled();
    expect(createUuid).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(monotonicNow).not.toHaveBeenCalled();
  });

  it("assigns stable distinct identity at admission while acceptance is delayed", async () => {
    const firstAcceptance = deferred<void>();
    const { session, send, createUuid, now, setWallTime } = createHarness(
      () => firstAcceptance.promise,
    );

    session.start();
    session.record(learningDraft("block-1"));
    setWallTime("2030-01-01T00:00:00.000Z");
    await flushPromises();

    expect(send).toHaveBeenCalledTimes(1);
    expect(createUuid).toHaveBeenCalledTimes(2);
    expect(now).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000001",
      timestamp: STARTED_AT,
    });

    firstAcceptance.resolve();
    await flushPromises();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]?.[0]).toMatchObject({
      id: "00000000-0000-4000-8000-000000000002",
      timestamp: STARTED_AT,
    });
    expect(send.mock.calls[0]?.[0].id).not.toBe(send.mock.calls[1]?.[0].id);
  });

  it("serializes delivery and closes with one final terminated Statement", async () => {
    const acceptances: Array<ReturnType<typeof deferred<void>>> = [];
    const { session, send, createUuid, setMonotonicTime } = createHarness(() => {
      const acceptance = deferred<void>();
      acceptances.push(acceptance);
      return acceptance.promise;
    });

    session.start();
    session.record(learningDraft("block-1"));
    session.record(learningDraft("block-2"));
    setMonotonicTime(1_090.067);
    const termination = session.terminate();
    const repeatedTermination = session.terminate();
    session.record(learningDraft("ignored"));
    session.start();

    expect(termination).toBe(repeatedTermination);
    expect(session.getState()).toEqual({
      status: "terminating",
      startedAt: STARTED_AT,
      delivery: "accepting",
    });
    expect(createUuid).toHaveBeenCalledTimes(4);

    await flushPromises();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].verb.id).toBe(XAPI_VERBS.initialized.id);

    acceptances[0]?.resolve();
    await flushPromises();
    expect(send).toHaveBeenCalledTimes(2);

    acceptances[1]?.resolve();
    await flushPromises();
    expect(send).toHaveBeenCalledTimes(3);

    acceptances[2]?.resolve();
    await flushPromises();
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls.map(([statement]) => statement.verb.id)).toEqual([
      XAPI_VERBS.initialized.id,
      XAPI_VERBS.interacted.id,
      XAPI_VERBS.interacted.id,
      XAPI_VERBS.terminated.id,
    ]);
    expect(send.mock.calls[3]?.[0].result?.duration).toBe("PT0.09S");

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
      delivery: "accepted",
    });
  });

  it.each([
    { start: 50.125, finish: 124.999, expected: "PT0.07S" },
    { start: 100, finish: 99, expected: "PT0S" },
  ])(
    "uses non-negative hundredth-second monotonic duration for $start to $finish",
    async ({ start, finish, expected }) => {
      const { session, send, setMonotonicTime } = createHarness();

      setMonotonicTime(start);
      session.start();
      setMonotonicTime(finish);
      await session.terminate();
      await flushPromises();

      expect(send.mock.calls.at(-1)?.[0].verb.id).toBe(XAPI_VERBS.terminated.id);
      expect(send.mock.calls.at(-1)?.[0].result?.duration).toBe(expected);
    },
  );

  it("terminates a dormant session without starting delivery", async () => {
    const { session, send, createUuid, now, monotonicNow } = createHarness();

    const termination = session.terminate();

    expect(termination).toBe(session.terminate());
    await termination;
    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: null,
      delivery: "not-started",
    });
    expect(send).not.toHaveBeenCalled();
    expect(createUuid).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(monotonicNow).not.toHaveBeenCalled();
  });

  it("isolates asynchronous rejection and discards every waiting template", async () => {
    const firstAcceptance = deferred<void>();
    const { session, send, createUuid } = createHarness(() => firstAcceptance.promise);

    session.start();
    session.record(learningDraft("block-1"));
    session.record(learningDraft("block-2"));
    await flushPromises();
    expect(send).toHaveBeenCalledTimes(1);

    firstAcceptance.reject(new Error("host unavailable"));
    await flushPromises();

    expect(session.getState()).toEqual({
      status: "active",
      startedAt: STARTED_AT,
      delivery: "failed",
    });
    expect(send).toHaveBeenCalledTimes(1);

    const admittedBeforeFailure = createUuid.mock.calls.length;
    expect(() => session.record(learningDraft("ignored"))).not.toThrow();
    expect(createUuid).toHaveBeenCalledTimes(admittedBeforeFailure);
    await expect(session.terminate()).resolves.toBeUndefined();
    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: STARTED_AT,
      delivery: "failed",
    });
  });

  it("handles a synchronous port throw behind the asynchronous seam", async () => {
    const { session, send } = createHarness(() => {
      throw new Error("synchronous adapter failure");
    });

    expect(() => session.start()).not.toThrow();
    expect(send).not.toHaveBeenCalled();
    await flushPromises();

    expect(send).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({
      status: "active",
      startedAt: STARTED_AT,
      delivery: "failed",
    });
  });

  it("settles termination without later sends when acceptance rejects during close", async () => {
    const firstAcceptance = deferred<void>();
    const { session, send } = createHarness(() => firstAcceptance.promise);

    session.start();
    session.record(learningDraft());
    const termination = session.terminate();
    await flushPromises();

    firstAcceptance.reject(new Error("not accepted"));
    await expect(termination).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: STARTED_AT,
      delivery: "failed",
    });
  });

  it("fails open at the 257th pending template without assigning it identity", async () => {
    const firstAcceptance = deferred<void>();
    const { session, send, createUuid, now } = createHarness(() => firstAcceptance.promise);

    session.start();
    for (let index = 1; index < XAPI_SESSION_MAX_PENDING_STATEMENTS; index += 1) {
      session.record(learningDraft(`block-${index}`));
    }
    expect(createUuid).toHaveBeenCalledTimes(XAPI_SESSION_MAX_PENDING_STATEMENTS);
    expect(now).toHaveBeenCalledTimes(XAPI_SESSION_MAX_PENDING_STATEMENTS);

    expect(() => session.record(learningDraft("overflow"))).not.toThrow();
    expect(createUuid).toHaveBeenCalledTimes(XAPI_SESSION_MAX_PENDING_STATEMENTS);
    expect(now).toHaveBeenCalledTimes(XAPI_SESSION_MAX_PENDING_STATEMENTS);
    expect(session.getState()).toEqual({
      status: "active",
      startedAt: STARTED_AT,
      delivery: "failed",
    });

    await flushPromises();
    expect(send).not.toHaveBeenCalled();
    firstAcceptance.resolve();
    await flushPromises();
    expect(send).not.toHaveBeenCalled();
    await expect(session.terminate()).resolves.toBeUndefined();
  });

  it("fails termination rather than exceeding a full pending queue", async () => {
    const firstAcceptance = deferred<void>();
    const { session, send, createUuid, now } = createHarness(() => firstAcceptance.promise);

    session.start();
    for (let index = 1; index < XAPI_SESSION_MAX_PENDING_STATEMENTS; index += 1) {
      session.record(learningDraft(`block-${index}`));
    }

    await expect(session.terminate()).resolves.toBeUndefined();

    expect(createUuid).toHaveBeenCalledTimes(XAPI_SESSION_MAX_PENDING_STATEMENTS);
    expect(now).toHaveBeenCalledTimes(XAPI_SESSION_MAX_PENDING_STATEMENTS);
    expect(send).not.toHaveBeenCalled();
    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: STARTED_AT,
      delivery: "failed",
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
    const send = vi.fn<XapiPort["send"]>(async () => undefined);
    const session = createXapiSession({
      port: { activityId: ROOT_ACTIVITY_ID, send },
      courseTitle: "Course One",
      createUuid,
      now,
      monotonicNow: () => 0,
    });

    expect(() => session.start()).not.toThrow();
    await flushPromises();

    expect(send).not.toHaveBeenCalled();
    expect(session.getState()).toEqual({
      status: "terminated",
      startedAt: null,
      delivery: "failed",
    });
    await expect(session.terminate()).resolves.toBeUndefined();
  });

  it("preserves the start instant when later identity materialization fails", async () => {
    const createUuid = vi
      .fn<() => string>()
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
      .mockReturnValueOnce("invalid");
    const send = vi.fn<XapiPort["send"]>(async () => undefined);
    const session = createXapiSession({
      port: { activityId: ROOT_ACTIVITY_ID, send },
      courseTitle: "Course One",
      createUuid,
      now: () => new Date(STARTED_AT),
      monotonicNow: () => 0,
    });

    session.start();
    expect(() => session.record(learningDraft())).not.toThrow();
    await flushPromises();

    expect(send).not.toHaveBeenCalled();
    expect(session.getState()).toEqual({
      status: "active",
      startedAt: STARTED_AT,
      delivery: "failed",
    });
    await expect(session.terminate()).resolves.toBeUndefined();
  });

  it("deeply freezes a validated clone before exposing it to the port", async () => {
    const received: XapiStatementTemplate[] = [];
    const send = vi.fn<XapiPort["send"]>(async (statement) => {
      expectDeeplyFrozen(statement);
      expect(() => {
        (statement.object as { id: string }).id = "https://attacker.example/mutated";
      }).toThrow();
      received.push(statement);
    });
    const { session } = createHarness(send);
    const draft = structuredClone(learningDraft()) as XapiStatementDraft;

    session.record(draft);
    (draft.verb.display as Record<string, string>).en = "mutated";
    (draft.object as { id: string }).id = "https://attacker.example/caller-mutation";
    await flushPromises();

    expect(received).toHaveLength(2);
    expect(received[1]?.verb.display.en).toBe("interacted");
    expect(received[1]?.object.id).not.toBe("https://attacker.example/caller-mutation");
  });
});
