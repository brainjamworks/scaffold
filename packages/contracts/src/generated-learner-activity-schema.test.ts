import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vite-plus/test";
import type { ZodTypeAny } from "zod";

import learnerActivityJsonSchema from "../generated/learner-activity.schema.json";
import {
  LearnerActivityDataSchema,
  LearnerActivityJsonValueSchema,
  LearnerActivityRecordSchema,
  LearnerActivitySnapshotSchema,
} from "./index";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(learnerActivityJsonSchema);

function validatorFor(definitionName: string): ValidateFunction {
  const validator = ajv.getSchema(
    `${learnerActivityJsonSchema.$id}#/definitions/${definitionName}`,
  );
  if (!validator) throw new Error(`Missing generated definition: ${definitionName}`);
  return validator;
}

function expectAccepted(zodSchema: ZodTypeAny, definitionName: string, value: unknown): void {
  expect(zodSchema.safeParse(value).success).toBe(true);
  const validator = validatorFor(definitionName);
  expect(validator(value), JSON.stringify(validator.errors)).toBe(true);
}

function expectRejected(zodSchema: ZodTypeAny, definitionName: string, value: unknown): void {
  expect(zodSchema.safeParse(value).success).toBe(false);
  expect(validatorFor(definitionName)(value)).toBe(false);
}

const record = {
  activityKind: "checklist",
  data: {
    checked: [true, false],
    progress: 0.5,
    nested: { note: "ready", optional: null },
  },
  completed: false,
  updatedAt: null,
};

const snapshot = {
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

describe("generated learner activity JSON Schema", () => {
  it("publishes a Draft-07 bundle with stable public definitions", () => {
    expect(learnerActivityJsonSchema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(learnerActivityJsonSchema.$id).toBe(
      "https://scaffold.ac/schemas/learner-activity.schema.json",
    );
    expect(learnerActivityJsonSchema.title).toBe("Scaffold learner activity contracts");
    expect(learnerActivityJsonSchema.$comment).toBe(
      "This bundle is generated from the strict v1 Zod contract and carries its portable learner activity invariants.",
    );
    expect(Object.keys(learnerActivityJsonSchema.definitions)).toEqual([
      "LearnerActivityData",
      "LearnerActivityJsonValue",
      "LearnerActivityRecord",
      "LearnerActivitySnapshot",
    ]);
  });

  it("matches recursive JSON value and object-root data constraints", () => {
    for (const value of [
      null,
      true,
      "value",
      1.5,
      ["nested", { deeper: [0, false, null] }],
      { object: { child: "ok" } },
    ]) {
      expectAccepted(LearnerActivityJsonValueSchema, "LearnerActivityJsonValue", value);
    }

    expectAccepted(LearnerActivityDataSchema, "LearnerActivityData", record.data);
    for (const value of [null, true, "value", 1, [], ["value"]]) {
      expectRejected(LearnerActivityDataSchema, "LearnerActivityData", value);
    }
    for (const value of [Number.NaN, Infinity, Number.NEGATIVE_INFINITY]) {
      expectRejected(LearnerActivityJsonValueSchema, "LearnerActivityJsonValue", value);
    }
  });

  it("matches strict record fields, identity, and timestamp constraints", () => {
    expectAccepted(LearnerActivityRecordSchema, "LearnerActivityRecord", record);
    for (const updatedAt of portableUpdatedAtValues) {
      expectAccepted(LearnerActivityRecordSchema, "LearnerActivityRecord", {
        ...record,
        completed: true,
        updatedAt,
      });
    }

    for (const updatedAt of nonPortableUpdatedAtValues) {
      expectRejected(LearnerActivityRecordSchema, "LearnerActivityRecord", {
        ...record,
        updatedAt,
      });
    }

    for (const value of [
      { ...record, activityKind: "   " },
      { ...record, updatedAt: "2026-07-16T12:30:00" },
      { ...record, updatedAt: "2026-07-16T12:30:00+25:00" },
      { ...record, score: 1 },
      { activityKind: record.activityKind, data: record.data, completed: false },
    ]) {
      expectRejected(LearnerActivityRecordSchema, "LearnerActivityRecord", value);
    }
  });

  it("matches strict version, artifact, activity-key, and record constraints", () => {
    expectAccepted(LearnerActivitySnapshotSchema, "LearnerActivitySnapshot", snapshot);

    for (const value of [
      { ...snapshot, snapshotVersion: 2 },
      { ...snapshot, artifactId: "   " },
      { ...snapshot, activities: [] },
      { ...snapshot, activities: { "   ": record } },
      {
        ...snapshot,
        activities: { "artifact:artifact-1/block:block-1": record },
      },
      { ...snapshot, provider: "xblock" },
    ]) {
      expectRejected(LearnerActivitySnapshotSchema, "LearnerActivitySnapshot", value);
    }
  });
});
