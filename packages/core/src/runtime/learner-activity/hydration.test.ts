import { describe, expect, it, vi } from "vite-plus/test";

import type { LearnerActivitySnapshot } from "@scaffold/contracts";
import {
  createLearnerActivityStore,
  hydrateLearnerActivitySnapshot,
  projectLearnerActivitySnapshot,
} from "./index";

function activityRecord(): LearnerActivitySnapshot["activities"][string] {
  return {
    activityKind: "checklist",
    data: { checkedItemIds: ["item-1"] },
    completed: false,
    updatedAt: "2026-07-17T10:00:00Z",
  };
}

function snapshot(
  activities: LearnerActivitySnapshot["activities"] = {
    "block-1": activityRecord(),
  },
): LearnerActivitySnapshot {
  return {
    snapshotVersion: 1,
    artifactId: "course-1",
    activities,
  };
}

describe("learner activity hydration", () => {
  it("applies records atomically before block registration", () => {
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });

    hydrateLearnerActivitySnapshot(store, snapshot());

    expect(store.getState().hydration).toEqual({ status: "ready", error: null });
    expect(store.getState().activities).toEqual(snapshot().activities);
    expect(store.getState().saves).toEqual({});
    expect(
      store.getState().ensureActivity({
        blockId: "block-1",
        activityKind: "checklist",
        initial: { data: { ignored: true }, completed: true },
      }),
    ).toBe(true);
    expect(store.getState().activities["block-1"]).toEqual(snapshot().activities["block-1"]);
  });

  it("uses defaults only for records absent from the hydrated snapshot", () => {
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });
    hydrateLearnerActivitySnapshot(store, snapshot());

    store.getState().ensureActivity({
      blockId: "block-2",
      activityKind: "flashcards",
      initial: { data: { currentCard: 2 }, completed: true },
    });

    expect(store.getState().activities["block-2"]).toEqual({
      activityKind: "flashcards",
      data: { currentCard: 2 },
      completed: true,
      updatedAt: null,
    });
  });

  it("rejects a later registration whose kind conflicts with hydrated identity", () => {
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });
    hydrateLearnerActivitySnapshot(store, snapshot());

    expect(() =>
      store.getState().ensureActivity({
        blockId: "block-1",
        activityKind: "flashcards",
        initial: { data: {}, completed: false },
      }),
    ).toThrow("activityKind cannot change");
    expect(store.getState().activities).toEqual(snapshot().activities);
  });

  it("parses the complete value before reading current store state", () => {
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });
    const getState = vi.spyOn(store, "getState");

    expect(() => hydrateLearnerActivitySnapshot(store, { snapshotVersion: 1 })).toThrow();
    expect(getState).not.toHaveBeenCalled();
  });

  it.each([
    ["future", { ...snapshot(), snapshotVersion: 2 }],
    ["foreign", { ...snapshot(), provider: "xblock" }],
    [
      "composite key",
      snapshot({
        "artifact:course-1/block:block-1": activityRecord(),
      }),
    ],
    [
      "invalid data",
      {
        snapshotVersion: 1,
        artifactId: "course-1",
        activities: {
          "block-1": { ...activityRecord(), data: { invalid: undefined } },
        },
      },
    ],
    [
      "invalid timestamp",
      {
        snapshotVersion: 1,
        artifactId: "course-1",
        activities: {
          "block-1": { ...activityRecord(), updatedAt: "not-a-timestamp" },
        },
      },
    ],
    ["artifact mismatch", { ...snapshot(), artifactId: "course-2" }],
  ])("rejects a %s snapshot without partial mutation", (_name, value) => {
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });
    store.getState().ensureActivity({
      blockId: "existing-block",
      activityKind: "checklist",
      initial: { data: { existing: true }, completed: false },
    });
    const before = store.getState();

    expect(() => hydrateLearnerActivitySnapshot(store, value)).toThrow();

    expect(store.getState().activities).toBe(before.activities);
    expect(store.getState().hydration).toBe(before.hydration);
    expect(store.getState().saves).toBe(before.saves);
  });

  it("atomically replaces existing records with an empty snapshot", () => {
    const store = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });
    store.getState().ensureActivity({
      blockId: "existing-block",
      activityKind: "checklist",
      initial: { data: { existing: true }, completed: false },
    });

    hydrateLearnerActivitySnapshot(store, snapshot({}));

    expect(store.getState().activities).toEqual({});
    expect(store.getState().hydration).toEqual({ status: "ready", error: null });
  });
});

describe("learner activity projection", () => {
  it("serializes only Contract-owned durable records and round-trips", () => {
    const source = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });
    hydrateLearnerActivitySnapshot(source, snapshot());
    source.setState({
      hydration: { status: "error", error: "transient load failure" },
      saves: {
        "block-1": { status: "error", generation: 7, error: "transient save failure" },
      },
    });

    const projected = projectLearnerActivitySnapshot(source);

    expect(projected).toEqual(snapshot());
    expect(projected).not.toHaveProperty("hydration");
    expect(projected).not.toHaveProperty("saves");
    expect(Object.keys(projected).sort()).toEqual(["activities", "artifactId", "snapshotVersion"]);

    const target = createLearnerActivityStore({
      artifactId: "course-1",
      learnerActivityPort: null,
    });
    hydrateLearnerActivitySnapshot(target, projected);
    expect(projectLearnerActivitySnapshot(target)).toEqual(projected);
  });
});
