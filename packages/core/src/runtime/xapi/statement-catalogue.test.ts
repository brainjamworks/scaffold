import { describe, expect, it } from "vite-plus/test";

import type {
  AssessmentInteractionContract,
  AssessmentInteractionKind,
  AssessmentResponseValue,
  AssessmentResult,
} from "@scaffold/contracts";
import type { XapiActivityDefinition, XapiStatementDraft } from "../../host/ports/xapi";
import {
  XAPI_ACTIVITY_TYPES,
  XAPI_EXTENSIONS,
  XAPI_VERBS,
  buildAssessmentActivityDefinition,
  buildAnsweredStatementDraft,
  buildHintInteractedStatementDraft,
  buildInitializedStatementDraft,
  buildLearnerActivityCompletedStatementDraft,
  buildLearnerActivityInteractedStatementDraft,
  buildLayoutSectionExperiencedStatementDraft,
  buildResourceLaunchedStatementDraft,
  buildResourceAttemptedStatementDraft,
  buildResourceCompletedStatementDraft,
  buildResourcePageExperiencedStatementDraft,
  buildQuizAttemptedStatementDraft,
  buildQuizCompletedStatementDraft,
  buildQuizSuccessStatementDraft,
  buildSurfaceExperiencedStatementDraft,
  buildTerminatedStatementDraft,
  buildVisualItemExperiencedStatementDraft,
  createAssessmentActivityId,
  createHintActivityId,
  createLearnerActivityId,
  createLayoutSectionActivityId,
  createQuizActivityId,
  createResourceActivityId,
  createResourcePageActivityId,
  createSurfaceActivityId,
  createVisualCompositionActivityId,
  createVisualItemActivityId,
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
      launched: {
        id: "http://adlnet.gov/expapi/verbs/launched",
        display: { en: "launched" },
      },
      experienced: {
        id: "http://adlnet.gov/expapi/verbs/experienced",
        display: { en: "experienced" },
      },
      attempted: {
        id: "http://adlnet.gov/expapi/verbs/attempted",
        display: { en: "attempted" },
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
      surface: "https://scaffold.ac/xapi/activity-types/surface",
      layoutSection: "https://scaffold.ac/xapi/activity-types/layout-section",
      hint: "https://scaffold.ac/xapi/activity-types/hint",
      resource: "https://scaffold.ac/xapi/activity-types/resource",
      resourcePage: "https://scaffold.ac/xapi/activity-types/resource-page",
      visualComposition: "https://scaffold.ac/xapi/activity-types/visual-composition",
      visualItem: "https://scaffold.ac/xapi/activity-types/visual-item",
    });
    expect(XAPI_EXTENSIONS).toStrictEqual({
      assessmentAttemptNumber: "https://scaffold.ac/xapi/extensions/assessment-attempt-number",
      assessmentInteractionKind: "https://scaffold.ac/xapi/extensions/assessment-interaction-kind",
      quizAttemptId: "https://scaffold.ac/xapi/extensions/quiz-attempt-id",
      learnerActivityKind: "https://scaffold.ac/xapi/extensions/learner-activity-kind",
      learnerActivityEvent: "https://scaffold.ac/xapi/extensions/learner-activity-event",
      surfaceKind: "https://scaffold.ac/xapi/extensions/surface-kind",
      surfacePosition: "https://scaffold.ac/xapi/extensions/surface-position",
      surfaceCount: "https://scaffold.ac/xapi/extensions/surface-count",
      layoutKind: "https://scaffold.ac/xapi/extensions/layout-kind",
      layoutSectionPosition: "https://scaffold.ac/xapi/extensions/layout-section-position",
      layoutSectionCount: "https://scaffold.ac/xapi/extensions/layout-section-count",
      hintNumber: "https://scaffold.ac/xapi/extensions/hint-number",
      resourceKind: "https://scaffold.ac/xapi/extensions/resource-kind",
      resourcePageNumber: "https://scaffold.ac/xapi/extensions/resource-page-number",
      resourcePageCount: "https://scaffold.ac/xapi/extensions/resource-page-count",
      visualItemKind: "https://scaffold.ac/xapi/extensions/visual-item-kind",
      visualItemPosition: "https://scaffold.ac/xapi/extensions/visual-item-position",
      visualItemCount: "https://scaffold.ac/xapi/extensions/visual-item-count",
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
          activityDescription: "Which answer is correct?",
          interactionKind,
          response: null,
          result: normalizedResult(),
          attemptNumber: 1,
        }).object.definition,
      ).toMatchObject({
        description: { en: "Which answer is correct?" },
        interactionType,
      });
    },
  );

  it.each([
    {
      interaction: {
        kind: "single-select",
        options: [{ id: "option /é", label: "Paris" }],
      },
      expected: {
        interactionType: "choice",
        choices: [{ id: "option%20%2F%C3%A9", description: { en: "Paris" } }],
      },
    },
    {
      interaction: {
        kind: "multi-select",
        options: [{ id: "option-a" }, { id: "option-b", label: "Second" }],
        maxSelections: 2,
      },
      expected: {
        interactionType: "choice",
        choices: [{ id: "option-a" }, { id: "option-b", description: { en: "Second" } }],
      },
    },
    {
      interaction: {
        kind: "sequence",
        items: [{ id: "step-1", label: "First step" }],
      },
      expected: {
        interactionType: "sequencing",
        choices: [{ id: "step-1", description: { en: "First step" } }],
      },
    },
    {
      interaction: {
        kind: "match",
        items: [{ id: "left-1", label: "France" }],
        targets: [{ id: "right-1", label: "Paris" }],
      },
      expected: {
        interactionType: "matching",
        source: [{ id: "left-1", description: { en: "France" } }],
        target: [{ id: "right-1", description: { en: "Paris" } }],
      },
    },
    {
      interaction: {
        kind: "classify",
        items: [{ id: "item-1", label: "Salmon" }],
        categories: [{ id: "category-1", label: "Fish" }],
      },
      expected: {
        interactionType: "matching",
        source: [{ id: "item-1", description: { en: "Salmon" } }],
        target: [{ id: "category-1", description: { en: "Fish" } }],
      },
    },
    {
      interaction: {
        kind: "fill-blanks",
        blanks: [{ id: "blank-1", label: "Capital" }],
      },
      expected: { interactionType: "other" },
    },
    {
      interaction: {
        kind: "spatial-hotspot",
        hotspots: [
          {
            id: "hotspot-1",
            label: "France",
            geometry: { kind: "circle", centerX: 0.5, centerY: 0.5, radius: 0.1 },
          },
        ],
        maxSelections: 1,
      },
      expected: { interactionType: "other" },
    },
  ] satisfies readonly {
    readonly interaction: AssessmentInteractionContract;
    readonly expected: Partial<XapiActivityDefinition>;
  }[])(
    "derives the standard component lists for $interaction.kind without an answer key",
    ({ interaction, expected }) => {
      const definition = buildAssessmentActivityDefinition({
        activityDescription: "What is the answer?",
        interaction,
      });

      expect(definition).toMatchObject({
        description: { en: "What is the answer?" },
        type: XAPI_ACTIVITY_TYPES.assessmentQuestion,
        extensions: {
          [XAPI_EXTENSIONS.assessmentInteractionKind]: interaction.kind,
        },
        ...expected,
      });
      expect(definition).not.toHaveProperty("correctResponsesPattern");
      if (interaction.kind === "fill-blanks" || interaction.kind === "spatial-hotspot") {
        expect(definition).not.toHaveProperty("choices");
        expect(definition).not.toHaveProperty("source");
        expect(definition).not.toHaveProperty("target");
      }
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
    expect(createResourceActivityId(ROOT_ACTIVITY_ID, "resource-one")).toBe(
      "https://scaffold.ac/xapi/activities/resource?root=https%3A%2F%2Flms.example.test%2Fcourses%2Fcourse-one&id=resource-one",
    );
    expect(createResourcePageActivityId(ROOT_ACTIVITY_ID, "resource-one", 2)).toBe(
      "https://scaffold.ac/xapi/activities/resource-page?root=https%3A%2F%2Flms.example.test%2Fcourses%2Fcourse-one&resource=resource-one&number=2",
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
    () => createResourceActivityId(ROOT_ACTIVITY_ID, ""),
    () => createResourcePageActivityId(ROOT_ACTIVITY_ID, "resource-one", 0),
  ])("rejects an invalid root, local identity, or hint number", (deriveIdentity) => {
    expect(deriveIdentity).toThrow();
  });
});

describe("xAPI Statement catalogue builders", () => {
  it("builds a privacy-safe launched resource Activity", () => {
    expect(
      buildResourceLaunchedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        resourceId: "resource-one",
        resourceKind: "pdf",
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.launched,
      object: {
        objectType: "Activity",
        id: createResourceActivityId(ROOT_ACTIVITY_ID, "resource-one"),
        definition: {
          type: XAPI_ACTIVITY_TYPES.resource,
          extensions: {
            [XAPI_EXTENSIONS.resourceKind]: "pdf",
          },
        },
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
    expect(
      JSON.stringify(
        buildResourceLaunchedStatementDraft({
          rootActivityId: ROOT_ACTIVITY_ID,
          resourceId: "resource-one",
          resourceKind: "pdf",
        }),
      ),
    ).not.toContain("example.com/sample.pdf");
  });

  it("builds audio attempted and playback-reached-end completion", () => {
    const input = {
      rootActivityId: ROOT_ACTIVITY_ID,
      resourceId: "audio-one",
      resourceKind: "audio" as const,
    };
    const object = {
      objectType: "Activity" as const,
      id: createResourceActivityId(ROOT_ACTIVITY_ID, "audio-one"),
      definition: {
        type: XAPI_ACTIVITY_TYPES.resource,
        extensions: {
          [XAPI_EXTENSIONS.resourceKind]: "audio",
        },
      },
    };
    const context = {
      contextActivities: {
        parent: [
          {
            objectType: "Activity" as const,
            id: ROOT_ACTIVITY_ID,
            definition: { type: XAPI_ACTIVITY_TYPES.course },
          },
        ],
      },
    };

    expect(buildResourceAttemptedStatementDraft(input)).toStrictEqual({
      verb: XAPI_VERBS.attempted,
      object,
      context,
    });
    expect(buildResourceCompletedStatementDraft(input)).toStrictEqual({
      verb: XAPI_VERBS.completed,
      object,
      result: { completion: true },
      context,
    });
  });

  it("builds an experienced PDF page parented by its resource", () => {
    expect(
      buildResourcePageExperiencedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        resourceId: "resource-one",
        pageNumber: 2,
        pageCount: 8,
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.experienced,
      object: {
        objectType: "Activity",
        id: createResourcePageActivityId(ROOT_ACTIVITY_ID, "resource-one", 2),
        definition: {
          type: XAPI_ACTIVITY_TYPES.resourcePage,
          extensions: {
            [XAPI_EXTENSIONS.resourcePageNumber]: 2,
            [XAPI_EXTENSIONS.resourcePageCount]: 8,
          },
        },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: createResourceActivityId(ROOT_ACTIVITY_ID, "resource-one"),
              definition: {
                type: XAPI_ACTIVITY_TYPES.resource,
                extensions: {
                  [XAPI_EXTENSIONS.resourceKind]: "pdf",
                },
              },
            },
          ],
        },
      },
    });
  });

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
        activityDescription: "Which answer is correct?",
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
              definition: {
                description: { en: "Which answer is correct?" },
                type: XAPI_ACTIVITY_TYPES.assessmentQuestion,
              },
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

  it("builds an experienced surface Activity with presentation position", () => {
    const surfaceActivityId = createSurfaceActivityId(ROOT_ACTIVITY_ID, "slide-two");
    expect(surfaceActivityId).toBe(
      "https://scaffold.ac/xapi/activities/surface?root=https%3A%2F%2Flms.example.test%2Fcourses%2Fcourse-one&id=slide-two",
    );
    expect(
      buildSurfaceExperiencedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        surfaceId: "slide-two",
        surfaceKind: "slide",
        position: 2,
        count: 4,
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.experienced,
      object: {
        objectType: "Activity",
        id: surfaceActivityId,
        definition: {
          type: XAPI_ACTIVITY_TYPES.surface,
          extensions: {
            [XAPI_EXTENSIONS.surfaceKind]: "slide",
            [XAPI_EXTENSIONS.surfacePosition]: 2,
            [XAPI_EXTENSIONS.surfaceCount]: 4,
          },
        },
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
    expect(() =>
      buildSurfaceExperiencedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        surfaceId: "slide-two",
        surfaceKind: "slide",
        position: 5,
        count: 4,
      }),
    ).toThrow("position must not exceed count");
  });

  it("builds an experienced visual item parented by its composition", () => {
    const compositionId = createVisualCompositionActivityId(
      ROOT_ACTIVITY_ID,
      "annotated-figure-one",
    );
    const itemId = createVisualItemActivityId(
      ROOT_ACTIVITY_ID,
      "annotated-figure-one",
      "annotation-two",
    );

    expect(
      buildVisualItemExperiencedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        compositionId: "annotated-figure-one",
        itemId: "annotation-two",
        itemKind: "annotation",
        position: 2,
        count: 4,
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.experienced,
      object: {
        objectType: "Activity",
        id: itemId,
        definition: {
          type: XAPI_ACTIVITY_TYPES.visualItem,
          extensions: {
            [XAPI_EXTENSIONS.visualItemKind]: "annotation",
            [XAPI_EXTENSIONS.visualItemPosition]: 2,
            [XAPI_EXTENSIONS.visualItemCount]: 4,
          },
        },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: compositionId,
              definition: { type: XAPI_ACTIVITY_TYPES.visualComposition },
            },
          ],
        },
      },
    });
  });

  it("builds an experienced layout-section Activity with navigation position", () => {
    const sectionActivityId = createLayoutSectionActivityId(
      ROOT_ACTIVITY_ID,
      "layout-tabs",
      "tab-two",
    );
    expect(sectionActivityId).toBe(
      "https://scaffold.ac/xapi/activities/layout-section?root=https%3A%2F%2Flms.example.test%2Fcourses%2Fcourse-one&layout=layout-tabs&id=tab-two",
    );
    expect(
      buildLayoutSectionExperiencedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        layoutId: "layout-tabs",
        sectionId: "tab-two",
        layoutKind: "tabs",
        position: 2,
        count: 3,
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.experienced,
      object: {
        objectType: "Activity",
        id: sectionActivityId,
        definition: {
          type: XAPI_ACTIVITY_TYPES.layoutSection,
          extensions: {
            [XAPI_EXTENSIONS.layoutKind]: "tabs",
            [XAPI_EXTENSIONS.layoutSectionPosition]: 2,
            [XAPI_EXTENSIONS.layoutSectionCount]: 3,
          },
        },
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
    expect(() =>
      buildLayoutSectionExperiencedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        layoutId: "layout-tabs",
        sectionId: "tab-two",
        layoutKind: "tabs",
        position: 4,
        count: 3,
      }),
    ).toThrow("position must not exceed count");
  });

  it("describes an experienced accordion section with the shared layout-section shape", () => {
    expect(
      buildLayoutSectionExperiencedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        layoutId: "layout-accordion",
        sectionId: "section-two",
        layoutKind: "accordion",
        position: 2,
        count: 3,
      }),
    ).toMatchObject({
      verb: XAPI_VERBS.experienced,
      object: {
        id: createLayoutSectionActivityId(ROOT_ACTIVITY_ID, "layout-accordion", "section-two"),
        definition: {
          type: XAPI_ACTIVITY_TYPES.layoutSection,
          extensions: {
            [XAPI_EXTENSIONS.layoutKind]: "accordion",
            [XAPI_EXTENSIONS.layoutSectionPosition]: 2,
            [XAPI_EXTENSIONS.layoutSectionCount]: 3,
          },
        },
      },
    });
  });

  it("describes an accepted checklist item toggle without learner state", () => {
    expect(
      buildLearnerActivityInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "checklist-one",
        activityKind: "checklist",
        event: {
          kind: "checklist-item-toggled",
          itemId: "item-two",
          checked: true,
          completedCount: 2,
          total: 4,
        },
      }),
    ).toMatchObject({
      verb: XAPI_VERBS.interacted,
      result: {
        extensions: {
          "https://scaffold.ac/xapi/extensions/learner-activity-event": {
            action: "item-toggled",
            itemId: "item-two",
            checked: true,
            completedCount: 2,
            total: 4,
          },
        },
      },
    });
  });

  it("describes which flashcard face the learner revealed", () => {
    expect(
      buildLearnerActivityInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "flashcards-one",
        activityKind: "flashcard",
        event: {
          kind: "flashcard-flipped",
          cardId: "card-two",
          face: "back",
        },
      }),
    ).toMatchObject({
      verb: XAPI_VERBS.interacted,
      result: {
        extensions: {
          "https://scaffold.ac/xapi/extensions/learner-activity-event": {
            action: "card-flipped",
            cardId: "card-two",
            face: "back",
          },
        },
      },
    });
  });

  it("describes a flashcard rating and the resulting deck progress", () => {
    expect(
      buildLearnerActivityInteractedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "flashcards-one",
        activityKind: "flashcard",
        event: {
          kind: "flashcard-rated",
          cardId: "card-two",
          rating: "got-it",
          masteredCount: 2,
          total: 4,
        },
      }),
    ).toMatchObject({
      verb: XAPI_VERBS.interacted,
      result: {
        extensions: {
          "https://scaffold.ac/xapi/extensions/learner-activity-event": {
            action: "card-rated",
            cardId: "card-two",
            rating: "got-it",
            masteredCount: 2,
            total: 4,
          },
        },
      },
    });
  });

  it("builds a Quiz attempted draft from authoritative Quiz and attempt identity", () => {
    expect(
      buildQuizAttemptedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
      }),
    ).toStrictEqual({
      verb: XAPI_VERBS.attempted,
      object: {
        objectType: "Activity",
        id: createQuizActivityId(ROOT_ACTIVITY_ID, "quiz-one"),
        definition: { type: XAPI_ACTIVITY_TYPES.quiz },
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
      buildQuizAttemptedStatementDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
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
