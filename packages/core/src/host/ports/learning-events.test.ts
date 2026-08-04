import { describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import {
  LearningEventIriSchema,
  LearningEventSchema,
  type LearningEvent,
  type LearningEventPort,
} from "./learning-events";

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

describe("Learning Event contract", () => {
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
      expect(
        LearningEventSchema.safeParse({ ...validEvent(), [property]: {} }).success,
      ).toBe(false);
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
