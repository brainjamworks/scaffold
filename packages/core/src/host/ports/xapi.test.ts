import { describe, expect, expectTypeOf, it } from "vite-plus/test";

import { XapiIriSchema, XapiStatementTemplateSchema, type XapiStatementTemplate } from "./xapi";

function validStatement(): XapiStatementTemplate {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    timestamp: "2026-07-25T10:15:30.123Z",
    verb: {
      id: "https://w3id.org/xapi/adl/verbs/answered",
      display: {
        "en-GB": "answered",
      },
    },
    object: {
      objectType: "Activity",
      id: "https://learning.example.test/courses/course-1/questions/question-1",
      definition: {
        name: {
          "en-GB": "Question 1",
        },
        type: "http://adlnet.gov/expapi/activities/question",
        interactionType: "choice",
        extensions: {
          "https://scaffold.example/xapi/extensions/question-position": 1,
        },
      },
    },
    result: {
      score: {
        scaled: 1,
        raw: 2,
        min: 0,
        max: 2,
      },
      success: true,
      completion: true,
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
            id: "https://learning.example.test/courses/course-1",
          },
        ],
        category: [
          {
            objectType: "Activity",
            id: "https://w3id.org/xapi/cmi5/context/categories/cmi5",
          },
        ],
      },
      extensions: {
        "https://scaffold.example/xapi/extensions/attempt-id": "attempt-1",
      },
    },
  };
}

describe("xAPI Statement template contract", () => {
  it("accepts the approved standard partial Statement shape", () => {
    const statement = validStatement();

    expect(XapiStatementTemplateSchema.parse(statement)).toStrictEqual(statement);
    expectTypeOf(
      XapiStatementTemplateSchema.parse(statement),
    ).toMatchTypeOf<XapiStatementTemplate>();
    expect(JSON.parse(JSON.stringify(statement))).toStrictEqual(statement);
  });

  it("accepts a standard Activity description language map", () => {
    const statement = validStatement();

    expect(
      XapiStatementTemplateSchema.parse({
        ...statement,
        object: {
          ...statement.object,
          definition: {
            ...statement.object.definition,
            description: {
              "en-GB": "Which city is the capital of France?",
            },
          },
        },
      }).object.definition,
    ).toMatchObject({
      description: {
        "en-GB": "Which city is the capital of France?",
      },
    });
  });

  it.each([
    "https://learning.example.test/courses/course-1",
    "urn:uuid:550e8400-e29b-41d4-a716-446655440000",
    "scaffold:course:course-1",
  ])("accepts an absolute IRI: %s", (iri) => {
    expect(XapiIriSchema.parse(iri)).toBe(iri);
  });

  it.each([
    "",
    "course-1",
    "/courses/course-1",
    " https://learning.example.test/courses/course-1",
    "https://learning.example.test/courses/course 1",
  ])("rejects a non-absolute or non-canonical IRI: %s", (iri) => {
    expect(XapiIriSchema.safeParse(iri).success).toBe(false);
  });

  it.each(["en-GB", "x-private", "X-PRIVATE", "i-klingon", "zh-min-nan"])(
    "accepts an RFC 5646 language tag: %s",
    (languageTag) => {
      expect(
        XapiStatementTemplateSchema.safeParse({
          ...validStatement(),
          verb: {
            id: "https://w3id.org/xapi/adl/verbs/answered",
            display: {
              [languageTag]: "answered",
            },
          },
        }).success,
      ).toBe(true);
    },
  );

  it.each([
    { id: "not-a-uuid" },
    { timestamp: "2026-07-25T10:15:30Z" },
    { timestamp: "2026-07-25T10:15:30.123+01:00" },
    { timestamp: "2026-02-30T10:15:30.123Z" },
  ])("rejects invalid Statement identity or event time: %o", (override) => {
    expect(
      XapiStatementTemplateSchema.safeParse({
        ...validStatement(),
        ...override,
      }).success,
    ).toBe(false);
  });

  it.each([
    { scaled: 1.1 },
    { raw: 0, min: 0, max: 0 },
    { raw: -1, min: 0, max: 1 },
    { raw: 2, min: 0, max: 1 },
    {},
  ])("rejects an invalid score: %o", (score) => {
    expect(
      XapiStatementTemplateSchema.safeParse({
        ...validStatement(),
        result: {
          score,
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    { description: "blank language-map value", display: { "en-GB": " " } },
    { description: "invalid language tag", display: { not_a_tag: "answered" } },
    { description: "empty language map", display: {} },
  ])("rejects $description", ({ display }) => {
    expect(
      XapiStatementTemplateSchema.safeParse({
        ...validStatement(),
        verb: {
          id: "https://w3id.org/xapi/adl/verbs/answered",
          display,
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    { description: "undefined", value: undefined },
    { description: "not-a-number", value: Number.NaN },
    { description: "infinity", value: Number.POSITIVE_INFINITY },
    { description: "empty object", value: {} },
    { description: "class instance", value: new (class Value {})() },
  ])("rejects $description as an extension JSON value", ({ value }) => {
    expect(
      XapiStatementTemplateSchema.safeParse({
        ...validStatement(),
        result: {
          extensions: {
            "https://scaffold.example/xapi/extensions/value": value,
          },
        },
      }).success,
    ).toBe(false);
  });

  it.each([
    { definition: {} },
    { result: {} },
    { context: {} },
    { context: { contextActivities: {} } },
    { result: { extensions: {} } },
  ])("rejects an empty nested object: %o", (override) => {
    expect(
      XapiStatementTemplateSchema.safeParse({
        ...validStatement(),
        ...override,
      }).success,
    ).toBe(false);
  });

  it.each([
    { result: undefined },
    { result: { completion: undefined } },
    {
      object: {
        objectType: "Activity",
        id: "https://learning.example.test/courses/course-1/questions/question-1",
        definition: undefined,
      },
    },
  ])("rejects explicit undefined properties: %o", (override) => {
    expect(
      XapiStatementTemplateSchema.safeParse({
        ...validStatement(),
        ...override,
      }).success,
    ).toBe(false);
  });

  it.each(["actor", "stored", "authority", "version", "attachments"])(
    "rejects the adapter-owned or unsupported %s property",
    (property) => {
      expect(
        XapiStatementTemplateSchema.safeParse({
          ...validStatement(),
          [property]: {},
        }).success,
      ).toBe(false);
    },
  );

  it("accepts a standard learner response string", () => {
    expect(
      XapiStatementTemplateSchema.safeParse({
        ...validStatement(),
        result: {
          response: "choice-a",
        },
      }).success,
    ).toBe(true);
  });
});
