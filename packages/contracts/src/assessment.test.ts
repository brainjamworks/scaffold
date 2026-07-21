import { describe, expect, it } from "vite-plus/test";

import {
  AnswerRevealSchema,
  AssessmentActivityStatusSchema,
  AssessmentAnswerKeySchema,
  AssessmentGradeProjectionSchema,
  AssessmentGradingStatusSchema,
  AssessmentGroupContractSchema,
  AssessmentInteractionContractSchema,
  AssessmentItemDetailSchema,
  AssessmentItemValueSchema,
  AssessmentLearnerSnapshotSchema,
  AssessmentProblemSnapshotSchema,
  AssessmentResponseValueSchema,
  AssessmentResultSchema,
  AssessmentTargetContractSchema,
  ClassifyResponseSchema,
  SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
  SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION,
  FillBlanksResponseSchema,
  MatchResponseSchema,
  MultiSelectResponseSchema,
  QuizAssessmentSettingsSchema,
  QuizAttemptSnapshotSchema,
  QuizAttemptStateSchema,
  QuizAttemptStatusSchema,
  QuizAttemptsPerQuestionSchema,
  QuizReviewDetailSchema,
  QuizReviewTimingSchema,
  QuizTimerSettingsSchema,
  SequenceResponseSchema,
  SingleSelectResponseSchema,
  SpatialHotspotResponseSchema,
  type AnswerReveal,
  type AssessmentActivityStatus,
  type AssessmentAnswerKey,
  type AssessmentFeedbackContent,
  type AssessmentGroupContract,
  type AssessmentGradeProjection,
  type AssessmentGradingStatus,
  type AssessmentInteractionContract,
  type AssessmentItemDetail,
  type AssessmentItemValue,
  type AssessmentLearnerSnapshot,
  type AssessmentProblemSnapshot,
  type AssessmentResponseValue,
  type AssessmentResult,
  type AssessmentTargetContract,
  type ClassifyResponse,
  type FillBlanksResponse,
  type MatchResponse,
  type MultiSelectResponse,
  type QuizAssessmentSettings,
  type QuizAttemptSnapshot,
  type QuizAttemptState,
  type QuizAttemptStatus,
  type QuizAttemptsPerQuestion,
  type QuizReviewDetail,
  type QuizReviewTiming,
  type QuizTimerSettings,
  type SequenceResponse,
  type SingleSelectResponse,
  type SpatialHotspotResponse,
} from "./index";

describe("assessment learner snapshot contracts", () => {
  const result: AssessmentResult = {
    isCorrect: true,
    score: 1,
    maxScore: 1,
    feedback: null,
    items: {},
  };

  const emptyProblem: AssessmentProblemSnapshot = {
    response: null,
    submitted: false,
    attemptNumber: 0,
    hintsShown: 0,
    checkResult: null,
    submissionResult: null,
  };

  const quizAttemptSnapshot: QuizAttemptSnapshot = {
    attemptId: "attempt-1",
    status: "in_progress",
    currentTargetId: "question-1",
    submittedTargetIds: [],
    startedAt: "2026-07-15T12:00:00Z",
    finishedAt: null,
    expiresAt: null,
    score: null,
    maxScore: null,
    resultsByTargetId: {},
    answerReviewAuthorized: false,
  };

  it("exports the independent literal v1 snapshot contract and accepts an empty snapshot", () => {
    const snapshot: AssessmentLearnerSnapshot = {
      snapshotVersion: 1,
      artifactId: "artifact-1",
      problems: {},
      quizzes: {},
    };

    expect(SCAFFOLD_ASSESSMENT_CONTRACT_VERSION).toBe(1);
    expect(SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION).toBe(1);
    expect(AssessmentLearnerSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("accepts every canonical response family in target-keyed problem entries", () => {
    const snapshot: AssessmentLearnerSnapshot = {
      snapshotVersion: SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION,
      artifactId: "artifact-1",
      problems: {
        "single-target": {
          ...emptyProblem,
          response: { kind: "single-select", optionId: "option-a" },
        },
        "multi-target": {
          ...emptyProblem,
          response: { kind: "multi-select", optionIds: ["option-a", "option-b"] },
        },
        "sequence-target": {
          ...emptyProblem,
          response: { kind: "sequence", orderedItemIds: ["item-2", "item-1"] },
        },
        "match-target": {
          ...emptyProblem,
          response: { kind: "match", pairs: [{ itemId: "item-1", targetId: "target-1" }] },
        },
        "classify-target": {
          ...emptyProblem,
          response: {
            kind: "classify",
            placements: [{ itemId: "item-1", categoryId: "category-1" }],
          },
        },
        "blanks-target": {
          ...emptyProblem,
          response: {
            kind: "fill-blanks",
            blanks: [{ blankId: "blank-1", value: "Scaffold" }],
          },
        },
        "hotspot-target": {
          ...emptyProblem,
          response: {
            kind: "spatial-hotspot",
            selections: [{ hotspotId: "hotspot-1", x: 0.25, y: 0.75 }],
          },
        },
      },
      quizzes: { "quiz-1": quizAttemptSnapshot },
    };

    expect(AssessmentLearnerSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("keeps formative checks independent while enforcing coherent terminal submission state", () => {
    expect(
      AssessmentProblemSnapshotSchema.safeParse({
        ...emptyProblem,
        checkResult: result,
      }).success,
    ).toBe(true);
    expect(
      AssessmentProblemSnapshotSchema.safeParse({
        ...emptyProblem,
        submitted: true,
        submissionResult: result,
      }).success,
    ).toBe(true);
    expect(
      AssessmentProblemSnapshotSchema.safeParse({
        ...emptyProblem,
        submitted: true,
      }).success,
    ).toBe(false);
    expect(
      AssessmentProblemSnapshotSchema.safeParse({
        ...emptyProblem,
        submissionResult: result,
      }).success,
    ).toBe(false);
  });

  it("accepts zero and rejects invalid attempt and hint counts", () => {
    expect(AssessmentProblemSnapshotSchema.safeParse(emptyProblem).success).toBe(true);

    for (const field of ["attemptNumber", "hintsShown"] as const) {
      for (const value of [-1, 0.5, Number.NaN, Infinity, Number.NEGATIVE_INFINITY]) {
        expect(
          AssessmentProblemSnapshotSchema.safeParse({ ...emptyProblem, [field]: value }).success,
        ).toBe(false);
      }
    }
  });

  it("requires every problem and snapshot field", () => {
    for (const field of [
      "response",
      "submitted",
      "attemptNumber",
      "hintsShown",
      "checkResult",
      "submissionResult",
    ]) {
      const incomplete = structuredClone(emptyProblem);
      Reflect.deleteProperty(incomplete, field);
      expect(AssessmentProblemSnapshotSchema.safeParse(incomplete).success).toBe(false);
    }

    const snapshot: AssessmentLearnerSnapshot = {
      snapshotVersion: 1,
      artifactId: "artifact-1",
      problems: {},
      quizzes: {},
    };
    for (const field of ["snapshotVersion", "artifactId", "problems", "quizzes"]) {
      const incomplete = structuredClone(snapshot);
      Reflect.deleteProperty(incomplete, field);
      expect(AssessmentLearnerSnapshotSchema.safeParse(incomplete).success).toBe(false);
    }
  });

  it("rejects blank identities, composite runtime problem keys, and malformed records", () => {
    const snapshot: AssessmentLearnerSnapshot = {
      snapshotVersion: 1,
      artifactId: "artifact-1",
      problems: { "question-1": emptyProblem },
      quizzes: {},
    };

    for (const artifactId of ["", "   ", "\t"]) {
      expect(AssessmentLearnerSnapshotSchema.safeParse({ ...snapshot, artifactId }).success).toBe(
        false,
      );
    }
    for (const problemKey of ["", "   ", "artifact:artifact-1/block:question-1"]) {
      expect(
        AssessmentLearnerSnapshotSchema.safeParse({
          ...snapshot,
          problems: { [problemKey]: emptyProblem },
        }).success,
      ).toBe(false);
    }
    for (const quizKey of ["", "   ", "\t"]) {
      expect(
        AssessmentLearnerSnapshotSchema.safeParse({
          ...snapshot,
          quizzes: { [quizKey]: quizAttemptSnapshot },
        }).success,
      ).toBe(false);
    }
    for (const records of [
      { problems: null },
      { problems: [] },
      { quizzes: null },
      { quizzes: [] },
    ]) {
      expect(AssessmentLearnerSnapshotSchema.safeParse({ ...snapshot, ...records }).success).toBe(
        false,
      );
    }
  });

  it("uses each quiz record key as canonical group identity without duplicating it", () => {
    const snapshot: AssessmentLearnerSnapshot = {
      snapshotVersion: 1,
      artifactId: "artifact-1",
      problems: {},
      quizzes: { "quiz-1": quizAttemptSnapshot },
    };

    expect(AssessmentLearnerSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      AssessmentLearnerSnapshotSchema.safeParse({
        ...snapshot,
        quizzes: { "quiz-2": quizAttemptSnapshot },
      }).success,
    ).toBe(true);
    expect(
      AssessmentLearnerSnapshotSchema.safeParse({
        ...snapshot,
        quizzes: { "quiz-1": { ...quizAttemptSnapshot, groupId: "quiz-1" } },
      }).success,
    ).toBe(false);
    expect(QuizAttemptSnapshotSchema.parse(quizAttemptSnapshot)).toEqual(quizAttemptSnapshot);
  });

  it("represents a not-started quiz by absence rather than a sentinel attempt", () => {
    expect(
      AssessmentLearnerSnapshotSchema.safeParse({
        snapshotVersion: 1,
        artifactId: "artifact-1",
        problems: {},
        quizzes: {},
      }).success,
    ).toBe(true);
    expect(
      AssessmentLearnerSnapshotSchema.safeParse({
        snapshotVersion: 1,
        artifactId: "artifact-1",
        problems: {},
        quizzes: {
          "quiz-1": {
            ...quizAttemptSnapshot,
            attemptId: null,
            status: "not_started",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects strict-field violations and forbidden durable state", () => {
    for (const extra of [
      { targetId: "question-1" },
      { revealedAnswer: { answerKey: {} } },
      { answerRevealAuthorized: true },
      { hintsTotal: 3 },
      { pending: true },
      { error: "failed" },
      { viewState: {} },
      { settings: {} },
      { provider: "xblock" },
    ]) {
      expect(AssessmentProblemSnapshotSchema.safeParse({ ...emptyProblem, ...extra }).success).toBe(
        false,
      );
    }

    const snapshot: AssessmentLearnerSnapshot = {
      snapshotVersion: 1,
      artifactId: "artifact-1",
      problems: {},
      quizzes: {},
    };
    for (const extra of [
      { targets: [] },
      { groups: [] },
      { settings: {} },
      { callbacks: {} },
      { gradeProjection: {} },
      { learnerActivityState: {} },
      { provider: "xblock" },
      { payload: {} },
    ]) {
      expect(AssessmentLearnerSnapshotSchema.safeParse({ ...snapshot, ...extra }).success).toBe(
        false,
      );
    }
  });

  it("rejects malformed canonical response, result, and quiz values", () => {
    expect(
      AssessmentProblemSnapshotSchema.safeParse({
        ...emptyProblem,
        response: { choices: "option-a" },
      }).success,
    ).toBe(false);
    expect(
      AssessmentProblemSnapshotSchema.safeParse({
        ...emptyProblem,
        checkResult: { isCorrect: true, score: 1 },
      }).success,
    ).toBe(false);
    expect(
      AssessmentProblemSnapshotSchema.safeParse({
        ...emptyProblem,
        submitted: true,
        submissionResult: { ...result, provider: "xblock" },
      }).success,
    ).toBe(false);
    expect(
      AssessmentLearnerSnapshotSchema.safeParse({
        snapshotVersion: 1,
        artifactId: "artifact-1",
        problems: {},
        quizzes: { "quiz-1": { ...quizAttemptSnapshot, answerReviewAuthorized: "yes" } },
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported snapshot versions and round-trips canonical values through JSON", () => {
    const snapshot: AssessmentLearnerSnapshot = {
      snapshotVersion: 1,
      artifactId: "artifact-1",
      problems: {
        "question-1": {
          ...emptyProblem,
          response: { kind: "single-select", optionId: "option-a" },
          checkResult: result,
        },
        "question-2": {
          ...emptyProblem,
          response: { kind: "multi-select", optionIds: ["option-b"] },
          submitted: true,
          attemptNumber: 1,
          hintsShown: 2,
          submissionResult: result,
        },
      },
      quizzes: { "quiz-1": quizAttemptSnapshot },
    };

    for (const snapshotVersion of [0, 2, 99]) {
      expect(
        AssessmentLearnerSnapshotSchema.safeParse({ ...snapshot, snapshotVersion }).success,
      ).toBe(false);
    }

    const parsed = AssessmentLearnerSnapshotSchema.parse(snapshot);
    const reparsed = AssessmentLearnerSnapshotSchema.parse(JSON.parse(JSON.stringify(parsed)));
    expect(reparsed).toEqual(snapshot);
  });
});

describe("assessment grade projection contracts", () => {
  it("exports and round-trips the canonical projection and status values", () => {
    const activityStatuses: AssessmentActivityStatus[] = [
      "not_started",
      "in_progress",
      "completed",
    ];
    const gradingStatuses: AssessmentGradingStatus[] = ["not_ready", "graded"];
    const projections: AssessmentGradeProjection[] = [
      {
        normalizedScore: null,
        activityStatus: "not_started",
        gradingStatus: "not_ready",
        changedAt: "2026-07-15T10:00:00.123Z",
      },
      {
        normalizedScore: 0.8,
        activityStatus: "completed",
        gradingStatus: "graded",
        changedAt: "2026-07-15T11:00:00.456+01:00",
      },
    ];

    for (const status of activityStatuses) {
      expect(AssessmentActivityStatusSchema.parse(status)).toBe(status);
    }
    for (const status of gradingStatuses) {
      expect(AssessmentGradingStatusSchema.parse(status)).toBe(status);
    }
    for (const projection of projections) {
      const parsed = AssessmentGradeProjectionSchema.parse(projection);
      const reparsed = AssessmentGradeProjectionSchema.parse(JSON.parse(JSON.stringify(parsed)));

      expect(reparsed).toEqual(projection);
    }
  });

  it("requires a finite normalized score from zero through one or null", () => {
    const projection: AssessmentGradeProjection = {
      normalizedScore: 0.5,
      activityStatus: "completed",
      gradingStatus: "graded",
      changedAt: "2026-07-15T10:00:00.123Z",
    };

    for (const normalizedScore of [0, 1, null]) {
      expect(
        AssessmentGradeProjectionSchema.safeParse({
          ...projection,
          normalizedScore,
          gradingStatus: normalizedScore === null ? "not_ready" : "graded",
        }).success,
      ).toBe(true);
    }
    for (const normalizedScore of [-0.001, 1.001, Number.NaN, Infinity, Number.NEGATIVE_INFINITY]) {
      expect(
        AssessmentGradeProjectionSchema.safeParse({ ...projection, normalizedScore }).success,
      ).toBe(false);
    }
  });

  it("keeps grading status and score presence bidirectionally consistent", () => {
    const projection = {
      activityStatus: "in_progress",
      changedAt: "2026-07-15T10:00:00.123Z",
    };

    expect(
      AssessmentGradeProjectionSchema.safeParse({
        ...projection,
        normalizedScore: null,
        gradingStatus: "not_ready",
      }).success,
    ).toBe(true);
    expect(
      AssessmentGradeProjectionSchema.safeParse({
        ...projection,
        normalizedScore: 0,
        gradingStatus: "graded",
      }).success,
    ).toBe(true);
    expect(
      AssessmentGradeProjectionSchema.safeParse({
        ...projection,
        normalizedScore: null,
        gradingStatus: "graded",
      }).success,
    ).toBe(false);
    expect(
      AssessmentGradeProjectionSchema.safeParse({
        ...projection,
        normalizedScore: 0.5,
        gradingStatus: "not_ready",
      }).success,
    ).toBe(false);
  });

  it("requires changedAt to be an RFC 3339 instant with sub-second precision", () => {
    const projection: AssessmentGradeProjection = {
      normalizedScore: 0.5,
      activityStatus: "completed",
      gradingStatus: "graded",
      changedAt: "2026-07-15T10:00:00.123Z",
    };

    for (const changedAt of [
      "2026-07-15T10:00:00.1Z",
      "2026-07-15T10:00:00.123456Z",
      "2026-07-15T11:00:00.123+01:00",
    ]) {
      expect(AssessmentGradeProjectionSchema.safeParse({ ...projection, changedAt }).success).toBe(
        true,
      );
    }

    for (const changedAt of [
      "2026-07-15T10:00:00Z",
      "2026-07-15T10:00:00+01:00",
      "2026-07-15T10:00:00.123",
      "2026-07-15T10:00:00.123+0100",
      "2026-07-15T10:00:00.123+24:00",
      "2026-02-30T10:00:00.123Z",
      "2026-07-15 10:00:00.123Z",
      "not-a-timestamp",
    ]) {
      expect(AssessmentGradeProjectionSchema.safeParse({ ...projection, changedAt }).success).toBe(
        false,
      );
    }
  });

  it("rejects removed activity and grading statuses", () => {
    for (const activityStatus of ["started", "submitted", "pending"]) {
      expect(AssessmentActivityStatusSchema.safeParse(activityStatus).success).toBe(false);
    }
    for (const gradingStatus of ["pending", "pending_manual", "failed"]) {
      expect(AssessmentGradingStatusSchema.safeParse(gradingStatus).success).toBe(false);
    }
  });

  it("rejects speculative, attempt, release, host, and provider fields", () => {
    const projection: AssessmentGradeProjection = {
      normalizedScore: 0.8,
      activityStatus: "completed",
      gradingStatus: "graded",
      changedAt: "2026-07-15T10:00:00.123Z",
    };

    for (const extra of [
      { arbitrary: true },
      { attempt: { number: 2 } },
      { attemptNumber: 2 },
      { startedAt: "2026-07-15T09:45:00.000Z" },
      { submittedAt: "2026-07-15T10:00:00.000Z" },
      { release: "released" },
      { releaseStatus: "released" },
      { held: true },
      { released: true },
      { lmsId: "grade-item-1" },
      { hostItemId: "grade-item-1" },
      { hostMaximum: 20 },
      { maximum: 20 },
      { provider: "xblock" },
      { providerMetadata: { requestId: "request-1" } },
      { payload: { value: 16, max_value: 20 } },
      { visibility: "hidden" },
      { locked: true },
      { override: { score: 1 } },
      { clear: true },
    ]) {
      expect(AssessmentGradeProjectionSchema.safeParse({ ...projection, ...extra }).success).toBe(
        false,
      );
    }
  });
});

describe("assessment target contracts", () => {
  const feedback: AssessmentFeedbackContent = {
    kind: "rich-text",
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Review this answer." }],
        },
      ],
    },
  };

  function targetWith(interaction: AssessmentInteractionContract, assessment: AssessmentAnswerKey) {
    return {
      schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
      targetId: "question-1",
      blockId: "block-1",
      blockType: "assessment-block",
      interaction,
      assessment,
      settings: {
        feedbackMode: "immediate",
        isGraded: true,
        showAnswer: true,
        points: 2,
        maxAttempts: 3,
      },
    };
  }

  it("accepts a literal v1 single-select target", () => {
    const target: AssessmentTargetContract = {
      schemaVersion: 1,
      targetId: "question-1",
      blockId: "block-1",
      blockType: "mcq",
      interaction: {
        kind: "single-select",
        options: [
          { id: "option-a", label: "A" },
          { id: "option-b", label: "B" },
        ],
      },
      assessment: {
        kind: "single-select",
        correctOptionId: "option-b",
        feedbackByOptionId: {},
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 1,
        maxAttempts: null,
      },
    };

    expect(SCAFFOLD_ASSESSMENT_CONTRACT_VERSION).toBe(1);
    expect(AssessmentTargetContractSchema.parse(target)).toEqual(target);
  });

  it("rejects the removed required-setting field", () => {
    const target = targetWith(
      {
        kind: "single-select",
        options: [{ id: "option-a" }],
      },
      {
        kind: "single-select",
        correctOptionId: "option-a",
        feedbackByOptionId: {},
      },
    );
    const removedSettingName = ["is", "Required"].join("");

    expect(
      AssessmentTargetContractSchema.safeParse({
        ...target,
        settings: { ...target.settings, [removedSettingName]: true },
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields at every target-owned object boundary", () => {
    const withUnknownField = <T extends object>(
      value: T,
      field: string,
      fieldValue: unknown,
    ): T & Record<string, unknown> => ({ ...value, [field]: fieldValue });
    const target = targetWith(
      {
        kind: "single-select",
        options: [{ id: "option-a" }],
      },
      {
        kind: "single-select",
        correctOptionId: "option-a",
        feedbackByOptionId: {},
      },
    );
    const unknownFieldCases = [
      { ...target, hostMaximum: 100 },
      {
        ...target,
        interaction: { kind: "single-select", options: [{ id: "option-a" }], provider: "host" },
      },
      {
        ...target,
        interaction: {
          kind: "single-select",
          options: [{ id: "option-a", providerPayload: {} }],
        },
      },
      {
        ...target,
        assessment: {
          kind: "single-select",
          correctOptionId: "option-a",
          feedbackByOptionId: {},
          hostItemId: "item-1",
        },
      },
      targetWith(
        {
          kind: "spatial-hotspot",
          hotspots: [
            {
              id: "hotspot-1",
              geometry: withUnknownField(
                {
                  kind: "circle" as const,
                  centerX: 0.5,
                  centerY: 0.5,
                  radius: 0.1,
                },
                "provider",
                "host",
              ),
            },
          ],
          maxSelections: 1,
        },
        {
          kind: "spatial-hotspot",
          gradingMode: "all-or-nothing",
          correctHotspotIds: ["hotspot-1"],
          feedbackByHotspotId: {},
        },
      ),
      targetWith(
        {
          kind: "match",
          items: [{ id: "item-1" }],
          targets: [{ id: "target-1" }],
        },
        {
          kind: "match",
          correctPairs: [
            withUnknownField({ itemId: "item-1", targetId: "target-1" }, "provider", "host"),
          ],
          feedbackByItemId: {},
        },
      ),
      targetWith(
        {
          kind: "classify",
          items: [{ id: "item-1" }],
          categories: [{ id: "category-1" }],
        },
        {
          kind: "classify",
          correctPlacements: [
            withUnknownField({ itemId: "item-1", categoryId: "category-1" }, "provider", "host"),
          ],
          feedbackByItemId: {},
        },
      ),
      targetWith(
        { kind: "fill-blanks", blanks: [{ id: "blank-1" }] },
        {
          kind: "fill-blanks",
          blanks: [
            withUnknownField(
              {
                blankId: "blank-1",
                acceptedAnswers: ["answer"],
                caseSensitive: false,
                trimWhitespace: true,
              },
              "provider",
              "host",
            ),
          ],
          feedbackByBlankId: {},
        },
      ),
    ];

    for (const value of unknownFieldCases) {
      expect(AssessmentTargetContractSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts all seven matching interaction and answer-key variants", () => {
    const variants: Array<{
      interaction: AssessmentInteractionContract;
      answerKey: AssessmentAnswerKey;
    }> = [
      {
        interaction: {
          kind: "single-select",
          options: [{ id: "option-a", label: "A" }],
        },
        answerKey: {
          kind: "single-select",
          correctOptionId: "option-a",
          feedbackByOptionId: {},
        },
      },
      {
        interaction: {
          kind: "multi-select",
          options: [{ id: "option-a" }, { id: "option-b" }],
          maxSelections: 2,
        },
        answerKey: {
          kind: "multi-select",
          correctOptionIds: ["option-a"],
          feedbackByOptionId: {},
        },
      },
      {
        interaction: {
          kind: "sequence",
          items: [{ id: "step-1" }, { id: "step-2", label: "Second" }],
        },
        answerKey: {
          kind: "sequence",
          correctOrder: ["step-1", "step-2"],
          feedbackByItemId: {},
        },
      },
      {
        interaction: {
          kind: "match",
          items: [{ id: "term-1" }],
          targets: [{ id: "definition-1" }],
        },
        answerKey: {
          kind: "match",
          correctPairs: [{ itemId: "term-1", targetId: "definition-1" }],
          feedbackByItemId: {},
        },
      },
      {
        interaction: {
          kind: "classify",
          items: [{ id: "item-1" }],
          categories: [{ id: "category-1" }],
        },
        answerKey: {
          kind: "classify",
          correctPlacements: [{ itemId: "item-1", categoryId: "category-1" }],
          feedbackByItemId: {},
        },
      },
      {
        interaction: {
          kind: "fill-blanks",
          blanks: [{ id: "blank-1", label: "First blank" }],
        },
        answerKey: {
          kind: "fill-blanks",
          blanks: [
            {
              blankId: "blank-1",
              acceptedAnswers: ["answer"],
              caseSensitive: false,
              trimWhitespace: true,
            },
          ],
          feedbackByBlankId: {},
        },
      },
      {
        interaction: {
          kind: "spatial-hotspot",
          hotspots: [
            {
              id: "hotspot-1",
              geometry: {
                kind: "circle",
                centerX: 0.25,
                centerY: 0.75,
                radius: 0.1,
              },
            },
          ],
          maxSelections: null,
        },
        answerKey: {
          kind: "spatial-hotspot",
          gradingMode: "partial-credit",
          correctHotspotIds: ["hotspot-1"],
          feedbackByHotspotId: {},
        },
      },
    ];

    for (const { interaction, answerKey } of variants) {
      expect(AssessmentInteractionContractSchema.parse(interaction)).toEqual(interaction);
      expect(AssessmentTargetContractSchema.parse(targetWith(interaction, answerKey))).toEqual(
        targetWith(interaction, answerKey),
      );
    }
  });

  it("accepts every private answer variant with authored rich-text feedback", () => {
    const assessments: AssessmentAnswerKey[] = [
      {
        kind: "single-select",
        correctOptionId: null,
        feedbackByOptionId: { "option-a": feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "multi-select",
        correctOptionIds: ["option-a", "option-b"],
        feedbackByOptionId: { "option-a": feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "sequence",
        correctOrder: ["step-1", "step-2"],
        feedbackByItemId: { "step-1": feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "match",
        correctPairs: [{ itemId: "term-1", targetId: "definition-1" }],
        feedbackByItemId: { "term-1": feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "classify",
        correctPlacements: [{ itemId: "item-1", categoryId: "category-1" }],
        feedbackByItemId: { "item-1": feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "fill-blanks",
        blanks: [
          {
            blankId: "blank-1",
            acceptedAnswers: ["Scaffold"],
            caseSensitive: false,
            trimWhitespace: true,
          },
        ],
        feedbackByBlankId: { "blank-1": feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "spatial-hotspot",
        gradingMode: "partial-credit",
        correctHotspotIds: ["hotspot-1"],
        feedbackByHotspotId: { "hotspot-1": feedback },
        missFeedback: feedback,
        summaryFeedback: feedback,
      },
    ];

    for (const assessment of assessments) {
      expect(AssessmentAnswerKeySchema.parse(assessment)).toEqual(assessment);
    }
  });

  it("preserves current authored defaults for selection limits and feedback", () => {
    expect(
      AssessmentInteractionContractSchema.parse({ kind: "multi-select", options: [] }),
    ).toEqual({ kind: "multi-select", options: [], maxSelections: null });
    expect(
      AssessmentInteractionContractSchema.parse({ kind: "spatial-hotspot", hotspots: [] }),
    ).toEqual({ kind: "spatial-hotspot", hotspots: [], maxSelections: null });

    expect(
      AssessmentAnswerKeySchema.parse({ kind: "single-select", correctOptionId: null }),
    ).toEqual({ kind: "single-select", correctOptionId: null, feedbackByOptionId: {} });
    expect(AssessmentAnswerKeySchema.parse({ kind: "multi-select", correctOptionIds: [] })).toEqual(
      {
        kind: "multi-select",
        correctOptionIds: [],
        feedbackByOptionId: {},
      },
    );
    expect(AssessmentAnswerKeySchema.parse({ kind: "sequence", correctOrder: [] })).toEqual({
      kind: "sequence",
      correctOrder: [],
      feedbackByItemId: {},
    });
    expect(AssessmentAnswerKeySchema.parse({ kind: "match", correctPairs: [] })).toEqual({
      kind: "match",
      correctPairs: [],
      feedbackByItemId: {},
    });
    expect(AssessmentAnswerKeySchema.parse({ kind: "classify", correctPlacements: [] })).toEqual({
      kind: "classify",
      correctPlacements: [],
      feedbackByItemId: {},
    });
    expect(
      AssessmentAnswerKeySchema.parse({
        kind: "fill-blanks",
        blanks: [{ blankId: "blank-1", acceptedAnswers: ["answer"] }],
      }),
    ).toEqual({
      kind: "fill-blanks",
      blanks: [
        {
          blankId: "blank-1",
          acceptedAnswers: ["answer"],
          caseSensitive: false,
          trimWhitespace: true,
        },
      ],
      feedbackByBlankId: {},
    });
    expect(
      AssessmentAnswerKeySchema.parse({
        kind: "spatial-hotspot",
        gradingMode: "all-or-nothing",
        correctHotspotIds: [],
      }),
    ).toEqual({
      kind: "spatial-hotspot",
      gradingMode: "all-or-nothing",
      correctHotspotIds: [],
      feedbackByHotspotId: {},
    });
  });

  it("rejects sentinel, missing, and mismatched answer keys", () => {
    const singleSelect: AssessmentInteractionContract = {
      kind: "single-select",
      options: [{ id: "option-a" }],
    };
    const spatialHotspot: AssessmentInteractionContract = {
      kind: "spatial-hotspot",
      hotspots: [
        {
          id: "hotspot-1",
          geometry: { kind: "circle", centerX: 0.5, centerY: 0.5, radius: 0.1 },
        },
      ],
      maxSelections: 1,
    };
    const singleSelectTarget = targetWith(singleSelect, {
      kind: "single-select",
      correctOptionId: "option-a",
      feedbackByOptionId: {},
    });

    for (const assessment of [{ kind: "none" }, { kind: "needs-review" }]) {
      expect(AssessmentAnswerKeySchema.safeParse(assessment).success).toBe(false);
      expect(
        AssessmentTargetContractSchema.safeParse({ ...singleSelectTarget, assessment }).success,
      ).toBe(false);
    }

    const missingAnswerKey = structuredClone(singleSelectTarget);
    Reflect.deleteProperty(missingAnswerKey, "assessment");
    expect(AssessmentTargetContractSchema.safeParse(missingAnswerKey).success).toBe(false);
    expect(
      AssessmentTargetContractSchema.safeParse({
        ...singleSelectTarget,
        assessment: { kind: "single-select" },
      }).success,
    ).toBe(false);

    expect(
      AssessmentTargetContractSchema.safeParse(
        targetWith(singleSelect, {
          kind: "multi-select",
          correctOptionIds: ["option-a"],
          feedbackByOptionId: {},
        }),
      ).success,
    ).toBe(false);
    expect(
      AssessmentTargetContractSchema.safeParse(
        targetWith(spatialHotspot, {
          kind: "fill-blanks",
          blanks: [],
          feedbackByBlankId: {},
        }),
      ).success,
    ).toBe(false);
  });

  it("accepts only literal v1 targets with non-blank identity fields", () => {
    const interaction: AssessmentInteractionContract = {
      kind: "single-select",
      options: [{ id: "option-a" }],
    };
    const target = targetWith(interaction, {
      kind: "single-select",
      correctOptionId: "option-a",
      feedbackByOptionId: {},
    });

    expect(AssessmentTargetContractSchema.safeParse(target).success).toBe(true);
    expect(AssessmentTargetContractSchema.safeParse({ ...target, schemaVersion: 0 }).success).toBe(
      false,
    );
    expect(AssessmentTargetContractSchema.safeParse({ ...target, schemaVersion: 2 }).success).toBe(
      false,
    );
    expect(AssessmentTargetContractSchema.safeParse({ ...target, schemaVersion: 99 }).success).toBe(
      false,
    );

    for (const identity of [{ targetId: "" }, { blockId: "   " }, { blockType: "\t" }]) {
      expect(AssessmentTargetContractSchema.safeParse({ ...target, ...identity }).success).toBe(
        false,
      );
    }
  });

  it("enforces authored points, attempts, and selection bounds", () => {
    const interaction: AssessmentInteractionContract = {
      kind: "multi-select",
      options: [{ id: "option-a" }, { id: "option-b" }],
      maxSelections: null,
    };
    const assessment: AssessmentAnswerKey = {
      kind: "multi-select",
      correctOptionIds: ["option-a"],
      feedbackByOptionId: {},
    };
    const target = targetWith(interaction, assessment);

    expect(
      AssessmentTargetContractSchema.safeParse({
        ...target,
        settings: { ...target.settings, points: 0, maxAttempts: null, maxSelections: null },
      }).success,
    ).toBe(true);

    for (const settings of [
      { ...target.settings, points: -1 },
      { ...target.settings, maxAttempts: 0 },
      { ...target.settings, maxAttempts: -1 },
      { ...target.settings, maxAttempts: 1.5 },
      { ...target.settings, maxSelections: 0 },
      { ...target.settings, maxSelections: -1 },
      { ...target.settings, maxSelections: 1.5 },
    ]) {
      expect(AssessmentTargetContractSchema.safeParse({ ...target, settings }).success).toBe(false);
    }

    expect(
      AssessmentInteractionContractSchema.safeParse({ ...interaction, maxSelections: 0 }).success,
    ).toBe(false);
    expect(
      AssessmentInteractionContractSchema.safeParse({ ...interaction, maxSelections: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects authored feedback that is not validated rich-text content", () => {
    expect(
      AssessmentAnswerKeySchema.safeParse({
        kind: "single-select",
        correctOptionId: "option-a",
        feedbackByOptionId: {
          "option-a": {
            kind: "plain-text",
            document: { type: "doc" },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      AssessmentAnswerKeySchema.safeParse({
        kind: "spatial-hotspot",
        gradingMode: "all-or-nothing",
        correctHotspotIds: ["hotspot-1"],
        summaryFeedback: {
          kind: "rich-text",
          document: { type: "paragraph" },
        },
      }).success,
    ).toBe(false);
  });

  it("round-trips a target through JSON without changing the contract value", () => {
    const target = targetWith(
      {
        kind: "spatial-hotspot",
        hotspots: [
          {
            id: "hotspot-1",
            label: "Primary region",
            geometry: { kind: "circle", centerX: 0.4, centerY: 0.6, radius: 0.2 },
          },
        ],
        maxSelections: 1,
      },
      {
        kind: "spatial-hotspot",
        gradingMode: "partial-credit",
        correctHotspotIds: ["hotspot-1"],
        feedbackByHotspotId: { "hotspot-1": feedback },
        missFeedback: feedback,
        summaryFeedback: null,
      },
    );
    const parsed = AssessmentTargetContractSchema.parse({
      ...target,
      settings: {
        ...target.settings,
        legend: "Select the highlighted area",
        label: "Diagram response",
        placeholder: "Choose a region",
        maxSelections: 1,
      },
    });
    const reparsed = AssessmentTargetContractSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed).toEqual(parsed);
  });
});

describe("assessment answer reveal contracts", () => {
  const feedback: AssessmentFeedbackContent = {
    kind: "rich-text",
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [
            {
              type: "text",
              text: "Review the revealed answer.",
              marks: [{ type: "strong" }],
            },
          ],
        },
      ],
    },
  };

  const answerKeys: AssessmentAnswerKey[] = [
    {
      kind: "single-select",
      correctOptionId: "option-b",
      feedbackByOptionId: { "option-b": feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "multi-select",
      correctOptionIds: ["option-a", "option-b"],
      feedbackByOptionId: { "option-a": feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "sequence",
      correctOrder: ["step-1", "step-2"],
      feedbackByItemId: { "step-1": feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "match",
      correctPairs: [{ itemId: "term-1", targetId: "definition-1" }],
      feedbackByItemId: { "term-1": feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "classify",
      correctPlacements: [{ itemId: "item-1", categoryId: "category-1" }],
      feedbackByItemId: { "item-1": feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "fill-blanks",
      blanks: [
        {
          blankId: "blank-1",
          acceptedAnswers: ["Scaffold"],
          caseSensitive: false,
          trimWhitespace: true,
        },
      ],
      feedbackByBlankId: { "blank-1": feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "spatial-hotspot",
      gradingMode: "partial-credit",
      correctHotspotIds: ["hotspot-1"],
      feedbackByHotspotId: { "hotspot-1": feedback },
      missFeedback: feedback,
      summaryFeedback: feedback,
    },
  ];

  it("accepts all seven answer-bearing variants and their rich feedback", () => {
    for (const answerKey of answerKeys) {
      const reveal: AnswerReveal = { answerKey };

      expect(AssessmentAnswerKeySchema.parse(answerKey)).toEqual(answerKey);
      expect(AnswerRevealSchema.parse(reveal)).toEqual(reveal);
    }
  });

  it("rejects assessment states that contain no revealable answer", () => {
    for (const answerKey of [{ kind: "none" }, { kind: "needs-review" }]) {
      expect(AssessmentAnswerKeySchema.safeParse(answerKey).success).toBe(false);
      expect(AnswerRevealSchema.safeParse({ answerKey }).success).toBe(false);
    }
  });

  it("rejects malformed answer-bearing variants", () => {
    const malformedAnswerKeys = [
      { kind: "single-select" },
      { kind: "multi-select", correctOptionIds: "option-a" },
      { kind: "sequence", correctOrder: [1] },
      { kind: "match", correctPairs: [{ itemId: "term-1" }] },
      { kind: "classify", correctPlacements: [{ categoryId: "category-1" }] },
      { kind: "fill-blanks", blanks: [{ blankId: "blank-1" }] },
      {
        kind: "spatial-hotspot",
        gradingMode: "weighted",
        correctHotspotIds: ["hotspot-1"],
      },
    ];

    for (const answerKey of malformedAnswerKeys) {
      expect(AssessmentAnswerKeySchema.safeParse(answerKey).success).toBe(false);
      expect(AnswerRevealSchema.safeParse({ answerKey }).success).toBe(false);
    }
  });

  it("requires the canonical answerKey field", () => {
    expect(AnswerRevealSchema.safeParse({}).success).toBe(false);
  });

  it("rejects legacy, provider, protocol, and arbitrary top-level fields", () => {
    const answerKey = answerKeys[0];

    for (const extra of [
      { answers: answerKey },
      { items: {} },
      { success: true },
      { provider: "xblock" },
      { providerMetadata: { requestId: "request-1" } },
      { arbitrary: true },
    ]) {
      expect(AnswerRevealSchema.safeParse({ answerKey, ...extra }).success).toBe(false);
    }
  });

  it("round-trips every answer reveal variant through JSON", () => {
    for (const answerKey of answerKeys) {
      const reveal = AnswerRevealSchema.parse({ answerKey });
      const reparsed = AnswerRevealSchema.parse(JSON.parse(JSON.stringify(reveal)));

      expect(reparsed).toEqual(reveal);
    }
  });
});

describe("assessment group contracts", () => {
  const timer: QuizTimerSettings = {
    enabled: false,
    durationSeconds: 0,
  };
  const settings: QuizAssessmentSettings = {
    allowBacktracking: true,
    reviewTiming: "after_quiz",
    reviewDetail: "result_only",
    attemptsPerQuestion: 1,
    isGraded: true,
    timer,
  };
  const group: AssessmentGroupContract = {
    schemaVersion: 1,
    kind: "quiz",
    groupId: "quiz-1",
    targetIds: ["question-1", "question-2"],
    settings,
  };

  it("accepts complete current Quiz settings in an ordered v1 group", () => {
    expect(QuizTimerSettingsSchema.parse(timer)).toEqual(timer);
    expect(QuizAssessmentSettingsSchema.parse(settings)).toEqual(settings);
    expect(AssessmentGroupContractSchema.parse(group)).toEqual(group);
    expect(AssessmentGroupContractSchema.parse(group).targetIds).toEqual([
      "question-1",
      "question-2",
    ]);
  });

  it("accepts every Quiz review and attempts choice", () => {
    const reviewTimings: QuizReviewTiming[] = ["after_quiz", "after_each_answer"];
    const reviewDetails: QuizReviewDetail[] = ["none", "result_only", "full_review"];
    const attempts: QuizAttemptsPerQuestion[] = [1, 2, 3];

    for (const reviewTiming of reviewTimings) {
      expect(QuizReviewTimingSchema.parse(reviewTiming)).toBe(reviewTiming);
    }
    for (const reviewDetail of reviewDetails) {
      expect(QuizReviewDetailSchema.parse(reviewDetail)).toBe(reviewDetail);
    }
    for (const attemptsPerQuestion of attempts) {
      expect(QuizAttemptsPerQuestionSchema.parse(attemptsPerQuestion)).toBe(attemptsPerQuestion);
    }
  });

  it("rejects unsupported group contract versions", () => {
    for (const schemaVersion of [0, 2, 99]) {
      expect(AssessmentGroupContractSchema.safeParse({ ...group, schemaVersion }).success).toBe(
        false,
      );
    }
  });

  it("requires every canonical group and Quiz settings field", () => {
    for (const field of ["schemaVersion", "kind", "groupId", "targetIds", "settings"]) {
      const incompleteGroup = structuredClone(group);
      Reflect.deleteProperty(incompleteGroup, field);
      expect(AssessmentGroupContractSchema.safeParse(incompleteGroup).success).toBe(false);
    }

    for (const field of [
      "allowBacktracking",
      "reviewTiming",
      "reviewDetail",
      "attemptsPerQuestion",
      "isGraded",
      "timer",
    ]) {
      const incompleteGroup = structuredClone(group);
      Reflect.deleteProperty(incompleteGroup.settings, field);
      expect(AssessmentGroupContractSchema.safeParse(incompleteGroup).success).toBe(false);
    }

    for (const field of ["enabled", "durationSeconds"]) {
      const incompleteGroup = structuredClone(group);
      Reflect.deleteProperty(incompleteGroup.settings.timer, field);
      expect(AssessmentGroupContractSchema.safeParse(incompleteGroup).success).toBe(false);
    }
  });

  it("requires non-blank group and target identities", () => {
    for (const groupId of ["", "   ", "\t"]) {
      expect(AssessmentGroupContractSchema.safeParse({ ...group, groupId }).success).toBe(false);
    }

    for (const targetIds of [[], [""], ["question-1", "  "]]) {
      expect(AssessmentGroupContractSchema.safeParse({ ...group, targetIds }).success).toBe(false);
    }

    expect(AssessmentGroupContractSchema.safeParse({ ...group, kind: "survey" }).success).toBe(
      false,
    );
  });

  it("rejects duplicate target identities", () => {
    expect(
      AssessmentGroupContractSchema.safeParse({
        ...group,
        targetIds: ["question-1", "question-2", "question-1"],
      }).success,
    ).toBe(false);
  });

  it("enforces attempts and finite nonnegative integer timer bounds", () => {
    for (const attemptsPerQuestion of [0, 4, 1.5, "1", null]) {
      expect(QuizAttemptsPerQuestionSchema.safeParse(attemptsPerQuestion).success).toBe(false);
    }

    for (const durationSeconds of [-1, 1.5, Number.NaN, Infinity, Number.NEGATIVE_INFINITY]) {
      expect(QuizTimerSettingsSchema.safeParse({ enabled: true, durationSeconds }).success).toBe(
        false,
      );
    }

    expect(QuizTimerSettingsSchema.parse({ enabled: false, durationSeconds: 600 })).toEqual({
      enabled: false,
      durationSeconds: 600,
    });
  });

  it("rejects legacy-only fields mixed into canonical Quiz settings", () => {
    for (const legacyField of ["progression", "results", "answers", "answerReveal"]) {
      expect(
        AssessmentGroupContractSchema.safeParse({
          ...group,
          settings: {
            ...group.settings,
            [legacyField]: "legacy-value",
          },
        }).success,
      ).toBe(false);
    }
  });

  it("round-trips a Quiz group through JSON without changing its contract value", () => {
    const configuredGroup: AssessmentGroupContract = {
      ...group,
      settings: {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
        reviewDetail: "full_review",
        attemptsPerQuestion: 3,
        isGraded: false,
        timer: { enabled: false, durationSeconds: 900 },
      },
    };
    const parsed = AssessmentGroupContractSchema.parse(configuredGroup);
    const reparsed = AssessmentGroupContractSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed).toEqual(parsed);
  });
});

describe("assessment response value contracts", () => {
  it("exports and accepts all seven provider-neutral response variants", () => {
    const responses: [
      SingleSelectResponse,
      MultiSelectResponse,
      SequenceResponse,
      MatchResponse,
      ClassifyResponse,
      FillBlanksResponse,
      SpatialHotspotResponse,
    ] = [
      { kind: "single-select", optionId: "option-b" },
      { kind: "multi-select", optionIds: ["option-a", "option-c"] },
      { kind: "sequence", orderedItemIds: ["item-2", "item-1"] },
      { kind: "match", pairs: [{ itemId: "item-1", targetId: "target-2" }] },
      {
        kind: "classify",
        placements: [{ itemId: "item-1", categoryId: "category-2" }],
      },
      { kind: "fill-blanks", blanks: [{ blankId: "blank-1", value: "Scaffold" }] },
      {
        kind: "spatial-hotspot",
        selections: [{ hotspotId: "hotspot-1", x: -0.25, y: 1.5 }],
      },
    ];

    expect(SingleSelectResponseSchema.parse(responses[0])).toEqual(responses[0]);
    expect(MultiSelectResponseSchema.parse(responses[1])).toEqual(responses[1]);
    expect(SequenceResponseSchema.parse(responses[2])).toEqual(responses[2]);
    expect(MatchResponseSchema.parse(responses[3])).toEqual(responses[3]);
    expect(ClassifyResponseSchema.parse(responses[4])).toEqual(responses[4]);
    expect(FillBlanksResponseSchema.parse(responses[5])).toEqual(responses[5]);
    expect(SpatialHotspotResponseSchema.parse(responses[6])).toEqual(responses[6]);

    for (const response of responses) {
      expect(AssessmentResponseValueSchema.parse(response)).toEqual(response);
    }
  });

  it("accepts empty and partial draft response values", () => {
    const drafts: AssessmentResponseValue[] = [
      { kind: "single-select", optionId: null },
      { kind: "multi-select", optionIds: [] },
      { kind: "sequence", orderedItemIds: [] },
      { kind: "match", pairs: [] },
      { kind: "classify", placements: [] },
      { kind: "fill-blanks", blanks: [] },
      { kind: "fill-blanks", blanks: [{ blankId: "blank-1", value: "" }] },
      { kind: "spatial-hotspot", selections: [] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: -1, y: 2 }] },
    ];

    for (const draft of drafts) {
      expect(AssessmentResponseValueSchema.safeParse(draft).success).toBe(true);
    }
  });

  it("rejects missing and unsupported response kinds", () => {
    for (const response of [
      { optionId: "option-a" },
      { kind: "choice", optionId: "option-a" },
      { kind: "none" },
    ]) {
      expect(AssessmentResponseValueSchema.safeParse(response).success).toBe(false);
    }
  });

  it("requires every structural identifier in a response to be non-blank", () => {
    const responses = [
      { kind: "single-select", optionId: "" },
      { kind: "multi-select", optionIds: ["option-a", "   "] },
      { kind: "sequence", orderedItemIds: ["\t"] },
      { kind: "match", pairs: [{ itemId: "", targetId: "target-1" }] },
      { kind: "match", pairs: [{ itemId: "item-1", targetId: "  " }] },
      { kind: "classify", placements: [{ itemId: "\n", categoryId: "category-1" }] },
      { kind: "classify", placements: [{ itemId: "item-1", categoryId: "" }] },
      { kind: "fill-blanks", blanks: [{ blankId: "   ", value: "" }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: "\t", x: 0, y: 0 }] },
    ];

    for (const response of responses) {
      expect(AssessmentResponseValueSchema.safeParse(response).success).toBe(false);
    }
  });

  it("rejects malformed nested response entries", () => {
    const responses = [
      { kind: "match", pairs: [{ itemId: "item-1" }] },
      { kind: "match", pairs: [null] },
      { kind: "classify", placements: [{ itemId: "item-1", categoryId: 1 }] },
      { kind: "fill-blanks", blanks: [{ blankId: "blank-1" }] },
      { kind: "fill-blanks", blanks: [{ blankId: "blank-1", value: null }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: 0 }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: "0", y: 0 }] },
    ];

    for (const response of responses) {
      expect(AssessmentResponseValueSchema.safeParse(response).success).toBe(false);
    }
  });

  it("requires finite spatial coordinates without imposing normalized bounds", () => {
    for (const selection of [
      { hotspotId: null, x: Number.NaN, y: 0 },
      { hotspotId: null, x: Infinity, y: 0 },
      { hotspotId: null, x: 0, y: Number.NEGATIVE_INFINITY },
    ]) {
      expect(
        AssessmentResponseValueSchema.safeParse({
          kind: "spatial-hotspot",
          selections: [selection],
        }).success,
      ).toBe(false);
    }

    expect(
      AssessmentResponseValueSchema.safeParse({
        kind: "spatial-hotspot",
        selections: [{ hotspotId: null, x: -200, y: 300 }],
      }).success,
    ).toBe(true);
  });

  it("rejects raw block-local and unrelated top-level response fields", () => {
    const responses: AssessmentResponseValue[] = [
      { kind: "single-select", optionId: "option-a" },
      { kind: "multi-select", optionIds: ["option-a"] },
      { kind: "sequence", orderedItemIds: ["item-1"] },
      { kind: "match", pairs: [{ itemId: "item-1", targetId: "target-1" }] },
      {
        kind: "classify",
        placements: [{ itemId: "item-1", categoryId: "category-1" }],
      },
      { kind: "fill-blanks", blanks: [{ blankId: "blank-1", value: "answer" }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: 0, y: 0 }] },
    ];

    for (const response of responses) {
      expect(
        AssessmentResponseValueSchema.safeParse({ ...response, unrelated: true }).success,
      ).toBe(false);
    }

    expect(
      AssessmentResponseValueSchema.safeParse({
        kind: "single-select",
        optionId: "option-a",
        choices: "option-a",
      }).success,
    ).toBe(false);
    expect(
      AssessmentResponseValueSchema.safeParse({
        kind: "single-select",
        optionId: "option-a",
        schemaVersion: 1,
        targetId: "question-1",
        blockId: "block-1",
        points: 1,
        isCorrect: true,
        feedback: null,
      }).success,
    ).toBe(false);
  });

  it("rejects unrelated fields in nested response entries", () => {
    for (const response of [
      { kind: "match", pairs: [{ itemId: "item-1", targetId: "target-1", score: 1 }] },
      {
        kind: "classify",
        placements: [{ itemId: "item-1", categoryId: "category-1", correct: true }],
      },
      {
        kind: "fill-blanks",
        blanks: [{ blankId: "blank-1", value: "answer", acceptedAnswers: ["answer"] }],
      },
      {
        kind: "spatial-hotspot",
        selections: [{ hotspotId: null, x: 0, y: 0, id: "click-1" }],
      },
    ]) {
      expect(AssessmentResponseValueSchema.safeParse(response).success).toBe(false);
    }
  });

  it("preserves ordered arrays and permits duplicate identifiers", () => {
    const response: AssessmentResponseValue = {
      kind: "sequence",
      orderedItemIds: ["item-2", "item-1", "item-2"],
    };

    expect(AssessmentResponseValueSchema.parse(response)).toEqual(response);
  });

  it("round-trips every response variant through JSON", () => {
    const responses: AssessmentResponseValue[] = [
      { kind: "single-select", optionId: null },
      { kind: "multi-select", optionIds: ["option-a"] },
      { kind: "sequence", orderedItemIds: ["item-1"] },
      { kind: "match", pairs: [{ itemId: "item-1", targetId: "target-1" }] },
      {
        kind: "classify",
        placements: [{ itemId: "item-1", categoryId: "category-1" }],
      },
      { kind: "fill-blanks", blanks: [{ blankId: "blank-1", value: "" }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: 0.4, y: 0.6 }] },
    ];

    for (const response of responses) {
      const parsed = AssessmentResponseValueSchema.parse(response);
      const reparsed = AssessmentResponseValueSchema.parse(JSON.parse(JSON.stringify(parsed)));
      expect(reparsed).toEqual(parsed);
    }
  });
});

describe("assessment item value contracts", () => {
  it("accepts every canonical item value", () => {
    const values: AssessmentItemValue[] = [
      "option-a",
      "",
      -1.25,
      0,
      2.5,
      false,
      true,
      [],
      ["item-a", "item-b"],
    ];

    for (const value of values) {
      expect(AssessmentItemValueSchema.parse(value)).toEqual(value);
    }
  });

  it("rejects non-finite item numbers", () => {
    for (const value of [Number.NaN, Infinity, Number.NEGATIVE_INFINITY]) {
      expect(AssessmentItemValueSchema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects null, objects, and unsupported array values", () => {
    for (const value of [
      null,
      { optionId: "option-a" },
      [1],
      [true],
      ["item-a", 2],
      [["nested"]],
    ]) {
      expect(AssessmentItemValueSchema.safeParse(value).success).toBe(false);
    }
  });
});

describe("assessment item detail contracts", () => {
  const feedback: AssessmentFeedbackContent = {
    kind: "rich-text",
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Check this item." }],
        },
      ],
    },
  };

  it("accepts minimal detail and optional expected, given, and feedback values", () => {
    const minimal: AssessmentItemDetail = { correct: true };
    const complete: AssessmentItemDetail = {
      correct: false,
      expected: ["option-a", "option-b"],
      given: 0.5,
      feedback,
    };

    expect(AssessmentItemDetailSchema.parse(minimal)).toEqual(minimal);
    expect(AssessmentItemDetailSchema.parse(complete)).toEqual(complete);
  });

  it("rejects unsupported detail values and malformed feedback", () => {
    for (const detail of [
      { correct: false, expected: null },
      { correct: false, given: { optionId: "option-a" } },
      { correct: false, expected: [1] },
      {
        correct: false,
        feedback: { kind: "plain-text", document: { type: "doc" } },
      },
    ]) {
      expect(AssessmentItemDetailSchema.safeParse(detail).success).toBe(false);
    }
  });

  it("rejects extra item-detail fields", () => {
    expect(
      AssessmentItemDetailSchema.safeParse({
        correct: true,
        expected: "option-a",
        score: 1,
      }).success,
    ).toBe(false);
  });
});

describe("assessment result contracts", () => {
  const feedback: AssessmentFeedbackContent = {
    kind: "rich-text",
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Review the worked answer." }],
        },
      ],
    },
  };

  const result: AssessmentResult = {
    isCorrect: false,
    score: 0.5,
    maxScore: 1,
    feedback,
    items: {
      "item-1": {
        correct: false,
        expected: ["option-a", "option-b"],
        given: ["option-a"],
        feedback,
      },
    },
  };

  it("accepts normalized score boundaries and an empty item record", () => {
    const results: AssessmentResult[] = [
      {
        isCorrect: false,
        score: 0,
        maxScore: 1,
        feedback: null,
        items: {},
      },
      result,
      {
        isCorrect: true,
        score: 1,
        maxScore: 1,
        feedback: null,
        items: {},
      },
    ];

    for (const value of results) {
      expect(AssessmentResultSchema.parse(value)).toEqual(value);
    }
  });

  it("requires a finite normalized score from zero through one", () => {
    for (const score of [-0.01, 1.01, Number.NaN, Infinity, Number.NEGATIVE_INFINITY]) {
      expect(AssessmentResultSchema.safeParse({ ...result, score }).success).toBe(false);
    }
  });

  it("requires literal maxScore 1", () => {
    for (const maxScore of [0, 0.5, 2, "1", null]) {
      expect(AssessmentResultSchema.safeParse({ ...result, maxScore }).success).toBe(false);
    }
  });

  it("requires every result envelope field, including feedback and items", () => {
    for (const field of ["isCorrect", "score", "maxScore", "feedback", "items"]) {
      const incomplete = structuredClone(result);
      Reflect.deleteProperty(incomplete, field);
      expect(AssessmentResultSchema.safeParse(incomplete).success).toBe(false);
    }
  });

  it("requires feedback to be canonical rich text or null and items to be a record", () => {
    expect(
      AssessmentResultSchema.safeParse({
        ...result,
        feedback: { kind: "plain-text", document: { type: "doc" } },
      }).success,
    ).toBe(false);

    for (const items of [null, [], [{ correct: true }]]) {
      expect(AssessmentResultSchema.safeParse({ ...result, items }).success).toBe(false);
    }
  });

  it("rejects protocol, provider, version, and extra result fields", () => {
    for (const extra of [
      { success: true },
      { provider: "xblock" },
      { schemaVersion: 1 },
      { hostMaximum: 100 },
    ]) {
      expect(AssessmentResultSchema.safeParse({ ...result, ...extra }).success).toBe(false);
    }

    expect(
      AssessmentResultSchema.safeParse({
        ...result,
        items: {
          "item-1": {
            ...result.items["item-1"],
            providerItemId: "host-item-1",
          },
        },
      }).success,
    ).toBe(false);
  });

  it("round-trips a complete result through JSON", () => {
    const parsed = AssessmentResultSchema.parse(result);
    const reparsed = AssessmentResultSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed).toEqual(result);
  });
});

describe("quiz attempt state contracts", () => {
  const result: AssessmentResult = {
    isCorrect: true,
    score: 1,
    maxScore: 1,
    feedback: null,
    items: {},
  };

  const inProgressAttempt: QuizAttemptState = {
    attemptId: "attempt-1",
    groupId: "quiz-1",
    status: "in_progress",
    currentTargetId: "question-1",
    submittedTargetIds: [],
    startedAt: "2026-07-15T12:00:00Z",
    finishedAt: null,
    expiresAt: null,
    score: null,
    maxScore: null,
    resultsByTargetId: {},
    answerReviewAuthorized: false,
  };

  const completedAttempt: QuizAttemptState = {
    ...inProgressAttempt,
    status: "completed",
    currentTargetId: null,
    submittedTargetIds: ["question-1"],
    finishedAt: "2026-07-15T12:05:00Z",
    score: 1,
    maxScore: 1,
    resultsByTargetId: { "question-1": result },
    answerReviewAuthorized: true,
  };

  it("accepts only host-issued attempt statuses", () => {
    const statuses: QuizAttemptStatus[] = ["in_progress", "completed", "expired"];

    for (const status of statuses) {
      expect(QuizAttemptStatusSchema.parse(status)).toBe(status);
    }
    for (const status of ["not_started", "pending", "unknown", ""]) {
      expect(QuizAttemptStatusSchema.safeParse(status).success).toBe(false);
    }
  });

  it("accepts representative in-progress and terminal attempts", () => {
    expect(QuizAttemptStateSchema.parse(inProgressAttempt)).toEqual(inProgressAttempt);
    expect(QuizAttemptStateSchema.parse(completedAttempt)).toEqual(completedAttempt);
    expect(
      QuizAttemptStateSchema.parse({
        ...completedAttempt,
        status: "expired",
        score: 0,
        maxScore: 1,
      }),
    ).toEqual({
      ...completedAttempt,
      status: "expired",
      score: 0,
      maxScore: 1,
    });
  });

  it("requires non-blank attempt, group, current, submitted, and result identities", () => {
    for (const identity of [{ attemptId: "" }, { attemptId: "  " }, { groupId: "\t" }]) {
      expect(QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, ...identity }).success).toBe(
        false,
      );
    }

    expect(
      QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, currentTargetId: null }).success,
    ).toBe(true);
    for (const currentTargetId of ["", "   "]) {
      expect(
        QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, currentTargetId }).success,
      ).toBe(false);
    }
    for (const submittedTargetIds of [[""], ["question-1", "  "]]) {
      expect(
        QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, submittedTargetIds }).success,
      ).toBe(false);
    }
    for (const resultKey of ["", "   ", "\t"]) {
      expect(
        QuizAttemptStateSchema.safeParse({
          ...completedAttempt,
          resultsByTargetId: { [resultKey]: result },
        }).success,
      ).toBe(false);
    }
  });

  it("rejects duplicate submitted target identities", () => {
    expect(
      QuizAttemptStateSchema.safeParse({
        ...completedAttempt,
        submittedTargetIds: ["question-1", "question-2", "question-1"],
      }).success,
    ).toBe(false);
  });

  it("accepts nullable timestamp strings and rejects non-string timestamp values", () => {
    expect(
      QuizAttemptStateSchema.safeParse({
        ...inProgressAttempt,
        startedAt: null,
        finishedAt: null,
        expiresAt: null,
      }).success,
    ).toBe(true);

    for (const field of ["startedAt", "finishedAt", "expiresAt"] as const) {
      expect(
        QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, [field]: 1_000 }).success,
      ).toBe(false);
    }
  });

  it("requires finite nonnegative aggregate score values", () => {
    expect(
      QuizAttemptStateSchema.safeParse({ ...completedAttempt, score: 0, maxScore: 0 }).success,
    ).toBe(true);

    for (const score of [-1, Number.NaN, Infinity, Number.NEGATIVE_INFINITY]) {
      expect(QuizAttemptStateSchema.safeParse({ ...completedAttempt, score }).success).toBe(false);
    }
    for (const maxScore of [-1, Number.NaN, Infinity, Number.NEGATIVE_INFINITY]) {
      expect(QuizAttemptStateSchema.safeParse({ ...completedAttempt, maxScore }).success).toBe(
        false,
      );
    }
  });

  it("requires score and maxScore to be both null or both numeric", () => {
    expect(
      QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, score: null, maxScore: 1 }).success,
    ).toBe(false);
    expect(
      QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, score: 0, maxScore: null }).success,
    ).toBe(false);
  });

  it("validates every nested result against the canonical result schema", () => {
    expect(
      QuizAttemptStateSchema.safeParse({
        ...completedAttempt,
        resultsByTargetId: {
          "question-1": { ...result, success: true },
        },
      }).success,
    ).toBe(false);

    const incompleteResult = structuredClone(result);
    Reflect.deleteProperty(incompleteResult, "items");
    expect(
      QuizAttemptStateSchema.safeParse({
        ...completedAttempt,
        resultsByTargetId: { "question-1": incompleteResult },
      }).success,
    ).toBe(false);
  });

  it("requires every field and rejects provider, protocol, and internal fields", () => {
    for (const field of [
      "attemptId",
      "groupId",
      "status",
      "currentTargetId",
      "submittedTargetIds",
      "startedAt",
      "finishedAt",
      "expiresAt",
      "score",
      "maxScore",
      "resultsByTargetId",
      "answerReviewAuthorized",
    ]) {
      const incomplete = structuredClone(inProgressAttempt);
      Reflect.deleteProperty(incomplete, field);
      expect(QuizAttemptStateSchema.safeParse(incomplete).success).toBe(false);
    }

    for (const extra of [
      { success: true },
      { provider: "xblock" },
      { internalAttemptCount: 1 },
      { schemaVersion: 1 },
    ]) {
      expect(QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, ...extra }).success).toBe(
        false,
      );
    }
  });

  it("round-trips a complete attempt through JSON", () => {
    const parsed = QuizAttemptStateSchema.parse(completedAttempt);
    const reparsed = QuizAttemptStateSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed).toEqual(completedAttempt);
  });
});
