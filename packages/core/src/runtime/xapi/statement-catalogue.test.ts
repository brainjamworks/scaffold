import { describe, expect, it } from "vite-plus/test";

import type {
  AssessmentInteractionKind,
  AssessmentResponseValue,
  AssessmentResult,
} from "@scaffold/contracts";
import type { XapiStatementDraft } from "../../host/ports/xapi";
import {
  XAPI_ACTIVITY_TYPES,
  XAPI_EXTENSIONS,
  XAPI_VERBS,
  buildAnsweredStatementDraft,
  buildHintInteractedStatementDraft,
  buildInitializedStatementDraft,
  buildLearnerActivityCompletedStatementDraft,
  buildLearnerActivityInteractedStatementDraft,
  buildQuizCompletedStatementDraft,
  buildQuizSuccessStatementDraft,
  buildTerminatedStatementDraft,
  createAssessmentActivityId,
  createHintActivityId,
  createLearnerActivityId,
  createQuizActivityId,
  encodeAssessmentResponse,
  isXapiLearnerActivityKind,
} from "./index";

const ROOT_ACTIVITY_ID = "https://lms.example.test/courses/course-one";

function normalizedResult(
  overrides: Partial<Pick<AssessmentResult, "isCorrect" | "score">> = {},
): Pick<AssessmentResult, "isCorrect" | "score"> {
  return {
    isCorrect: true,
    score: 1,
    ...overrides,
  };
}

describe("xAPI catalogue vocabulary", () => {
  it("defines the approved immutable verbs, Activity types, and extensions", () => {
    expect(XAPI_VERBS).toStrictEqual({
      initialized: {
        id: "http://adlnet.gov/expapi/verbs/initialized",
        display: { en: "initialized" },
      },
      answered: {
        id: "http://adlnet.gov/expapi/verbs/answered",
        display: { en: "answered" },
      },
      interacted: {
        id: "http://adlnet.gov/expapi/verbs/interacted",
        display: { en: "interacted" },
      },
      completed: {
        id: "http://adlnet.gov/expapi/verbs/completed",
        display: { en: "completed" },
      },
      passed: {
        id: "http://adlnet.gov/expapi/verbs/passed",
        display: { en: "passed" },
      },
      failed: {
        id: "http://adlnet.gov/expapi/verbs/failed",
        display: { en: "failed" },
      },
      terminated: {
        id: "http://adlnet.gov/expapi/verbs/terminated",
        display: { en: "terminated" },
      },
    });
    expect(XAPI_ACTIVITY_TYPES).toStrictEqual({
      course: "http://adlnet.gov/expapi/activities/course",
      quiz: "http://adlnet.gov/expapi/activities/assessment",
      assessmentQuestion: "http://adlnet.gov/expapi/activities/cmi.interaction",
      learnerActivity: "https://scaffold.ac/xapi/activity-types/learner-activity",
      hint: "https://scaffold.ac/xapi/activity-types/hint",
    });
    expect(XAPI_EXTENSIONS).toStrictEqual({
      assessmentAttemptNumber: "https://scaffold.ac/xapi/extensions/assessment-attempt-number",
      assessmentInteractionKind: "https://scaffold.ac/xapi/extensions/assessment-interaction-kind",
      quizAttemptId: "https://scaffold.ac/xapi/extensions/quiz-attempt-id",
      learnerActivityKind: "https://scaffold.ac/xapi/extensions/learner-activity-kind",
      hintNumber: "https://scaffold.ac/xapi/extensions/hint-number",
    });

    expect(Object.isFrozen(XAPI_VERBS)).toBe(true);
    expect(Object.values(XAPI_VERBS).every(Object.isFrozen)).toBe(true);
    expect(Object.values(XAPI_VERBS).every((verb) => Object.isFrozen(verb.display))).toBe(true);
    expect(Object.isFrozen(XAPI_ACTIVITY_TYPES)).toBe(true);
    expect(Object.isFrozen(XAPI_EXTENSIONS)).toBe(true);
  });

  it.each([
    ["single-select", "choice"],
    ["multi-select", "choice"],
    ["sequence", "sequencing"],
    ["match", "matching"],
    ["classify", "matching"],
    ["fill-blanks", "other"],
    ["spatial-hotspot", "other"],
  ] satisfies readonly (readonly [AssessmentInteractionKind, string])[])(
    "maps %s to the %s xAPI interaction type",
    (interactionKind, interactionType) => {
      expect(
        buildAnsweredStatementDraft({
          rootActivityId: ROOT_ACTIVITY_ID,
          targetId: "question-one",
          interactionKind,
          response: null,
          result: normalizedResult(),
          attemptNumber: 1,
        }).object.definition?.interactionType,
      ).toBe(interactionType);
    },
  );
});

describe("xAPI assessment response encoding", () => {
  it.each([
    {
      interactionKind: "single-select",
      response: { kind: "single-select", optionId: "option /é" },
      interactionType: "choice",
      encodedResponse: "option%20%2F%C3%A9",
    },
    {
      interactionKind: "multi-select",
      response: {
        kind: "multi-select",
        optionIds: ["option[,]b", "option a"],
      },
      interactionType: "choice",
      encodedResponse: "option%20a[,]option%5B%2C%5Db",
    },
    {
      interactionKind: "sequence",
      response: {
        kind: "sequence",
        orderedItemIds: ["item b", "item/a"],
      },
      interactionType: "sequencing",
      encodedResponse: "item%20b[,]item%2Fa",
    },
    {
      interactionKind: "match",
      response: {
        kind: "match",
        pairs: [
          { itemId: "item-b", targetId: "target[,]2" },
          { itemId: "item a", targetId: "target.1" },
        ],
      },
      interactionType: "matching",
      encodedResponse: "item%20a[.]target.1[,]item-b[.]target%5B%2C%5D2",
    },
    {
      interactionKind: "classify",
      response: {
        kind: "classify",
        placements: [
          { itemId: "item-b", categoryId: "category 2" },
          { itemId: "item/a", categoryId: "category[,]1" },
        ],
      },
      interactionType: "matching",
      encodedResponse: "item%2Fa[.]category%5B%2C%5D1[,]item-b[.]category%202",
    },
    {
      interactionKind: "fill-blanks",
      response: {
        kind: "fill-blanks",
        blanks: [
          { blankId: "blank-b", value: "second" },
          { blankId: "blank a", value: "Mercury[,]Venus" },
          { blankId: "blank-c", value: "" },
        ],
      },
      interactionType: "other",
      encodedResponse:
        '{"blanks":[{"blankId":"blank a","value":"Mercury[,]Venus"},{"blankId":"blank-b","value":"second"},{"blankId":"blank-c","value":""}]}',
    },
    {
      interactionKind: "spatial-hotspot",
      response: {
        kind: "spatial-hotspot",
        selections: [
          { hotspotId: null, x: -0, y: 0.75 },
          { hotspotId: "hotspot[,]1", x: 0.5, y: 0.25 },
        ],
      },
      interactionType: "other",
      encodedResponse:
        '{"selections":[{"hotspotId":null,"x":0,"y":0.75},{"hotspotId":"hotspot[,]1","x":0.5,"y":0.25}]}',
    },
  ] satisfies readonly {
    readonly interactionKind: AssessmentInteractionKind;
    readonly response: AssessmentResponseValue;
    readonly interactionType: string;
    readonly encodedResponse: string;
  }[])("encodes $interactionKind losslessly", (testCase) => {
    expect(encodeAssessmentResponse(testCase.interactionKind, testCase.response)).toStrictEqual({
      interactionType: testCase.interactionType,
      response: testCase.encodedResponse,
    });
  });

  it.each([
    ["single-select", null],
    ["single-select", { kind: "single-select", optionId: null }],
    ["multi-select", { kind: "multi-select", optionIds: [] }],
    ["sequence", { kind: "sequence", orderedItemIds: [] }],
    ["match", { kind: "match", pairs: [] }],
    ["classify", { kind: "classify", placements: [] }],
    ["fill-blanks", { kind: "fill-blanks", blanks: [{ blankId: "blank-1", value: "  " }] }],
    ["spatial-hotspot", { kind: "spatial-hotspot", selections: [] }],
  ] satisfies readonly (readonly [AssessmentInteractionKind, AssessmentResponseValue | null])[])(
    "omits an absent %s response",
    (interactionKind, response) => {
      expect(encodeAssessmentResponse(interactionKind, response)).not.toHaveProperty("response");
    },
  );

  it("rejects a response whose kind does not match the registered interaction", () => {
    expect(() =>
      encodeAssessmentResponse("single-select", {
        kind: "multi-select",
        optionIds: ["option-a"],
      }),
    ).toThrow("does not match");
  });
});

describe("xAPI Activity identities", () => {
  it("derives every child identity with stable query ordering", () => {
    expect(createQuizActivityId(ROOT_ACTIVITY_ID, "quiz-one")).toBe(
      "https://scaffold.ac/xapi/activities/quiz?root=https%3A%2F%2Flms.example.test%2Fcourses%2Fcourse-one&id=quiz-one",
    );
    expect(createAssessmentActivityId(ROOT_ACTIVITY_ID, "question-one")).toBe(
      "https://scaffold.ac/xapi/activities/assessment?root=https%3A%2F%2Flms.example.test%2Fcourses%2Fcourse-one&id=question-one",
    );
    expect(createLearnerActivityId(ROOT_ACTIVITY_ID, "flashcards-one")).toBe(
      "https://scaffold.ac/xapi/activities/learner-activity?root=https%3A%2F%2Flms.example.test%2Fcourses%2Fcourse-one&id=flashcards-one",
    );
    expect(createHintActivityId(ROOT_ACTIVITY_ID, "question-one", 2)).toBe(
      "https://scaffold.ac/xapi/activities/hint?root=https%3A%2F%2Flms.example.test%2Fcourses%2Fcourse-one&id=question-one&number=2",
    );
  });

  it("uses strict RFC 3986 encoding with uppercase escapes and no plus-space encoding", () => {
    const rootActivityId = "https://lms.example.test/course?id=course-one&version=1";
    const localId = "question !'()* /é";

    expect(createAssessmentActivityId(rootActivityId, localId)).toBe(
      "https://scaffold.ac/xapi/activities/assessment?root=https%3A%2F%2Flms.example.test%2Fcourse%3Fid%3Dcourse-one%26version%3D1&id=question%20%21%27%28%29%2A%20%2F%C3%A9",
    );
  });

  it.each([
    () => createQuizActivityId("course-one", "quiz-one"),
    () => createAssessmentActivityId(" /course-one", "question-one"),
    () => createLearnerActivityId(ROOT_ACTIVITY_ID, " "),
    () => createHintActivityId(ROOT_ACTIVITY_ID, "", 1),
    () => createHintActivityId(ROOT_ACTIVITY_ID, "question-one", 0),
    () => createHintActivityId(ROOT_ACTIVITY_ID, "question-one", 1.5),
  ])("rejects an invalid root, local identity, or hint number", (deriveIdentity) => {
    expect(deriveIdentity).toThrow();
  });
});

describe("xAPI Statement catalogue builders", () => {
  it("builds initialized with the root course Activity and a normalized title", () => {
    expect(
      buildInitializedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        title: "  Course One  ",
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.initialized,
      object: {
        objectType: "Activity",
        id: ROOT_ACTIVITY_ID,
        definition: {
          name: { en: "Course One" },
          type: XAPI_ACTIVITY_TYPES.course,
        },
      },
    });

    expect(
      buildInitializedStatementDraft({ rootActivityId: ROOT_ACTIVITY_ID, title: " " }).object,
    ).toStrictEqual({
      objectType: "Activity",
      id: ROOT_ACTIVITY_ID,
      definition: { type: XAPI_ACTIVITY_TYPES.course },
    });
  });

  it("builds an authoritative standalone answered draft", () => {
    expect(
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "option/a" },
        result: normalizedResult({ isCorrect: false, score: 0.25 }),
        attemptNumber: 2,
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.answered,
      object: {
        objectType: "Activity",
        id: createAssessmentActivityId(ROOT_ACTIVITY_ID, "question-one"),
        definition: {
          type: XAPI_ACTIVITY_TYPES.assessmentQuestion,
          interactionType: "choice",
          extensions: {
            [XAPI_EXTENSIONS.assessmentInteractionKind]: "single-select",
          },
        },
      },
      result: {
        success: false,
        score: { scaled: 0.25, raw: 0.25, min: 0, max: 1 },
        response: "option%2Fa",
        extensions: { [XAPI_EXTENSIONS.assessmentAttemptNumber]: 2 },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: ROOT_ACTIVITY_ID,
              definition: { type: XAPI_ACTIVITY_TYPES.course },
            },
          ],
        },
      },
    });
  });

  it("builds quiz answer Context from explicit quiz and attempt identities", () => {
    expect(
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        interactionKind: "sequence",
        response: null,
        result: normalizedResult(),
        attemptNumber: 1,
        quiz: { quizId: "quiz-one", attemptId: "attempt-one" },
      }).context,
    ).toStrictEqual({
      contextActivities: {
        parent: [
          {
            objectType: "Activity",
            id: createQuizActivityId(ROOT_ACTIVITY_ID, "quiz-one"),
            definition: { type: XAPI_ACTIVITY_TYPES.quiz },
          },
        ],
      },
      extensions: { [XAPI_EXTENSIONS.quizAttemptId]: "attempt-one" },
    });
  });

  it("builds a persisted hint interaction without hint content", () => {
    expect(
      buildHintInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        hintNumber: 2,
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.interacted,
      object: {
        objectType: "Activity",
        id: createHintActivityId(ROOT_ACTIVITY_ID, "question-one", 2),
        definition: { type: XAPI_ACTIVITY_TYPES.hint },
      },
      result: {
        extensions: { [XAPI_EXTENSIONS.hintNumber]: 2 },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: createAssessmentActivityId(ROOT_ACTIVITY_ID, "question-one"),
              definition: { type: XAPI_ACTIVITY_TYPES.assessmentQuestion },
            },
          ],
        },
      },
    });
  });

  it("builds allowlisted learner-activity progress and completion", () => {
    const input = {
      rootActivityId: ROOT_ACTIVITY_ID,
      blockId: "flashcards-one",
      activityKind: "flashcard" as const,
    };
    const object = {
      objectType: "Activity",
      id: createLearnerActivityId(ROOT_ACTIVITY_ID, "flashcards-one"),
      definition: {
        type: XAPI_ACTIVITY_TYPES.learnerActivity,
        extensions: { [XAPI_EXTENSIONS.learnerActivityKind]: "flashcard" },
      },
    };
    const context = {
      contextActivities: {
        parent: [
          {
            objectType: "Activity",
            id: ROOT_ACTIVITY_ID,
            definition: { type: XAPI_ACTIVITY_TYPES.course },
          },
        ],
      },
    };

    expect(buildLearnerActivityInteractedStatementDraft(input)).toStrictEqual({
      verb: XAPI_VERBS.interacted,
      object,
      context,
    });
    expect(buildLearnerActivityCompletedStatementDraft(input)).toStrictEqual({
      verb: XAPI_VERBS.completed,
      object,
      result: { completion: true },
      context,
    });
  });

  it("builds terminal quiz completion with a valid authoritative duration", () => {
    expect(
      buildQuizCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt: "2026-07-25T10:00:00.000Z",
        finishedAt: "2026-07-25T10:05:00.250Z",
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.completed,
      object: {
        objectType: "Activity",
        id: createQuizActivityId(ROOT_ACTIVITY_ID, "quiz-one"),
        definition: { type: XAPI_ACTIVITY_TYPES.quiz },
      },
      result: { completion: true, duration: "PT300.25S" },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: ROOT_ACTIVITY_ID,
              definition: { type: XAPI_ACTIVITY_TYPES.course },
            },
          ],
        },
        extensions: { [XAPI_EXTENSIONS.quizAttemptId]: "attempt-one" },
      },
    });
  });

  it.each([
    [null, "2026-07-25T10:05:00.000Z"],
    ["not-a-timestamp", "2026-07-25T10:05:00.000Z"],
    ["2026-07-25T10:05:00.000Z", "2026-07-25T10:00:00.000Z"],
    ["2026-02-30T10:00:00.000Z", "2026-03-01T10:00:00.000Z"],
  ])("omits invented duration for invalid authoritative instants", (startedAt, finishedAt) => {
    expect(
      buildQuizCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt,
        finishedAt,
      }).result,
    ).toStrictEqual({ completion: true });
  });

  it.each([
    ["passed", true, XAPI_VERBS.passed],
    ["failed", false, XAPI_VERBS.failed],
  ] as const)("builds an explicit authoritative %s draft", (successStatus, success, verb) => {
    expect(
      buildQuizSuccessStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        successStatus,
        score: 3,
        maxScore: 4,
      }),
    ).toStrictEqual({
      verb,
      object: {
        objectType: "Activity",
        id: createQuizActivityId(ROOT_ACTIVITY_ID, "quiz-one"),
        definition: { type: XAPI_ACTIVITY_TYPES.quiz },
      },
      result: {
        success,
        score: { scaled: 0.75, raw: 3, min: 0, max: 4 },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: ROOT_ACTIVITY_ID,
              definition: { type: XAPI_ACTIVITY_TYPES.course },
            },
          ],
        },
        extensions: { [XAPI_EXTENSIONS.quizAttemptId]: "attempt-one" },
      },
    });
  });

  it("builds termination for the same root Activity with session duration", () => {
    expect(
      buildTerminatedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        title: "Course One",
        durationMs: 90_061,
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.terminated,
      object: {
        objectType: "Activity",
        id: ROOT_ACTIVITY_ID,
        definition: {
          name: { en: "Course One" },
          type: XAPI_ACTIVITY_TYPES.course,
        },
      },
      result: { duration: "PT90.061S" },
    });
  });
});

describe("xAPI catalogue invariants", () => {
  it.each([0, -1, 1.5])("rejects invalid assessment attempt number %s", (attemptNumber) => {
    expect(() =>
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        interactionKind: "single-select",
        response: null,
        result: normalizedResult(),
        attemptNumber,
      }),
    ).toThrow();
  });

  it("rejects blank authoritative quiz attempt identity", () => {
    expect(() =>
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        interactionKind: "single-select",
        response: null,
        result: normalizedResult(),
        attemptNumber: 1,
        quiz: { quizId: "quiz-one", attemptId: " " },
      }),
    ).toThrow();
    expect(() =>
      buildQuizCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "",
        startedAt: "2026-07-25T10:00:00.000Z",
        finishedAt: "2026-07-25T10:05:00.000Z",
      }),
    ).toThrow();
  });

  it("admits only the two approved learner-activity kinds", () => {
    expect(isXapiLearnerActivityKind("flashcard")).toBe(true);
    expect(isXapiLearnerActivityKind("checklist")).toBe(true);
    expect(isXapiLearnerActivityKind("video")).toBe(false);

    expect(() =>
      buildLearnerActivityInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "video-one",
        activityKind: "video" as "flashcard",
      }),
    ).toThrow();
  });

  it.each([
    { score: -1, maxScore: 4 },
    { score: 5, maxScore: 4 },
    { score: 1, maxScore: 0 },
    { score: Number.NaN, maxScore: 4 },
    { score: 1, maxScore: Number.POSITIVE_INFINITY },
  ])("rejects an invalid terminal score range: %o", ({ score, maxScore }) => {
    expect(() =>
      buildQuizSuccessStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        successStatus: "passed",
        score,
        maxScore,
      }),
    ).toThrow();
  });

  it("cannot infer pass or fail when authoritative success status is absent", () => {
    expect(() =>
      buildQuizSuccessStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        successStatus: undefined as never,
        score: 3,
        maxScore: 4,
      }),
    ).toThrow();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid explicit session duration %s",
    (durationMs) => {
      expect(() =>
        buildTerminatedStatementDraft({
          rootActivityId: ROOT_ACTIVITY_ID,
          durationMs,
        }),
      ).toThrow();
    },
  );

  it("preserves a catalogue-wide privacy allowlist", () => {
    const privateCanaries = {
      feedback: "PRIVATE_FEEDBACK",
      items: "PRIVATE_ITEMS",
      answerKey: "PRIVATE_ANSWER_KEY",
      hintText: "PRIVATE_HINT_TEXT",
      data: "PRIVATE_LEARNER_DATA",
      actor: "PRIVATE_ACTOR",
      credential: "PRIVATE_CREDENTIAL",
      endpoint: "PRIVATE_ENDPOINT",
      registration: "PRIVATE_REGISTRATION",
      platform: "PRIVATE_PLATFORM",
    };
    const privateResult = {
      ...normalizedResult(),
      ...privateCanaries,
    } as Pick<AssessmentResult, "isCorrect" | "score">;
    const drafts: readonly XapiStatementDraft[] = [
      buildInitializedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        title: "Course One",
        ...privateCanaries,
      }),
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "authorized-response" },
        result: privateResult,
        attemptNumber: 1,
        ...privateCanaries,
      }),
      buildAnsweredStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "authorized-response" },
        result: privateResult,
        attemptNumber: 1,
        quiz: { quizId: "quiz-one", attemptId: "attempt-one", ...privateCanaries },
      }),
      buildHintInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        hintNumber: 1,
        ...privateCanaries,
      }),
      buildLearnerActivityInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "flashcards-one",
        activityKind: "flashcard",
        ...privateCanaries,
      }),
      buildLearnerActivityCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "checklist-one",
        activityKind: "checklist",
        ...privateCanaries,
      }),
      buildQuizCompletedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt: "2026-07-25T10:00:00.000Z",
        finishedAt: "2026-07-25T10:05:00.000Z",
        ...privateCanaries,
      }),
      buildQuizSuccessStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        successStatus: "passed",
        score: 3,
        maxScore: 4,
        ...privateCanaries,
      }),
      buildTerminatedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        title: "Course One",
        durationMs: 300_000,
        ...privateCanaries,
      }),
    ];
    const allowedKeys = new Set([
      "verb",
      "object",
      "result",
      "context",
      "id",
      "display",
      "en",
      "objectType",
      "definition",
      "name",
      "type",
      "interactionType",
      "extensions",
      "score",
      "scaled",
      "raw",
      "min",
      "max",
      "success",
      "completion",
      "response",
      "duration",
      "contextActivities",
      "parent",
      ...Object.values(XAPI_EXTENSIONS),
    ]);

    const observedKeys = new Set<string>();
    const collectKeys = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(collectKeys);
        return;
      }
      if (typeof value !== "object" || value === null) return;
      for (const [key, child] of Object.entries(value)) {
        observedKeys.add(key);
        collectKeys(child);
      }
    };
    drafts.forEach(collectKeys);

    for (const draft of drafts) {
      expect(JSON.parse(JSON.stringify(draft))).toStrictEqual(draft);
    }
    expect([...observedKeys].filter((key) => !allowedKeys.has(key))).toStrictEqual([]);
    const serialized = JSON.stringify(drafts);
    for (const [privateKey, privateValue] of Object.entries(privateCanaries)) {
      expect(serialized).not.toContain(privateKey);
      expect(serialized).not.toContain(privateValue);
    }
    expect(serialized).toContain("authorized-response");
    expect(serialized).not.toContain("correctResponsesPattern");
    expect(serialized).not.toContain("attachments");
    expect(serialized).not.toContain("authority");
    expect(serialized).not.toContain("stored");
    expect(serialized).not.toContain("version");
  });
});
