import { describe, expect, it } from "vite-plus/test";

import type {
  AssessmentInteractionContract,
  AssessmentInteractionKind,
  AssessmentResponseValue,
  AssessmentResult,
} from "@scaffold/contracts";
import type {
  LearningEventActivityDefinition,
  LearningEventDraft,
} from "../../host/ports/learning-events";
import {
  LEARNING_EVENT_ACTIVITY_TYPES,
  LEARNING_EVENT_EXTENSIONS,
  LEARNING_EVENT_VERBS,
  BlockLearningEventInputSchema,
  CoreLearningEventInputSchema,
  buildAssessmentActivityDefinition,
  buildAnsweredLearningEventDraft,
  buildHintInteractedLearningEventDraft,
  buildInitializedLearningEventDraft,
  buildLearningEventDraft,
  buildLearnerActivityCompletedLearningEventDraft,
  buildLearnerActivityInteractedLearningEventDraft,
  buildLayoutSectionExperiencedLearningEventDraft,
  buildResourceLaunchedLearningEventDraft,
  buildResourceAttemptedLearningEventDraft,
  buildResourceCompletedLearningEventDraft,
  buildResourcePageExperiencedLearningEventDraft,
  buildQuizAttemptedLearningEventDraft,
  buildQuizCompletedLearningEventDraft,
  buildQuizSuccessLearningEventDraft,
  buildSurfaceExperiencedLearningEventDraft,
  buildTerminatedLearningEventDraft,
  buildVisualItemExperiencedLearningEventDraft,
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
  isLearningEventLearnerActivityKind,
  type AssessmentLearningEventDefinition,
} from "./catalogue";

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

function singleSelectAssessmentDefinition() {
  return {
    activityDescription: "Which answer is correct?",
    interaction: {
      kind: "single-select" as const,
      options: [
        { id: "option/a", label: "Paris" },
        { id: "option-b", label: "Madrid" },
      ],
    },
  };
}

function assessmentDefinitionForKind(
  kind: AssessmentInteractionKind,
  activityDescription?: string,
): AssessmentLearningEventDefinition {
  const description = activityDescription === undefined ? {} : { activityDescription };
  switch (kind) {
    case "single-select":
      return { ...description, interaction: { kind, options: [] } };
    case "multi-select":
      return { ...description, interaction: { kind, options: [], maxSelections: null } };
    case "sequence":
      return { ...description, interaction: { kind, items: [] } };
    case "match":
      return { ...description, interaction: { kind, items: [], targets: [] } };
    case "classify":
      return { ...description, interaction: { kind, items: [], categories: [] } };
    case "fill-blanks":
      return { ...description, interaction: { kind, blanks: [] } };
    case "spatial-hotspot":
      return { ...description, interaction: { kind, hotspots: [], maxSelections: null } };
  }
}

describe("Learning Event catalogue vocabulary", () => {
  it("defines the approved immutable verbs, Activity types, and extensions", () => {
    expect(LEARNING_EVENT_VERBS).toStrictEqual({
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
      progressed: {
        id: "http://adlnet.gov/expapi/verbs/progressed",
        display: { en: "progressed" },
      },
      terminated: {
        id: "http://adlnet.gov/expapi/verbs/terminated",
        display: { en: "terminated" },
      },
    });
    expect(LEARNING_EVENT_ACTIVITY_TYPES).toStrictEqual({
      artefact: "https://scaffold.ac/xapi/activity-types/artifact",
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
    expect(LEARNING_EVENT_EXTENSIONS).toStrictEqual({
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
      progress: "https://w3id.org/xapi/cmi5/result/extensions/progress",
    });

    expect(Object.isFrozen(LEARNING_EVENT_VERBS)).toBe(true);
    expect(Object.values(LEARNING_EVENT_VERBS).every(Object.isFrozen)).toBe(true);
    expect(Object.values(LEARNING_EVENT_VERBS).every((verb) => Object.isFrozen(verb.display))).toBe(
      true,
    );
    expect(Object.isFrozen(LEARNING_EVENT_ACTIVITY_TYPES)).toBe(true);
    expect(Object.isFrozen(LEARNING_EVENT_EXTENSIONS)).toBe(true);
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
    "maps %s to the %s Learning Event interaction type",
    (interactionKind, interactionType) => {
      expect(
        buildAnsweredLearningEventDraft({
          rootActivityId: ROOT_ACTIVITY_ID,
          targetId: "question-one",
          definition: assessmentDefinitionForKind(interactionKind, "Which answer is correct?"),
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
    readonly expected: Partial<LearningEventActivityDefinition>;
  }[])(
    "derives the standard component lists for $interaction.kind without an answer key",
    ({ interaction, expected }) => {
      const definition = buildAssessmentActivityDefinition({
        activityDescription: "What is the answer?",
        interaction,
      });

      expect(definition).toMatchObject({
        description: { en: "What is the answer?" },
        type: LEARNING_EVENT_ACTIVITY_TYPES.assessmentQuestion,
        extensions: {
          [LEARNING_EVENT_EXTENSIONS.assessmentInteractionKind]: interaction.kind,
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

describe("closed producer inputs", () => {
  it.each([
    {
      type: "surface.experienced",
      surfaceId: "surface-1",
      surfaceKind: "slide",
      position: 1,
      count: 2,
    },
    {
      type: "layout-section.experienced",
      layoutId: "tabs-1",
      sectionId: "tab-1",
      layoutKind: "tabs",
      position: 1,
      count: 2,
    },
    {
      type: "visual-item.experienced",
      compositionId: "gallery-1",
      itemId: "image-1",
      itemKind: "gallery-image",
      position: 1,
      count: 2,
    },
    {
      type: "resource.launched",
      resourceId: "resource-1",
      resourceKind: "video",
    },
    {
      type: "resource-page.experienced",
      resourceId: "resource-1",
      pageNumber: 2,
      pageCount: 4,
    },
  ])("accepts the block-safe $type input", (input) => {
    expect(BlockLearningEventInputSchema.parse(input)).toStrictEqual(input);
  });

  it.each([
    { type: "session.initialized" },
    { type: "assessment.hint-interacted", targetId: "question-1", hintNumber: 1 },
    { type: "quiz.attempted", quizId: "quiz-1", attemptId: "attempt-1" },
    { type: "artefact.completed", completion: true },
    {
      type: "surface.experienced",
      surfaceId: "surface-1",
      surfaceKind: "slide",
      position: 1,
      count: 2,
      verb: "experienced",
    },
  ])("rejects non-block-safe or open input: %o", (input) => {
    expect(BlockLearningEventInputSchema.safeParse(input).success).toBe(false);
  });

  it.each([
    {
      type: "surface.experienced",
      surfaceId: "surface-1",
      surfaceKind: "slide",
      position: 3,
      count: 2,
    },
    {
      type: "resource-page.experienced",
      resourceId: "resource-1",
      pageNumber: 0,
      pageCount: 2,
    },
    { type: "artefact.progressed", progressPercent: 100 },
    { type: "not.registered", payload: {} },
  ])("rejects invalid closed input: %o", (input) => {
    expect(CoreLearningEventInputSchema.safeParse(input).success).toBe(false);
  });

  it("accepts a strict domain-shaped assessment definition and derives its wire definition", () => {
    const input = {
      type: "assessment.answered" as const,
      targetId: "question-1",
      definition: singleSelectAssessmentDefinition(),
      response: { kind: "single-select" as const, optionId: "option/a" },
      result: { isCorrect: true, score: 1 },
      attemptNumber: 2,
    };

    expect(CoreLearningEventInputSchema.parse(input)).toStrictEqual(input);
    const draft = buildLearningEventDraft(input, { rootActivityId: ROOT_ACTIVITY_ID });

    expect(draft.object.definition).toStrictEqual({
      description: { en: "Which answer is correct?" },
      type: LEARNING_EVENT_ACTIVITY_TYPES.assessmentQuestion,
      interactionType: "choice",
      choices: [
        { id: "option%2Fa", description: { en: "Paris" } },
        { id: "option-b", description: { en: "Madrid" } },
      ],
      extensions: {
        [LEARNING_EVENT_EXTENSIONS.assessmentInteractionKind]: "single-select",
      },
    });
    expect(draft.result).toMatchObject({
      response: "option%2Fa",
      success: true,
      score: { scaled: 1 },
      extensions: { [LEARNING_EVENT_EXTENSIONS.assessmentAttemptNumber]: 2 },
    });
  });

  it("rejects the legacy wire-shaped assessment definition and arbitrary extensions", () => {
    expect(
      CoreLearningEventInputSchema.safeParse({
        type: "assessment.answered",
        targetId: "question-1",
        activityDefinition: {
          type: "https://attacker.example/activity-type",
          interactionType: "choice",
          extensions: { "https://attacker.example/private-answer": "PRIVATE_ANSWER" },
        },
        interactionKind: "single-select",
        response: { kind: "single-select", optionId: "option-a" },
        result: { isCorrect: true, score: 1 },
        attemptNumber: 1,
      }).success,
    ).toBe(false);
  });

  it.each([
    { label: "null", definition: null },
    { label: "a primitive", definition: 42 },
    {
      label: "an unknown definition field",
      definition: { ...singleSelectAssessmentDefinition(), privateState: "PRIVATE_STATE" },
    },
    {
      label: "a private answer key",
      definition: {
        ...singleSelectAssessmentDefinition(),
        interaction: {
          ...singleSelectAssessmentDefinition().interaction,
          correctOptionId: "option/a",
        },
      },
    },
    {
      label: "an arbitrary extension map",
      definition: {
        ...singleSelectAssessmentDefinition(),
        extensions: { "https://attacker.example/private": "PRIVATE_EXTENSION" },
      },
    },
  ])("rejects $label in assessment definition data", ({ definition }) => {
    expect(
      CoreLearningEventInputSchema.safeParse({
        type: "assessment.hint-interacted",
        targetId: "question-1",
        definition,
        hintNumber: 1,
      }).success,
    ).toBe(false);
  });

  it("builds governed block-safe input without serializing the catalogue key", () => {
    const draft = buildLearningEventDraft(
      {
        type: "surface.experienced",
        surfaceId: "surface-1",
        surfaceKind: "page",
        position: 1,
        count: 1,
      },
      { rootActivityId: ROOT_ACTIVITY_ID },
    );

    expect(draft).toStrictEqual(
      buildSurfaceExperiencedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        surfaceId: "surface-1",
        surfaceKind: "page",
        position: 1,
        count: 1,
      }),
    );
    expect(draft).not.toHaveProperty("type");
  });

  it("builds dormant artefact outcomes only from the Core-owned union", () => {
    const progressed = buildLearningEventDraft(
      { type: "artefact.progressed", progressPercent: 42 },
      { rootActivityId: ROOT_ACTIVITY_ID, title: "Artefact One" },
    );
    const completed = buildLearningEventDraft(
      {
        type: "artefact.completed",
        completion: true,
        score: { scaled: 0.75, raw: 3, min: 0, max: 4 },
        duration: "PT2M",
      },
      { rootActivityId: ROOT_ACTIVITY_ID },
    );
    const passed = buildLearningEventDraft(
      { type: "artefact.passed", score: { scaled: 0.75 } },
      { rootActivityId: ROOT_ACTIVITY_ID },
    );

    expect(progressed).toMatchObject({
      verb: LEARNING_EVENT_VERBS.progressed,
      object: { definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact } },
      result: { extensions: { [LEARNING_EVENT_EXTENSIONS.progress]: 42 } },
    });
    expect(completed.result).toStrictEqual({
      completion: true,
      score: { scaled: 0.75, raw: 3, min: 0, max: 4 },
      duration: "PT2M",
    });
    expect(passed.result).toStrictEqual({ success: true, score: { scaled: 0.75 } });
  });
});

describe("Learning Event assessment response encoding", () => {
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

describe("Learning Event Activity identities", () => {
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

describe("Learning Event Event catalogue builders", () => {
  it("builds a privacy-safe launched resource Activity", () => {
    expect(
      buildResourceLaunchedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        resourceId: "resource-one",
        resourceKind: "pdf",
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.launched,
      object: {
        objectType: "Activity",
        id: createResourceActivityId(ROOT_ACTIVITY_ID, "resource-one"),
        definition: {
          type: LEARNING_EVENT_ACTIVITY_TYPES.resource,
          extensions: {
            [LEARNING_EVENT_EXTENSIONS.resourceKind]: "pdf",
          },
        },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: ROOT_ACTIVITY_ID,
              definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact },
            },
          ],
        },
      },
    });
    expect(
      JSON.stringify(
        buildResourceLaunchedLearningEventDraft({
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
        type: LEARNING_EVENT_ACTIVITY_TYPES.resource,
        extensions: {
          [LEARNING_EVENT_EXTENSIONS.resourceKind]: "audio",
        },
      },
    };
    const context = {
      contextActivities: {
        parent: [
          {
            objectType: "Activity" as const,
            id: ROOT_ACTIVITY_ID,
            definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact },
          },
        ],
      },
    };

    expect(buildResourceAttemptedLearningEventDraft(input)).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.attempted,
      object,
      context,
    });
    expect(buildResourceCompletedLearningEventDraft(input)).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.completed,
      object,
      result: { completion: true },
      context,
    });
  });

  it("builds an experienced PDF page parented by its resource", () => {
    expect(
      buildResourcePageExperiencedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        resourceId: "resource-one",
        pageNumber: 2,
        pageCount: 8,
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.experienced,
      object: {
        objectType: "Activity",
        id: createResourcePageActivityId(ROOT_ACTIVITY_ID, "resource-one", 2),
        definition: {
          type: LEARNING_EVENT_ACTIVITY_TYPES.resourcePage,
          extensions: {
            [LEARNING_EVENT_EXTENSIONS.resourcePageNumber]: 2,
            [LEARNING_EVENT_EXTENSIONS.resourcePageCount]: 8,
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
                type: LEARNING_EVENT_ACTIVITY_TYPES.resource,
                extensions: {
                  [LEARNING_EVENT_EXTENSIONS.resourceKind]: "pdf",
                },
              },
            },
          ],
        },
      },
    });
  });

  it("builds initialized with the root artefact Activity and a normalized title", () => {
    expect(
      buildInitializedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        title: "  Course One  ",
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.initialized,
      object: {
        objectType: "Activity",
        id: ROOT_ACTIVITY_ID,
        definition: {
          name: { en: "Course One" },
          type: LEARNING_EVENT_ACTIVITY_TYPES.artefact,
        },
      },
    });

    expect(
      buildInitializedLearningEventDraft({ rootActivityId: ROOT_ACTIVITY_ID, title: " " }).object,
    ).toStrictEqual({
      objectType: "Activity",
      id: ROOT_ACTIVITY_ID,
      definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact },
    });
  });

  it("builds an authoritative standalone answered draft", () => {
    expect(
      buildAnsweredLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        definition: singleSelectAssessmentDefinition(),
        response: { kind: "single-select", optionId: "option/a" },
        result: normalizedResult({ isCorrect: false, score: 0.25 }),
        attemptNumber: 2,
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.answered,
      object: {
        objectType: "Activity",
        id: createAssessmentActivityId(ROOT_ACTIVITY_ID, "question-one"),
        definition: {
          description: { en: "Which answer is correct?" },
          type: LEARNING_EVENT_ACTIVITY_TYPES.assessmentQuestion,
          interactionType: "choice",
          choices: [
            { id: "option%2Fa", description: { en: "Paris" } },
            { id: "option-b", description: { en: "Madrid" } },
          ],
          extensions: {
            [LEARNING_EVENT_EXTENSIONS.assessmentInteractionKind]: "single-select",
          },
        },
      },
      result: {
        success: false,
        score: { scaled: 0.25, raw: 0.25, min: 0, max: 1 },
        response: "option%2Fa",
        extensions: { [LEARNING_EVENT_EXTENSIONS.assessmentAttemptNumber]: 2 },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: ROOT_ACTIVITY_ID,
              definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact },
            },
          ],
        },
      },
    });
  });

  it("builds quiz answer Context from explicit quiz and attempt identities", () => {
    expect(
      buildAnsweredLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        definition: assessmentDefinitionForKind("sequence"),
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
            definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.quiz },
          },
        ],
      },
      extensions: { [LEARNING_EVENT_EXTENSIONS.quizAttemptId]: "attempt-one" },
    });
  });

  it("builds a persisted hint interaction without hint content", () => {
    expect(
      buildHintInteractedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        definition: singleSelectAssessmentDefinition(),
        hintNumber: 2,
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.interacted,
      object: {
        objectType: "Activity",
        id: createHintActivityId(ROOT_ACTIVITY_ID, "question-one", 2),
        definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.hint },
      },
      result: {
        extensions: { [LEARNING_EVENT_EXTENSIONS.hintNumber]: 2 },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: createAssessmentActivityId(ROOT_ACTIVITY_ID, "question-one"),
              definition: {
                description: { en: "Which answer is correct?" },
                type: LEARNING_EVENT_ACTIVITY_TYPES.assessmentQuestion,
                interactionType: "choice",
                choices: [
                  { id: "option%2Fa", description: { en: "Paris" } },
                  { id: "option-b", description: { en: "Madrid" } },
                ],
                extensions: {
                  [LEARNING_EVENT_EXTENSIONS.assessmentInteractionKind]: "single-select",
                },
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
        type: LEARNING_EVENT_ACTIVITY_TYPES.learnerActivity,
        extensions: { [LEARNING_EVENT_EXTENSIONS.learnerActivityKind]: "flashcard" },
      },
    };
    const context = {
      contextActivities: {
        parent: [
          {
            objectType: "Activity",
            id: ROOT_ACTIVITY_ID,
            definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact },
          },
        ],
      },
    };

    expect(buildLearnerActivityInteractedLearningEventDraft(input)).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.interacted,
      object,
      context,
    });
    expect(buildLearnerActivityCompletedLearningEventDraft(input)).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.completed,
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
      buildSurfaceExperiencedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        surfaceId: "slide-two",
        surfaceKind: "slide",
        position: 2,
        count: 4,
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.experienced,
      object: {
        objectType: "Activity",
        id: surfaceActivityId,
        definition: {
          type: LEARNING_EVENT_ACTIVITY_TYPES.surface,
          extensions: {
            [LEARNING_EVENT_EXTENSIONS.surfaceKind]: "slide",
            [LEARNING_EVENT_EXTENSIONS.surfacePosition]: 2,
            [LEARNING_EVENT_EXTENSIONS.surfaceCount]: 4,
          },
        },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: ROOT_ACTIVITY_ID,
              definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact },
            },
          ],
        },
      },
    });
    expect(() =>
      buildSurfaceExperiencedLearningEventDraft({
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
      buildVisualItemExperiencedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        compositionId: "annotated-figure-one",
        itemId: "annotation-two",
        itemKind: "annotation",
        position: 2,
        count: 4,
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.experienced,
      object: {
        objectType: "Activity",
        id: itemId,
        definition: {
          type: LEARNING_EVENT_ACTIVITY_TYPES.visualItem,
          extensions: {
            [LEARNING_EVENT_EXTENSIONS.visualItemKind]: "annotation",
            [LEARNING_EVENT_EXTENSIONS.visualItemPosition]: 2,
            [LEARNING_EVENT_EXTENSIONS.visualItemCount]: 4,
          },
        },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: compositionId,
              definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.visualComposition },
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
      buildLayoutSectionExperiencedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        layoutId: "layout-tabs",
        sectionId: "tab-two",
        layoutKind: "tabs",
        position: 2,
        count: 3,
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.experienced,
      object: {
        objectType: "Activity",
        id: sectionActivityId,
        definition: {
          type: LEARNING_EVENT_ACTIVITY_TYPES.layoutSection,
          extensions: {
            [LEARNING_EVENT_EXTENSIONS.layoutKind]: "tabs",
            [LEARNING_EVENT_EXTENSIONS.layoutSectionPosition]: 2,
            [LEARNING_EVENT_EXTENSIONS.layoutSectionCount]: 3,
          },
        },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: ROOT_ACTIVITY_ID,
              definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact },
            },
          ],
        },
      },
    });
    expect(() =>
      buildLayoutSectionExperiencedLearningEventDraft({
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
      buildLayoutSectionExperiencedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        layoutId: "layout-accordion",
        sectionId: "section-two",
        layoutKind: "accordion",
        position: 2,
        count: 3,
      }),
    ).toMatchObject({
      verb: LEARNING_EVENT_VERBS.experienced,
      object: {
        id: createLayoutSectionActivityId(ROOT_ACTIVITY_ID, "layout-accordion", "section-two"),
        definition: {
          type: LEARNING_EVENT_ACTIVITY_TYPES.layoutSection,
          extensions: {
            [LEARNING_EVENT_EXTENSIONS.layoutKind]: "accordion",
            [LEARNING_EVENT_EXTENSIONS.layoutSectionPosition]: 2,
            [LEARNING_EVENT_EXTENSIONS.layoutSectionCount]: 3,
          },
        },
      },
    });
  });

  it("describes an accepted checklist item toggle without learner state", () => {
    expect(
      buildLearnerActivityInteractedLearningEventDraft({
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
      verb: LEARNING_EVENT_VERBS.interacted,
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
      buildLearnerActivityInteractedLearningEventDraft({
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
      verb: LEARNING_EVENT_VERBS.interacted,
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
      buildLearnerActivityInteractedLearningEventDraft({
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
      verb: LEARNING_EVENT_VERBS.interacted,
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
      buildQuizAttemptedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.attempted,
      object: {
        objectType: "Activity",
        id: createQuizActivityId(ROOT_ACTIVITY_ID, "quiz-one"),
        definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.quiz },
      },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: ROOT_ACTIVITY_ID,
              definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact },
            },
          ],
        },
        extensions: { [LEARNING_EVENT_EXTENSIONS.quizAttemptId]: "attempt-one" },
      },
    });
  });

  it("builds terminal quiz completion with a valid authoritative duration", () => {
    expect(
      buildQuizCompletedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt: "2026-07-25T10:00:00.000Z",
        finishedAt: "2026-07-25T10:05:00.250Z",
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.completed,
      object: {
        objectType: "Activity",
        id: createQuizActivityId(ROOT_ACTIVITY_ID, "quiz-one"),
        definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.quiz },
      },
      result: { completion: true, duration: "PT300.25S" },
      context: {
        contextActivities: {
          parent: [
            {
              objectType: "Activity",
              id: ROOT_ACTIVITY_ID,
              definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact },
            },
          ],
        },
        extensions: { [LEARNING_EVENT_EXTENSIONS.quizAttemptId]: "attempt-one" },
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
      buildQuizCompletedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt,
        finishedAt,
      }).result,
    ).toStrictEqual({ completion: true });
  });

  it.each([
    ["passed", true, LEARNING_EVENT_VERBS.passed],
    ["failed", false, LEARNING_EVENT_VERBS.failed],
  ] as const)("builds an explicit authoritative %s draft", (successStatus, success, verb) => {
    expect(
      buildQuizSuccessLearningEventDraft({
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
        definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.quiz },
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
              definition: { type: LEARNING_EVENT_ACTIVITY_TYPES.artefact },
            },
          ],
        },
        extensions: { [LEARNING_EVENT_EXTENSIONS.quizAttemptId]: "attempt-one" },
      },
    });
  });

  it("builds termination for the same root Activity with session duration", () => {
    expect(
      buildTerminatedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        title: "Course One",
        durationMs: 90_061,
      }),
    ).toStrictEqual({
      verb: LEARNING_EVENT_VERBS.terminated,
      object: {
        objectType: "Activity",
        id: ROOT_ACTIVITY_ID,
        definition: {
          name: { en: "Course One" },
          type: LEARNING_EVENT_ACTIVITY_TYPES.artefact,
        },
      },
      result: { duration: "PT90.061S" },
    });
  });
});

describe("Learning Event catalogue invariants", () => {
  it.each([0, -1, 1.5])("rejects invalid assessment attempt number %s", (attemptNumber) => {
    expect(() =>
      buildAnsweredLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        definition: singleSelectAssessmentDefinition(),
        response: null,
        result: normalizedResult(),
        attemptNumber,
      }),
    ).toThrow();
  });

  it("rejects blank authoritative quiz attempt identity", () => {
    expect(() =>
      buildAnsweredLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        definition: singleSelectAssessmentDefinition(),
        response: null,
        result: normalizedResult(),
        attemptNumber: 1,
        quiz: { quizId: "quiz-one", attemptId: " " },
      }),
    ).toThrow();
    expect(() =>
      buildQuizCompletedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "",
        startedAt: "2026-07-25T10:00:00.000Z",
        finishedAt: "2026-07-25T10:05:00.000Z",
      }),
    ).toThrow();
  });

  it("admits only the two approved learner-activity kinds", () => {
    expect(isLearningEventLearnerActivityKind("flashcard")).toBe(true);
    expect(isLearningEventLearnerActivityKind("checklist")).toBe(true);
    expect(isLearningEventLearnerActivityKind("video")).toBe(false);

    expect(() =>
      buildLearnerActivityInteractedLearningEventDraft({
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
      buildQuizSuccessLearningEventDraft({
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
      buildQuizSuccessLearningEventDraft({
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
        buildTerminatedLearningEventDraft({
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
      url: "PRIVATE_RESOURCE_URL",
      mediaMetadata: "PRIVATE_MEDIA_METADATA",
      playerState: "PRIVATE_PLAYER_STATE",
      destination: "PRIVATE_DESTINATION",
    };
    const privateResult = {
      ...normalizedResult(),
      ...privateCanaries,
    } as Pick<AssessmentResult, "isCorrect" | "score">;
    const drafts: readonly LearningEventDraft[] = [
      buildInitializedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        title: "Course One",
        ...privateCanaries,
      }),
      buildAnsweredLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        definition: singleSelectAssessmentDefinition(),
        response: { kind: "single-select", optionId: "authorized-response" },
        result: privateResult,
        attemptNumber: 1,
        ...privateCanaries,
      }),
      buildAnsweredLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        definition: singleSelectAssessmentDefinition(),
        response: { kind: "single-select", optionId: "authorized-response" },
        result: privateResult,
        attemptNumber: 1,
        quiz: { quizId: "quiz-one", attemptId: "attempt-one", ...privateCanaries },
      }),
      buildHintInteractedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        targetId: "question-one",
        definition: singleSelectAssessmentDefinition(),
        hintNumber: 1,
        ...privateCanaries,
      }),
      buildLearnerActivityInteractedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "flashcards-one",
        activityKind: "flashcard",
        ...privateCanaries,
      }),
      buildLearnerActivityCompletedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        blockId: "checklist-one",
        activityKind: "checklist",
        ...privateCanaries,
      }),
      buildResourceLaunchedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        resourceId: "pdf-one",
        resourceKind: "pdf",
        ...privateCanaries,
      }),
      buildResourceAttemptedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        resourceId: "audio-one",
        resourceKind: "audio",
        ...privateCanaries,
      }),
      buildResourceCompletedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        resourceId: "audio-one",
        resourceKind: "audio",
        ...privateCanaries,
      }),
      buildResourcePageExperiencedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        resourceId: "pdf-one",
        pageNumber: 2,
        pageCount: 4,
        ...privateCanaries,
      }),
      buildQuizAttemptedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        ...privateCanaries,
      }),
      buildQuizCompletedLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        startedAt: "2026-07-25T10:00:00.000Z",
        finishedAt: "2026-07-25T10:05:00.000Z",
        ...privateCanaries,
      }),
      buildQuizSuccessLearningEventDraft({
        rootActivityId: ROOT_ACTIVITY_ID,
        quizId: "quiz-one",
        attemptId: "attempt-one",
        successStatus: "passed",
        score: 3,
        maxScore: 4,
        ...privateCanaries,
      }),
      buildTerminatedLearningEventDraft({
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
      "description",
      "name",
      "type",
      "interactionType",
      "choices",
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
      ...Object.values(LEARNING_EVENT_EXTENSIONS),
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
