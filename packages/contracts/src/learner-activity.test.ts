import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_LEARNER_ACTIVITY_SNAPSHOT_VERSION,
  LearnerActivityDataSchema,
  LearnerActivityJsonValueSchema,
  LearnerActivityRecordSchema,
  LearnerActivitySnapshotSchema,
  type LearnerActivityData,
  type LearnerActivityRecord,
  type LearnerActivitySnapshot,
} from "./index";

const record: LearnerActivityRecord = {
  activityKind: "checklist",
  data: {
    checked: [true, false],
    progress: 0.5,
    nested: { note: "ready", optional: null },
  },
  completed: false,
  updatedAt: null,
};

const snapshot: LearnerActivitySnapshot = {
  snapshotVersion: 1,
  artifactId: "artifact-1",
  activities: { "block-1": record },
};

const portableUpdatedAtValues = [
  "0001-01-01T00:00:00Z",
  "9999-12-31T23:59:59.123456Z",
  "2024-02-29T23:59:59+23:59",
  "2026-07-16T00:00:00-00:00",
];

const nonPortableUpdatedAtValues = [
  "0000-01-01T00:00:00Z",
  "10000-01-01T00:00:00Z",
  "2026-01-01t00:00:00Z",
  "2026-01-01 00:00:00Z",
  "2026-01-01T00:00:00z",
  "2026-01-01T23:59:60Z",
  "2026-01-01T00:00:00+2400",
  "2026-01-01T00:00:00+24:00",
  "2026-01-01T00:00:00+00:60",
  "2025-02-29T00:00:00Z",
  "2026-04-31T00:00:00Z",
];

describe("learner activity contracts", () => {
  it("accepts strict version 1 snapshots with recursively JSON-safe data", () => {
    const data: LearnerActivityData = {
      text: "value",
      count: 2,
      active: true,
      empty: null,
      list: ["nested", 1, false, null, { deeper: [0] }],
      object: { child: { value: "ok" } },
    };

    expect(SCAFFOLD_LEARNER_ACTIVITY_SNAPSHOT_VERSION).toBe(1);
    expect(LearnerActivityDataSchema.parse(data)).toEqual(data);
    expect(LearnerActivitySnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("accepts null or timestamps in the portable learner activity subset", () => {
    expect(LearnerActivityRecordSchema.safeParse(record).success).toBe(true);

    for (const updatedAt of portableUpdatedAtValues) {
      expect(LearnerActivityRecordSchema.safeParse({ ...record, updatedAt }).success).toBe(true);
    }
  });

  it("rejects timestamps outside the portable learner activity subset", () => {
    for (const updatedAt of nonPortableUpdatedAtValues) {
      expect(LearnerActivityRecordSchema.safeParse({ ...record, updatedAt }).success).toBe(false);
    }
  });

  it("requires every snapshot and record field and rejects extra fields", () => {
    for (const field of ["snapshotVersion", "artifactId", "activities"]) {
      const incomplete = structuredClone(snapshot);
      Reflect.deleteProperty(incomplete, field);
      expect(LearnerActivitySnapshotSchema.safeParse(incomplete).success).toBe(false);
    }

    for (const field of ["activityKind", "data", "completed", "updatedAt"]) {
      const incomplete = structuredClone(record);
      Reflect.deleteProperty(incomplete, field);
      expect(LearnerActivityRecordSchema.safeParse(incomplete).success).toBe(false);
    }

    expect(
      LearnerActivitySnapshotSchema.safeParse({ ...snapshot, provider: "xblock" }).success,
    ).toBe(false);
    expect(LearnerActivityRecordSchema.safeParse({ ...record, score: 1 }).success).toBe(false);
  });

  it("rejects invalid version, identity, timestamp, and runtime composite keys", () => {
    expect(
      LearnerActivitySnapshotSchema.safeParse({ ...snapshot, snapshotVersion: 2 }).success,
    ).toBe(false);

    for (const artifactId of ["", "   ", "\t"]) {
      expect(LearnerActivitySnapshotSchema.safeParse({ ...snapshot, artifactId }).success).toBe(
        false,
      );
    }
    for (const activityKind of ["", "   ", "\t"]) {
      expect(LearnerActivityRecordSchema.safeParse({ ...record, activityKind }).success).toBe(
        false,
      );
    }
    for (const blockId of ["", "   ", "artifact:artifact-1/block:block-1"]) {
      expect(
        LearnerActivitySnapshotSchema.safeParse({
          ...snapshot,
          activities: { [blockId]: record },
        }).success,
      ).toBe(false);
    }
    for (const updatedAt of [
      "2026-07-16",
      "2026-07-16T12:30:00",
      "2026-07-16T12:30:00+25:00",
      "not-a-timestamp",
    ]) {
      expect(LearnerActivityRecordSchema.safeParse({ ...record, updatedAt }).success).toBe(false);
    }
  });

  it("requires an object at the data root", () => {
    for (const data of [null, true, 1, "value", [], ["value"]]) {
      expect(LearnerActivityDataSchema.safeParse(data).success).toBe(false);
      expect(LearnerActivityRecordSchema.safeParse({ ...record, data }).success).toBe(false);
    }
  });

  it("rejects non-JSON values and non-finite numbers at any depth", () => {
    class ActivityData {}

    for (const value of [
      undefined,
      Symbol("activity"),
      () => "activity",
      new Date("2026-07-16T12:30:00Z"),
      new ActivityData(),
      Number.NaN,
      Infinity,
      Number.NEGATIVE_INFINITY,
      { nested: undefined },
      { nested: [Number.NaN] },
    ]) {
      expect(LearnerActivityJsonValueSchema.safeParse(value).success).toBe(false);
    }
  });

  it("round-trips parsed snapshots through JSON without changing their value", () => {
    const parsed = LearnerActivitySnapshotSchema.parse({
      ...snapshot,
      activities: {
        ...snapshot.activities,
        "block-2": {
          ...record,
          data: { cards: [{ id: "card-1", seen: true }], remaining: 3 },
          completed: true,
          updatedAt: "2026-07-16T13:30:00+01:00",
        },
      },
    });

    expect(JSON.parse(JSON.stringify(parsed))).toEqual(parsed);
  });
});
