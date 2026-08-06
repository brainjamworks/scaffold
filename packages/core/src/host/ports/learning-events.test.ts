import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";
import scoreConformance from "../../../../contracts/fixtures/score-transport-conformance.json" with { type: "json" };
import conformance from "../../../fixtures/learning-event-conformance.json" with { type: "json" };

import {
  LearningEventIriSchema,
  LearningEventSchema,
  type LearningEvent,
  type LearningEventPort,
} from "./learning-events";

interface LearningEventConformanceCase {
  readonly name: string;
  readonly valid: boolean;
  readonly coreValid?: boolean;
  readonly event: unknown;
}

interface LearningEventScalarConformanceCase {
  readonly name: string;
  readonly value: string;
  readonly valid: boolean;
}

type LearningEventScalarFamily = "uuid" | "duration" | "languageTag" | "iri";

interface LearningEventJsonDepthConformanceCase {
  readonly name: string;
  readonly depth: number;
  readonly valid: boolean;
}

interface ScoreTransportConformanceCase {
  readonly name: string;
  readonly json: string;
  readonly valid: boolean;
  readonly normalized?: unknown;
}

interface ScoreProgrammaticConformanceCase {
  readonly name: string;
  readonly field: "scaled" | "raw" | "min" | "max";
  readonly value: "nan" | "positiveInfinity" | "negativeInfinity";
}

const conformanceCases = conformance.cases as readonly LearningEventConformanceCase[];
const scalarConformanceCases = Object.entries(conformance.scalarCases).flatMap(([family, cases]) =>
  (cases as readonly LearningEventScalarConformanceCase[]).map((testCase) => ({
    family: family as LearningEventScalarFamily,
    ...testCase,
  })),
);
const jsonDepthConformanceCases =
  conformance.jsonDepthCases as readonly LearningEventJsonDepthConformanceCase[];
const scoreTransportConformanceCases =
  scoreConformance.transportCases as readonly ScoreTransportConformanceCase[];
const scoreProgrammaticConformanceCases =
  scoreConformance.programmaticCases as readonly ScoreProgrammaticConformanceCase[];

const programmaticNumbers = {
  nan: Number.NaN,
  positiveInfinity: Number.POSITIVE_INFINITY,
  negativeInfinity: Number.NEGATIVE_INFINITY,
} as const;

function validEvent(): LearningEvent {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    timestamp: "2026-07-25T10:15:30.123Z",
    verb: {
      id: "https://w3id.org/xapi/adl/verbs/answered",
      display: { "en-GB": "answered" },
    },
    object: {
      objectType: "Activity",
      id: "https://learning.example.test/artifacts/artifact-1/questions/question-1",
      definition: {
        name: { "en-GB": "Question 1" },
        description: { "en-GB": "Choose an answer" },
        type: "http://adlnet.gov/expapi/activities/question",
        interactionType: "choice",
        choices: [{ id: "choice-a", description: { "en-GB": "Choice A" } }],
        extensions: {
          "https://scaffold.example/xapi/extensions/question-position": 1,
        },
      },
    },
    result: {
      score: { scaled: 1, raw: 2, min: 0, max: 2 },
      success: true,
      completion: true,
      response: "choice-a",
      duration: "PT45S",
      extensions: {
        "https://scaffold.example/xapi/extensions/attempt": {
          number: 1,
          flags: [true, null],
        },
      },
    },
    context: {
      contextActivities: {
        parent: [
          {
            objectType: "Activity",
            id: "https://learning.example.test/artifacts/artifact-1",
          },
        ],
      },
      extensions: {
        "https://scaffold.example/xapi/extensions/attempt-id": "attempt-1",
      },
    },
  };
}

function eventWithScalar(family: LearningEventScalarFamily, value: string): LearningEvent {
  const event = validEvent();
  switch (family) {
    case "uuid":
      return { ...event, id: value };
    case "duration":
      return { ...event, result: { duration: value } };
    case "languageTag":
      return { ...event, verb: { ...event.verb, display: { [value]: "answered" } } };
    case "iri":
      return { ...event, object: { ...event.object, id: value } };
  }
}

function nestedJsonValue(depth: number): unknown {
  let value: unknown = "leaf";
  for (let level = 0; level < depth; level += 1) {
    value = [value];
  }
  return value;
}

describe("Learning Event contract", () => {
  it.each(scoreTransportConformanceCases)(
    "matches the shared Score transport fixture: $name",
    (testCase) => {
      const score = JSON.parse(testCase.json) as unknown;
      const event = { ...validEvent(), result: { score } };
      const parsed = LearningEventSchema.safeParse(event);

      expect(parsed.success).toBe(testCase.valid);
      if (parsed.success && testCase.normalized !== undefined) {
        expect(parsed.data.result?.score).toStrictEqual(testCase.normalized);
      }
    },
  );

  it.each(scoreProgrammaticConformanceCases)(
    "rejects the shared programmatic Score case: $name",
    (testCase) => {
      const score: Record<string, unknown> = { scaled: 0.5, raw: 1, min: 0, max: 2 };
      score[testCase.field] = programmaticNumbers[testCase.value];

      expect(LearningEventSchema.safeParse({ ...validEvent(), result: { score } }).success).toBe(
        false,
      );
    },
  );

  it.each(conformanceCases)("matches the shared conformance fixture: $name", (testCase) => {
    expect(LearningEventSchema.safeParse(testCase.event).success).toBe(
      testCase.coreValid ?? testCase.valid,
    );
  });

  it.each(scalarConformanceCases)(
    "matches the shared $family scalar fixture: $name",
    ({ family, value, valid }) => {
      expect(LearningEventSchema.safeParse(eventWithScalar(family, value)).success).toBe(valid);
    },
  );

  it.each(jsonDepthConformanceCases)(
    "matches the shared extension depth fixture: $name",
    ({ depth, valid }) => {
      const event = {
        ...validEvent(),
        result: {
          extensions: {
            "https://scaffold.example/xapi/extensions/value": nestedJsonValue(depth),
          },
        },
      };

      expect(LearningEventSchema.safeParse(event).success).toBe(valid);
    },
  );

  it("parses the strict actorless standard-compatible shape", () => {
    const event = validEvent();
    const parsed = LearningEventSchema.parse(event);

    expect(parsed).toStrictEqual(event);
    expectTypeOf(parsed).toMatchTypeOf<LearningEvent>();
    expectTypeOf<LearningEvent>().toMatchTypeOf<typeof parsed>();
    expect(JSON.parse(JSON.stringify(parsed))).toStrictEqual(event);
  });

  it("defines host acceptance as the port boundary", async () => {
    const accept = vi.fn<LearningEventPort["accept"]>(async () => undefined);
    const port = {
      rootActivityId: "https://learning.example.test/artifacts/artifact-1",
      accept,
    } satisfies LearningEventPort;

    await port.accept(validEvent());

    expect(accept).toHaveBeenCalledWith(validEvent());
  });

  it.each([
    "https://learning.example.test/artifacts/artifact-1",
    "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
    "scaffold:artifact:artifact-1",
  ])("accepts an absolute IRI: %s", (iri) => {
    expect(LearningEventIriSchema.parse(iri)).toBe(iri);
  });

  it.each([
    "",
    "artifact-1",
    "/artifacts/artifact-1",
    " https://learning.example.test/artifacts/artifact-1",
    "https://learning.example.test/artifacts/artifact 1",
  ])("rejects a non-absolute or non-canonical IRI: %s", (iri) => {
    expect(LearningEventIriSchema.safeParse(iri).success).toBe(false);
  });

  it.each([
    { id: "not-a-uuid" },
    { timestamp: "2026-07-25T10:15:30Z" },
    { timestamp: "2026-07-25T10:15:30.123+01:00" },
    { timestamp: "2026-02-30T10:15:30.123Z" },
  ])("rejects invalid event identity or event time: %o", (override) => {
    expect(LearningEventSchema.safeParse({ ...validEvent(), ...override }).success).toBe(false);
  });

  it.each(["actor", "stored", "authority", "version", "attachments", "type", "payload"])(
    "rejects the adapter-owned or unsupported %s property",
    (property) => {
      expect(LearningEventSchema.safeParse({ ...validEvent(), [property]: {} }).success).toBe(
        false,
      );
    },
  );

  it.each([
    { description: "unknown event field", value: { ...validEvent(), destination: "lrs" } },
    {
      description: "unknown nested field",
      value: { ...validEvent(), result: { response: "choice-a", retry: true } },
    },
    { description: "invalid duration", value: { ...validEvent(), result: { duration: "45s" } } },
    {
      description: "invalid extension key",
      value: { ...validEvent(), result: { extensions: { attempt: 1 } } },
    },
    {
      description: "undefined extension value",
      value: {
        ...validEvent(),
        result: {
          extensions: { "https://scaffold.example/xapi/extensions/value": undefined },
        },
      },
    },
    {
      description: "non-finite extension value",
      value: {
        ...validEvent(),
        result: {
          extensions: { "https://scaffold.example/xapi/extensions/value": Number.NaN },
        },
      },
    },
    {
      description: "empty extension object",
      value: {
        ...validEvent(),
        result: { extensions: { "https://scaffold.example/xapi/extensions/value": {} } },
      },
    },
  ])("rejects $description", ({ value }) => {
    expect(LearningEventSchema.safeParse(value).success).toBe(false);
  });

  it("accepts response-bearing results and nested JSON extension values", () => {
    const parsed = LearningEventSchema.parse(validEvent());

    expect(parsed.result?.response).toBe("choice-a");
    expect(parsed.result?.extensions).toStrictEqual({
      "https://scaffold.example/xapi/extensions/attempt": {
        number: 1,
        flags: [true, null],
      },
    });
  });
});
