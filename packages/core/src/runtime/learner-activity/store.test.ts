import { describe, expect, it, vi } from "vite-plus/test";

import type { LearnerActivityRecord } from "@scaffold/contracts";
import type { LearnerActivityPort } from "../../host/ports/learner-activity";
import type { XapiPort, XapiStatementDraft, XapiStatementTemplate } from "../../host/ports/xapi";
import {
  XAPI_VERBS,
  buildLearnerActivityInteractedStatementDraft,
  createXapiSession,
  type XapiSession,
} from "../xapi";
import { createLearnerActivityStore } from "./store";

const ROOT_ACTIVITY_ID = "https://example.com/courses/course-1";
const XAPI_TIMESTAMP = "2026-07-25T10:00:00.000Z";

function deferred<T>() {
  let resolve!: (value: T) => void;
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

function hostRecord(
  data: LearnerActivityRecord["data"],
  options: Partial<LearnerActivityRecord> = {},
): LearnerActivityRecord {
  return {
    activityKind: "checklist",
    data,
    completed: false,
    updatedAt: "2026-07-17T10:00:00Z",
    ...options,
  };
}

function createPort(save: LearnerActivityPort["save"]): LearnerActivityPort {
  return {
    load: async () => null,
    save,
  };
}

function createSessionDouble(
  recordImplementation: (statement: XapiStatementDraft) => void = () => undefined,
) {
  const record = vi.fn<(statement: XapiStatementDraft) => void>(recordImplementation);
  const session: XapiSession = Object.freeze({
    rootActivityId: ROOT_ACTIVITY_ID,
    start: vi.fn(),
    record,
    terminate: vi.fn(async () => undefined),
    getState: () => ({ status: "dormant" as const }),
  });
  return { session, record };
}

function createRecordingXapiSession() {
  let uuidSequence = 0;
  const send = vi.fn<XapiPort["send"]>(async () => undefined);
  const session = createXapiSession({
    port: { activityId: ROOT_ACTIVITY_ID, send },
    courseTitle: "Course One",
    createUuid: () => {
      uuidSequence += 1;
      return `00000000-0000-4000-8000-${uuidSequence.toString(16).padStart(12, "0")}`;
    },
    now: () => new Date(XAPI_TIMESTAMP),
    monotonicNow: () => 0,
  });
  return { session, send };
}

function hydrateBlock(
  store: ReturnType<typeof createLearnerActivityStore>,
  record: LearnerActivityRecord,
): void {
  store.setState({
    activities: { "block-1": record },
    hydration: { status: "ready", error: null },
  });
}

describe("createLearnerActivityStore", () => {
  it("normalizes required artifact identity and reflects persistence availability", () => {
    const unavailable = createLearnerActivityStore({
      artifactId: "  course-1  ",
      learnerActivityPort: null,
    });
    const loading = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(async ({ record }) => ({ ...record, updatedAt: null })),
    });

    expect(unavailable.getState()).toMatchObject({
      artifactId: "course-1",
      hydration: { status: "ready", error: null },
      activities: {},
      saves: {},
    });
    expect(loading.getState().hydration).toEqual({ status: "loading", error: null });
    expect(() =>
      createLearnerActivityStore({ artifactId: "  ", learnerActivityPort: null }),
    ).toThrow("artifactId must be a non-blank string");
  });

  it("keeps every factory call isolated even for the same artifact", () => {
    const first = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });
    const second = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });

    expect(
      first.getState().ensureActivity({
        blockId: "block-1",
        activityKind: "checklist",
        initial: { data: { checked: [] }, completed: false },
      }),
    ).toBe(true);

    expect(second.getState().activities).toEqual({});
    expect(first.getState().activities).not.toBe(second.getState().activities);
  });

  it("ensures idempotently, rejects kind changes, and validates local JSON", () => {
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });
    const actions = store.getState();

    expect(
      actions.ensureActivity({
        blockId: "block-1",
        activityKind: "checklist",
        initial: { data: { checked: [] }, completed: false },
      }),
    ).toBe(true);
    expect(
      actions.ensureActivity({
        blockId: "block-1",
        activityKind: "checklist",
        initial: { data: { ignored: true }, completed: true },
      }),
    ).toBe(true);
    expect(store.getState().activities["block-1"]).toEqual({
      activityKind: "checklist",
      data: { checked: [] },
      completed: false,
      updatedAt: null,
    });
    expect(store.getState().saves["block-1"]).toEqual({
      status: "unavailable",
      generation: 1,
      error: null,
    });
    expect(() =>
      actions.ensureActivity({
        blockId: "block-1",
        activityKind: "flashcards",
        initial: { data: {}, completed: false },
      }),
    ).toThrow("activityKind cannot change");
    expect(() => actions.setData("block-1", { invalid: undefined } as never)).toThrow();
    expect(store.getState().activities["block-1"]?.data).toEqual({ checked: [] });
  });

  it("patches shallowly and retains the authoritative timestamp until save succeeds", async () => {
    const save = deferred<LearnerActivityRecord>();
    const port = createPort(() => save.promise);
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: port,
    });

    store.setState({
      activities: {
        "block-1": hostRecord({ checked: ["a"], nested: { keep: true } }),
      },
      hydration: { status: "ready", error: null },
    });
    expect(store.getState().patchData("block-1", { nested: { replaced: true }, page: 2 })).toBe(
      true,
    );
    expect(store.getState().activities["block-1"]).toEqual(
      hostRecord({ checked: ["a"], nested: { replaced: true }, page: 2 }),
    );

    save.resolve(
      hostRecord(
        { checked: ["a"], nested: { replaced: true }, page: 2 },
        { updatedAt: "2026-07-17T11:00:00Z" },
      ),
    );
    await flushPromises();

    expect(store.getState().activities["block-1"]?.updatedAt).toBe("2026-07-17T11:00:00Z");
    expect(store.getState().saves["block-1"]).toEqual({
      status: "idle",
      generation: 1,
      error: null,
    });
  });

  it("serializes saves for one block and ignores an older authoritative completion", async () => {
    const first = deferred<LearnerActivityRecord>();
    const second = deferred<LearnerActivityRecord>();
    const save = vi
      .fn<LearnerActivityPort["save"]>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(save),
    });

    store.getState().ensureActivity({
      blockId: "block-1",
      activityKind: "checklist",
      initial: { data: { step: 1 }, completed: false },
    });
    store.getState().setData("block-1", { step: 2 });
    await flushPromises();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenNthCalledWith(1, {
      artifactId: "course-1",
      blockId: "block-1",
      record: { activityKind: "checklist", data: { step: 1 }, completed: false },
    });

    first.resolve(hostRecord({ step: 1 }, { updatedAt: "2026-07-17T10:00:00Z" }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));

    expect(store.getState().activities["block-1"]?.data).toEqual({ step: 2 });
    expect(store.getState().activities["block-1"]?.updatedAt).toBeNull();

    second.resolve(hostRecord({ step: 2 }, { updatedAt: "2026-07-17T11:00:00Z" }));
    await flushPromises();

    expect(store.getState().activities["block-1"]).toEqual(
      hostRecord({ step: 2 }, { updatedAt: "2026-07-17T11:00:00Z" }),
    );
    expect(store.getState().saves["block-1"]).toEqual({
      status: "idle",
      generation: 2,
      error: null,
    });
  });

  it("reserves same-block save order before synchronous subscriber re-entry", async () => {
    const portInputs: number[] = [];
    const persistedRecords: LearnerActivityRecord[] = [];
    const save = vi.fn<LearnerActivityPort["save"]>(async ({ record }) => {
      const step = record.data["step"];
      if (typeof step !== "number") throw new Error("expected numeric step");
      portInputs.push(step);
      const authoritative = hostRecord(record.data, {
        activityKind: record.activityKind,
        completed: record.completed,
        updatedAt: `2026-07-17T1${step}:00:00Z`,
      });
      persistedRecords.push(authoritative);
      return authoritative;
    });
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(save),
    });
    let reentered = false;
    const unsubscribe = store.subscribe((state) => {
      if (!reentered && state.activities["block-1"]?.data["step"] === 1) {
        reentered = true;
        state.setData("block-1", { step: 2 });
      }
    });

    store.getState().ensureActivity({
      blockId: "block-1",
      activityKind: "checklist",
      initial: { data: { step: 1 }, completed: false },
    });

    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("idle"));
    unsubscribe();

    expect(portInputs).toEqual([1, 2]);
    expect(persistedRecords[persistedRecords.length - 1]?.data).toEqual({ step: 2 });
    expect(store.getState().activities["block-1"]).toEqual(
      hostRecord({ step: 2 }, { updatedAt: "2026-07-17T12:00:00Z" }),
    );
  });

  it("lets different blocks save and settle independently", async () => {
    const blockA = deferred<LearnerActivityRecord>();
    const blockB = deferred<LearnerActivityRecord>();
    const save = vi.fn<LearnerActivityPort["save"]>(({ blockId }) =>
      blockId === "block-a" ? blockA.promise : blockB.promise,
    );
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(save),
    });

    store.getState().ensureActivity({
      blockId: "block-a",
      activityKind: "checklist",
      initial: { data: { block: "a" }, completed: false },
    });
    store.getState().ensureActivity({
      blockId: "block-b",
      activityKind: "checklist",
      initial: { data: { block: "b" }, completed: false },
    });
    await flushPromises();

    expect(save).toHaveBeenCalledTimes(2);
    blockB.resolve(hostRecord({ block: "b" }, { updatedAt: "2026-07-17T12:00:00Z" }));
    await flushPromises();
    expect(store.getState().saves["block-b"]?.status).toBe("idle");
    expect(store.getState().saves["block-a"]?.status).toBe("pending");

    blockA.resolve(hostRecord({ block: "a" }));
    await flushPromises();
    expect(store.getState().saves["block-a"]?.status).toBe("idle");
  });

  it("continues a block tail after stale and current failures", async () => {
    const first = deferred<LearnerActivityRecord>();
    const second = deferred<LearnerActivityRecord>();
    const third = deferred<LearnerActivityRecord>();
    const save = vi
      .fn<LearnerActivityPort["save"]>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise);
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(save),
    });

    store.getState().ensureActivity({
      blockId: "block-1",
      activityKind: "checklist",
      initial: { data: { step: 1 }, completed: false },
    });
    store.getState().setData("block-1", { step: 2 });
    await flushPromises();
    first.reject(new Error("stale failure"));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));

    expect(store.getState().saves["block-1"]).toEqual({
      status: "pending",
      generation: 2,
      error: null,
    });

    second.reject(new Error("current failure"));
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("error"));
    expect(store.getState().saves["block-1"]).toEqual({
      status: "error",
      generation: 2,
      error: "current failure",
    });
    expect(store.getState().activities["block-1"]?.data).toEqual({ step: 2 });

    store.getState().setCompleted("block-1", true);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    third.resolve(hostRecord({ step: 2 }, { completed: true }));
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("idle"));
    expect(store.getState().saves["block-1"]).toEqual({
      status: "idle",
      generation: 3,
      error: null,
    });
  });

  it("treats invalid current host records as save failures without rollback", async () => {
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(async () => ({
        ...hostRecord({ local: true }),
        updatedAt: "not-a-timestamp",
      })),
    });

    store.getState().ensureActivity({
      blockId: "block-1",
      activityKind: "checklist",
      initial: { data: { local: true }, completed: false },
    });
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("error"));

    expect(store.getState().activities["block-1"]?.data).toEqual({ local: true });
    expect(store.getState().saves["block-1"]?.status).toBe("error");
    expect(store.getState().saves["block-1"]?.error).toMatch(/\S/);
  });

  it("keeps stale generations inert and drains the tail after the current save settles", async () => {
    const first = deferred<LearnerActivityRecord>();
    const second = deferred<LearnerActivityRecord>();
    const third = deferred<LearnerActivityRecord>();
    const save = vi
      .fn<LearnerActivityPort["save"]>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise);
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(save),
    });
    const actions = store.getState();

    actions.ensureActivity({
      blockId: "block-1",
      activityKind: "checklist",
      initial: { data: { step: 1 }, completed: false },
    });
    actions.setData("block-1", { step: 2 });
    await flushPromises();
    expect(save).toHaveBeenCalledTimes(1);

    first.resolve(hostRecord({ step: 1 }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(store.getState().activities["block-1"]?.data).toEqual({ step: 2 });
    expect(store.getState().saves["block-1"]?.generation).toBe(2);

    second.resolve(hostRecord({ step: 2 }, { updatedAt: "2026-07-17T11:00:00Z" }));
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("idle"));

    expect(actions.setCompleted("block-1", true)).toBe(true);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(3));
    third.resolve(hostRecord({ step: 2 }, { completed: true, updatedAt: "2026-07-17T12:00:00Z" }));
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("idle"));

    expect(store.getState().activities["block-1"]?.completed).toBe(true);
    expect(store.getState().saves["block-1"]?.generation).toBe(3);
    expect(Object.keys(store.getState()).sort()).toEqual([
      "activities",
      "artifactId",
      "ensureActivity",
      "hydration",
      "patchData",
      "saves",
      "setCompleted",
      "setData",
      "updateActivity",
    ]);
  });

  it("keeps hydration and the first authoritative initialization silent", async () => {
    const { session, send } = createRecordingXapiSession();
    const hydratedStore = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(async ({ record }) =>
        hostRecord(record.data, {
          activityKind: record.activityKind,
          completed: record.completed,
        }),
      ),
      getXapiSession: () => session,
    });
    hydrateBlock(hydratedStore, hostRecord({ checked: [] }));
    await flushPromises();
    expect(send).not.toHaveBeenCalled();

    const initializedStore = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(async ({ record }) =>
        hostRecord(record.data, {
          activityKind: record.activityKind,
          completed: record.completed,
        }),
      ),
      getXapiSession: () => session,
    });
    initializedStore.getState().ensureActivity({
      blockId: "block-1",
      activityKind: "checklist",
      initial: { data: { checked: [] }, completed: false },
    });

    await vi.waitFor(() =>
      expect(initializedStore.getState().saves["block-1"]?.status).toBe("idle"),
    );
    await flushPromises();
    expect(send).not.toHaveBeenCalled();
  });

  it("records an authoritative data transition only after save acceptance without learner data", async () => {
    const save = deferred<LearnerActivityRecord>();
    const { session, send } = createRecordingXapiSession();
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(() => save.promise),
      getXapiSession: () => session,
    });
    hydrateBlock(store, hostRecord({ checked: [] }));

    store.getState().setData("block-1", {
      checked: ["a"],
      privateAnswer: "must stay in learner state",
    });
    await flushPromises();
    expect(send).not.toHaveBeenCalled();

    save.resolve(
      hostRecord(
        { checked: ["a"], privateAnswer: "must stay in learner state" },
        { updatedAt: "2026-07-25T11:00:00Z" },
      ),
    );
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("idle"));
    await flushPromises();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([statement]) => statement.verb.id)).toEqual([
      XAPI_VERBS.initialized.id,
      XAPI_VERBS.interacted.id,
    ]);
    const expectedDraft = buildLearnerActivityInteractedStatementDraft({
      rootActivityId: ROOT_ACTIVITY_ID,
      blockId: "block-1",
      activityKind: "checklist",
    });
    const learningStatement = send.mock.calls[1]?.[0] as XapiStatementTemplate;
    expect(learningStatement).toEqual({
      ...expectedDraft,
      id: "00000000-0000-4000-8000-000000000002",
      timestamp: XAPI_TIMESTAMP,
    });
    expect(JSON.stringify(learningStatement)).not.toContain("privateAnswer");
    expect(JSON.stringify(learningStatement)).not.toContain("2026-07-25T11:00:00Z");
  });

  it("records an accepted checklist item event before completing the activity", async () => {
    const save = deferred<LearnerActivityRecord>();
    const { session, record } = createSessionDouble();
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(() => save.promise),
      getXapiSession: () => session,
    });
    hydrateBlock(store, hostRecord({ checked: {} }));

    store.getState().updateActivity("block-1", {
      data: {
        checked: { "item-one": true },
        privateLearnerState: "PRIVATE_LEARNER_STATE",
      },
      completed: true,
      xapiEvent: {
        kind: "checklist-item-toggled",
        itemId: "item-one",
        checked: true,
        completedCount: 1,
        total: 1,
      },
    });
    await flushPromises();
    expect(record).not.toHaveBeenCalled();

    save.resolve(
      hostRecord(
        {
          checked: { "item-one": true },
          privateLearnerState: "PRIVATE_LEARNER_STATE",
        },
        { completed: true, updatedAt: "2026-07-25T11:00:00Z" },
      ),
    );
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("idle"));

    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[0]?.[0]).toEqual(
      buildLearnerActivityInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "block-1",
        activityKind: "checklist",
        event: {
          kind: "checklist-item-toggled",
          itemId: "item-one",
          checked: true,
          completedCount: 1,
          total: 1,
        },
      }),
    );
    expect(record.mock.calls[1]?.[0]).toMatchObject({
      verb: XAPI_VERBS.completed,
      result: { completion: true },
    });
    expect(JSON.stringify(record.mock.calls)).not.toContain("PRIVATE_LEARNER_STATE");
  });

  it("falls back to generic interacted when the host changes a checklist update", async () => {
    const { session, record } = createSessionDouble();
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(async () =>
        hostRecord(
          { checked: { "item-one": false } },
          { updatedAt: "2026-07-25T11:00:00Z" },
        ),
      ),
      getXapiSession: () => session,
    });
    hydrateBlock(store, hostRecord({ checked: {} }));

    store.getState().updateActivity("block-1", {
      data: { checked: { "item-one": true } },
      completed: false,
      xapiEvent: {
        kind: "checklist-item-toggled",
        itemId: "item-one",
        checked: true,
        completedCount: 1,
        total: 1,
      },
    });
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("idle"));

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      buildLearnerActivityInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "block-1",
        activityKind: "checklist",
      }),
    );
  });

  it("falls back to generic interacted when the host changes a flashcard update", async () => {
    const { session, record } = createSessionDouble();
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(async () =>
        hostRecord(
          { flipped: { "card-one": false } },
          { activityKind: "flashcard", updatedAt: "2026-07-25T11:00:00Z" },
        ),
      ),
      getXapiSession: () => session,
    });
    hydrateBlock(store, hostRecord({ flipped: {} }, { activityKind: "flashcard" }));

    store.getState().updateActivity("block-1", {
      data: { flipped: { "card-one": true } },
      completed: false,
      xapiEvent: {
        kind: "flashcard-flipped",
        cardId: "card-one",
        face: "back",
      },
    });
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("idle"));

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(
      buildLearnerActivityInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "block-1",
        activityKind: "flashcard",
      }),
    );
  });

  it("records only completed when the current generation changes data and completes", async () => {
    const first = deferred<LearnerActivityRecord>();
    const second = deferred<LearnerActivityRecord>();
    const save = vi
      .fn<LearnerActivityPort["save"]>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { session, record } = createSessionDouble();
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(save),
      getXapiSession: () => session,
    });
    hydrateBlock(store, hostRecord({ step: 0 }));

    store.getState().setData("block-1", { step: 1 });
    store.getState().setCompleted("block-1", true);
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));

    first.resolve(hostRecord({ step: 1 }));
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(record).not.toHaveBeenCalled();

    second.resolve(hostRecord({ step: 1 }, { completed: true }));
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("idle"));

    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]?.[0]).toMatchObject({
      verb: XAPI_VERBS.completed,
      result: { completion: true },
    });
  });

  it("records reset data as interacted but ignores a completion-only reset", async () => {
    const changed = createSessionDouble();
    const changedStore = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(async ({ record }) =>
        hostRecord(record.data, {
          activityKind: record.activityKind,
          completed: record.completed,
        }),
      ),
      getXapiSession: () => changed.session,
    });
    hydrateBlock(changedStore, hostRecord({ step: 2 }, { completed: true }));

    changedStore.getState().setData("block-1", { step: 0 });
    changedStore.getState().setCompleted("block-1", false);
    await vi.waitFor(() => expect(changedStore.getState().saves["block-1"]?.status).toBe("idle"));
    expect(changed.record).toHaveBeenCalledTimes(1);
    expect(changed.record.mock.calls[0]?.[0].verb.id).toBe(XAPI_VERBS.interacted.id);

    const completionOnly = createSessionDouble();
    const completionOnlyStore = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(async ({ record }) =>
        hostRecord(record.data, {
          activityKind: record.activityKind,
          completed: record.completed,
        }),
      ),
      getXapiSession: () => completionOnly.session,
    });
    hydrateBlock(completionOnlyStore, hostRecord({ step: 0 }, { completed: true }));

    completionOnlyStore.getState().setCompleted("block-1", false);
    await vi.waitFor(() =>
      expect(completionOnlyStore.getState().saves["block-1"]?.status).toBe("idle"),
    );
    expect(completionOnly.record).not.toHaveBeenCalled();
  });

  it("ignores timestamps and object key order but treats array order as progress", async () => {
    const save = vi
      .fn<LearnerActivityPort["save"]>()
      .mockResolvedValueOnce(
        hostRecord(
          {
            list: ["a", "b"],
            nested: { right: false, left: true },
            first: 1,
          },
          { updatedAt: "2026-07-25T11:00:00Z" },
        ),
      )
      .mockResolvedValueOnce(
        hostRecord(
          {
            first: 1,
            nested: { left: true, right: false },
            list: ["b", "a"],
          },
          { updatedAt: "2026-07-25T12:00:00Z" },
        ),
      );
    const { session, record } = createSessionDouble();
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(save),
      getXapiSession: () => session,
    });
    hydrateBlock(
      store,
      hostRecord({
        first: 1,
        nested: { left: true, right: false },
        list: ["a", "b"],
      }),
    );

    store.getState().setData("block-1", {
      list: ["a", "b"],
      nested: { right: false, left: true },
      first: 1,
    });
    await vi.waitFor(() =>
      expect(store.getState().saves["block-1"]).toMatchObject({
        status: "idle",
        generation: 1,
      }),
    );
    expect(record).not.toHaveBeenCalled();

    store.getState().setData("block-1", {
      first: 1,
      nested: { left: true, right: false },
      list: ["b", "a"],
    });
    await vi.waitFor(() =>
      expect(store.getState().saves["block-1"]).toMatchObject({
        status: "idle",
        generation: 2,
      }),
    );
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]?.[0].verb.id).toBe(XAPI_VERBS.interacted.id);
  });

  it("advances the authoritative baseline while an activity kind is not allowlisted", async () => {
    const save = vi
      .fn<LearnerActivityPort["save"]>()
      .mockResolvedValueOnce(
        hostRecord({ step: 1 }, { activityKind: "flashcards", updatedAt: "2026-07-25T11:00:00Z" }),
      )
      .mockResolvedValueOnce(
        hostRecord({ step: 1 }, { activityKind: "checklist", updatedAt: "2026-07-25T12:00:00Z" }),
      );
    const { session, record } = createSessionDouble();
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(save),
      getXapiSession: () => session,
    });
    hydrateBlock(store, hostRecord({ step: 0 }, { activityKind: "flashcards" }));

    store.getState().setData("block-1", { step: 1 });
    await vi.waitFor(() =>
      expect(store.getState().saves["block-1"]).toMatchObject({
        status: "idle",
        generation: 1,
      }),
    );
    expect(record).not.toHaveBeenCalled();

    store.setState({
      activities: {
        "block-1": hostRecord(
          { step: 1 },
          { activityKind: "checklist", updatedAt: "2026-07-25T11:30:00Z" },
        ),
      },
    });
    store.getState().setCompleted("block-1", false);
    await vi.waitFor(() =>
      expect(store.getState().saves["block-1"]).toMatchObject({
        status: "idle",
        generation: 2,
      }),
    );
    expect(record).not.toHaveBeenCalled();
  });

  it("ignores rejected or invalid responses and preserves the baseline for recovery", async () => {
    const xapi = createSessionDouble();
    const rejected = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(async () => {
        throw new Error("save rejected");
      }),
      getXapiSession: () => xapi.session,
    });
    hydrateBlock(rejected, hostRecord({ step: 0 }));
    rejected.getState().setData("block-1", { step: 1 });
    await vi.waitFor(() => expect(rejected.getState().saves["block-1"]?.status).toBe("error"));

    const invalidSave = vi
      .fn<LearnerActivityPort["save"]>()
      .mockResolvedValueOnce({
        ...hostRecord({ step: 0 }, { completed: true }),
        updatedAt: "invalid",
      })
      .mockResolvedValueOnce(
        hostRecord({ step: 0 }, { completed: true, updatedAt: "2026-07-25T12:00:00Z" }),
      );
    const invalid = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(invalidSave),
      getXapiSession: () => xapi.session,
    });
    hydrateBlock(invalid, hostRecord({ step: 0 }));
    invalid.getState().setCompleted("block-1", true);
    await vi.waitFor(() => expect(invalid.getState().saves["block-1"]?.status).toBe("error"));
    expect(xapi.record).not.toHaveBeenCalled();

    invalid.getState().setCompleted("block-1", true);
    await vi.waitFor(() =>
      expect(invalid.getState().saves["block-1"]).toMatchObject({
        status: "idle",
        generation: 2,
      }),
    );
    expect(xapi.record).toHaveBeenCalledTimes(1);
    expect(xapi.record.mock.calls[0]?.[0].verb.id).toBe(XAPI_VERBS.completed.id);
  });

  it("keeps persistence authoritative when recording is absent or throws", async () => {
    const savingPort = createPort(async ({ record }) =>
      hostRecord(record.data, {
        activityKind: record.activityKind,
        completed: record.completed,
        updatedAt: "2026-07-25T11:00:00Z",
      }),
    );
    const laterXapi = createSessionDouble();
    let currentSession: XapiSession | null = null;
    const absent = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: savingPort,
      getXapiSession: () => currentSession,
    });
    hydrateBlock(absent, hostRecord({ step: 0 }));
    absent.getState().setData("block-1", { step: 1 });

    const throwingAccessor = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: savingPort,
      getXapiSession: () => {
        throw new Error("session unavailable");
      },
    });
    hydrateBlock(throwingAccessor, hostRecord({ step: 0 }));
    throwingAccessor.getState().setData("block-1", { step: 1 });

    const throwingRecord = createSessionDouble(() => {
      throw new Error("recording unavailable");
    });
    const throwingSession = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: savingPort,
      getXapiSession: () => throwingRecord.session,
    });
    hydrateBlock(throwingSession, hostRecord({ step: 0 }));
    throwingSession.getState().setData("block-1", { step: 1 });

    await vi.waitFor(() => {
      expect(absent.getState().saves["block-1"]?.status).toBe("idle");
      expect(throwingAccessor.getState().saves["block-1"]?.status).toBe("idle");
      expect(throwingSession.getState().saves["block-1"]?.status).toBe("idle");
    });
    expect(absent.getState().activities["block-1"]?.data).toEqual({ step: 1 });
    expect(throwingAccessor.getState().activities["block-1"]?.data).toEqual({ step: 1 });
    expect(throwingSession.getState().activities["block-1"]?.data).toEqual({ step: 1 });

    currentSession = laterXapi.session;
    absent.getState().setData("block-1", { step: 1 });
    await vi.waitFor(() =>
      expect(absent.getState().saves["block-1"]).toMatchObject({
        status: "idle",
        generation: 2,
      }),
    );
    expect(laterXapi.record).not.toHaveBeenCalled();
  });

  it("resolves the current session only when a save becomes authoritative", async () => {
    const save = deferred<LearnerActivityRecord>();
    const oldXapi = createSessionDouble();
    const newXapi = createSessionDouble();
    let currentSession = oldXapi.session;
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: createPort(() => save.promise),
      getXapiSession: () => currentSession,
    });
    hydrateBlock(store, hostRecord({ step: 0 }));

    store.getState().setData("block-1", { step: 1 });
    currentSession = newXapi.session;
    save.resolve(hostRecord({ step: 1 }, { updatedAt: "2026-07-25T11:00:00Z" }));
    await vi.waitFor(() => expect(store.getState().saves["block-1"]?.status).toBe("idle"));

    expect(oldXapi.record).not.toHaveBeenCalled();
    expect(newXapi.record).toHaveBeenCalledTimes(1);
    expect(newXapi.record.mock.calls[0]?.[0].verb.id).toBe(XAPI_VERBS.interacted.id);
  });
});
