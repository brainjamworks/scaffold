import { describe, expect, it, vi } from "vite-plus/test";

import type { LearnerActivityRecord } from "@scaffold/contracts";
import type { LearnerActivityPort } from "../../host/ports/learner-activity";
import { createLearnerActivityStore } from "./store";

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
  await Promise.resolve();
  await Promise.resolve();
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
    ]);
  });
});
