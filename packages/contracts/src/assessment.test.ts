import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import type { z } from "zod";

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
  QuizPassingScoreSchema,
  QuizReviewDetailSchema,
  QuizReviewTimingSchema,
  ScoreSchema,
  QuizSuccessStatusSchema,
  QuizTimerSettingsSchema,
  SequenceResponseSchema,
  SingleSelectResponseSchema,
  SpatialHotspotResponseSchema,
  SpatialPlacementAssessmentSchema,
  SpatialPlacementResponseSchema,
  type EmbeddedDataId,
  type EmbeddedNodeId,
  type AssessmentActivityStatus,
  type AssessmentFeedbackContent,
  type AssessmentGradeProjection,
  type AssessmentGradingStatus,
  type AssessmentItemDetail,
  type AssessmentItemValue,
  type AssessmentProblemSnapshot,
  type AssessmentResult,
  type QuizAssessmentSettings,
  type QuizAttemptStatus,
  type QuizAttemptsPerQuestion,
  type QuizReviewDetail,
  type QuizReviewTiming,
  type Score,
  type SingleSelectInteraction,
  type SpatialHotspotInteraction,
  type SpatialPlacementInteraction,
  type QuizTimerSettings,
} from "./index";

type SingleSelectOptionId = SingleSelectInteraction["options"][number]["id"];
type SpatialHotspotId = SpatialHotspotInteraction["hotspots"][number]["id"];
type SpatialPlacementMarkerId = SpatialPlacementInteraction["markers"][number]["id"];

describe("assessment learner snapshot contracts", () => {
  const result: AssessmentResult = {
    isCorrect: true,
    score: { scaled: 1, raw: 1, min: 0, max: 1 },
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

  const quizAttemptSnapshot: z.input<typeof QuizAttemptSnapshotSchema> = {
    attemptId: "attempt-1",
    status: "in_progress",
    currentTargetId: "questn_00001",
    submittedTargetIds: [],
    startedAt: "2026-07-15T12:00:00Z",
    finishedAt: null,
    expiresAt: null,
    score: null,
    successStatus: null,
    resultsByTargetId: {},
    answerReviewAuthorized: false,
  };

  it("exports the independent literal v2 snapshot contract and accepts an empty snapshot", () => {
    const snapshot: z.input<typeof AssessmentLearnerSnapshotSchema> = {
      snapshotVersion: 2,
      artifactId: "artifact-1",
      problems: {},
      quizzes: {},
    };

    expect(SCAFFOLD_ASSESSMENT_CONTRACT_VERSION).toBe(2);
    expect(SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION).toBe(2);
    expect(AssessmentLearnerSnapshotSchema.parse(snapshot)).toEqual(snapshot);
  });

  it("accepts every canonical response family in target-keyed problem entries", () => {
    const snapshot: z.input<typeof AssessmentLearnerSnapshotSchema> = {
      snapshotVersion: SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION,
      artifactId: "artifact-1",
      problems: {
        single_00001: {
          ...emptyProblem,
          response: { kind: "single-select", optionId: "option_00001" },
        },
        multi__00001: {
          ...emptyProblem,
          response: { kind: "multi-select", optionIds: ["option_00001", "option_00002"] },
        },
        seqnce_00001: {
          ...emptyProblem,
          response: { kind: "sequence", orderedItemIds: ["item_0000002", "item_0000001"] },
        },
        match__00001: {
          ...emptyProblem,
          response: {
            kind: "match",
            pairs: [{ itemId: "item_0000001", targetId: "target_00001" }],
          },
        },
        classf_00001: {
          ...emptyProblem,
          response: {
            kind: "classify",
            placements: [{ itemId: "item_0000001", categoryId: "catgry_00001" }],
          },
        },
        blanks_00001: {
          ...emptyProblem,
          response: {
            kind: "fill-blanks",
            blanks: [{ blankId: "blank_000001", value: "Scaffold" }],
          },
        },
        hotarg_00001: {
          ...emptyProblem,
          response: {
            kind: "spatial-hotspot",
            selections: [{ hotspotId: "hotsp_000001", x: 0.25, y: 0.75 }],
          },
        },
        dragdp_00001: {
          ...emptyProblem,
          response: {
            kind: "spatial-placement",
            placements: [{ markerId: "marker_00001", x: 25, y: 75 }],
          },
        },
      },
      quizzes: { quiz__000001: quizAttemptSnapshot },
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

    const snapshot: z.input<typeof AssessmentLearnerSnapshotSchema> = {
      snapshotVersion: 2,
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
    const snapshot: z.input<typeof AssessmentLearnerSnapshotSchema> = {
      snapshotVersion: 2,
      artifactId: "artifact-1",
      problems: { questn_00001: emptyProblem },
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
    const snapshot: z.input<typeof AssessmentLearnerSnapshotSchema> = {
      snapshotVersion: 2,
      artifactId: "artifact-1",
      problems: {},
      quizzes: { quiz__000001: quizAttemptSnapshot },
    };

    expect(AssessmentLearnerSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(
      AssessmentLearnerSnapshotSchema.safeParse({
        ...snapshot,
        quizzes: { quiz__000002: quizAttemptSnapshot },
      }).success,
    ).toBe(true);
    expect(
      AssessmentLearnerSnapshotSchema.safeParse({
        ...snapshot,
        quizzes: { quiz__000001: { ...quizAttemptSnapshot, groupId: "quiz__000001" } },
      }).success,
    ).toBe(false);
    expect(QuizAttemptSnapshotSchema.parse(quizAttemptSnapshot)).toEqual(quizAttemptSnapshot);
  });

  it("represents a not-started quiz by absence rather than a sentinel attempt", () => {
    expect(
      AssessmentLearnerSnapshotSchema.safeParse({
        snapshotVersion: 2,
        artifactId: "artifact-1",
        problems: {},
        quizzes: {},
      }).success,
    ).toBe(true);
    expect(
      AssessmentLearnerSnapshotSchema.safeParse({
        snapshotVersion: 2,
        artifactId: "artifact-1",
        problems: {},
        quizzes: {
          quiz__000001: {
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
      { targetId: "questn_00001" },
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

    const snapshot: z.input<typeof AssessmentLearnerSnapshotSchema> = {
      snapshotVersion: 2,
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
        response: { choices: "option_00001" },
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
        snapshotVersion: 2,
        artifactId: "artifact-1",
        problems: {},
        quizzes: { quiz__000001: { ...quizAttemptSnapshot, answerReviewAuthorized: "yes" } },
      }).success,
    ).toBe(false);
  });

  it("rejects unsupported snapshot versions and round-trips canonical values through JSON", () => {
    const snapshot: z.input<typeof AssessmentLearnerSnapshotSchema> = {
      snapshotVersion: 2,
      artifactId: "artifact-1",
      problems: {
        questn_00001: {
          ...emptyProblem,
          response: { kind: "single-select", optionId: "option_00001" },
          checkResult: result,
        },
        questn_00002: {
          ...emptyProblem,
          response: { kind: "multi-select", optionIds: ["option_00002"] },
          submitted: true,
          attemptNumber: 1,
          hintsShown: 2,
          submissionResult: result,
        },
      },
      quizzes: { quiz__000001: quizAttemptSnapshot },
    };

    for (const snapshotVersion of [0, 1, 99]) {
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

  function targetWith(
    interaction: z.input<typeof AssessmentInteractionContractSchema>,
    assessment: z.input<typeof AssessmentAnswerKeySchema>,
  ) {
    return {
      schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
      targetId: "questn_00001",
      blockId: "block_000001",
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

  it("classifies projected owner ids and rejects malformed or inconsistent owner graphs", () => {
    expectTypeOf<SingleSelectOptionId>().toEqualTypeOf<EmbeddedNodeId>();
    expectTypeOf<SpatialHotspotId>().toEqualTypeOf<EmbeddedDataId>();

    const target = {
      schemaVersion: SCAFFOLD_ASSESSMENT_CONTRACT_VERSION,
      targetId: "target_00001",
      blockId: "block_000001",
      blockType: "mcq",
      interaction: {
        kind: "single-select",
        options: [{ id: "option_00001" }, { id: "option_00002" }],
      },
      assessment: {
        kind: "single-select",
        correctOptionId: "option_00001",
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

    expect(AssessmentTargetContractSchema.safeParse(target).success).toBe(true);
    expect(
      AssessmentTargetContractSchema.safeParse({
        ...target,
        interaction: { kind: "single-select", options: [{ id: "short" }] },
      }).success,
    ).toBe(false);
    expect(
      AssessmentTargetContractSchema.safeParse({
        ...target,
        interaction: {
          kind: "single-select",
          options: [{ id: "option_00001" }, { id: "option_00001" }],
        },
      }).success,
    ).toBe(false);
    expect(
      AssessmentTargetContractSchema.safeParse({
        ...target,
        assessment: {
          ...target.assessment,
          correctOptionId: "option_99999",
        },
      }).success,
    ).toBe(false);
  });

  it("accepts a literal v2 single-select target", () => {
    const target: z.input<typeof AssessmentTargetContractSchema> = {
      schemaVersion: 2,
      targetId: "questn_00001",
      blockId: "block_000001",
      blockType: "mcq",
      interaction: {
        kind: "single-select",
        options: [
          { id: "option_00001", label: "A" },
          { id: "option_00002", label: "B" },
        ],
      },
      assessment: {
        kind: "single-select",
        correctOptionId: "option_00002",
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

    expect(SCAFFOLD_ASSESSMENT_CONTRACT_VERSION).toBe(2);
    expect(AssessmentTargetContractSchema.parse(target)).toEqual(target);
  });

  it("rejects the removed required-setting field", () => {
    const target = targetWith(
      {
        kind: "single-select",
        options: [{ id: "option_00001" }],
      },
      {
        kind: "single-select",
        correctOptionId: "option_00001",
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
        options: [{ id: "option_00001" }],
      },
      {
        kind: "single-select",
        correctOptionId: "option_00001",
        feedbackByOptionId: {},
      },
    );
    const unknownFieldCases = [
      { ...target, hostMaximum: 100 },
      {
        ...target,
        interaction: { kind: "single-select", options: [{ id: "option_00001" }], provider: "host" },
      },
      {
        ...target,
        interaction: {
          kind: "single-select",
          options: [{ id: "option_00001", providerPayload: {} }],
        },
      },
      {
        ...target,
        assessment: {
          kind: "single-select",
          correctOptionId: "option_00001",
          feedbackByOptionId: {},
          hostItemId: "item_0000001",
        },
      },
      targetWith(
        {
          kind: "spatial-hotspot",
          hotspots: [
            {
              id: "hotsp_000001",
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
          correctHotspotIds: ["hotsp_000001"],
          feedbackByHotspotId: {},
        },
      ),
      targetWith(
        {
          kind: "match",
          items: [{ id: "item_0000001" }],
          targets: [{ id: "target_00001" }],
        },
        {
          kind: "match",
          correctPairs: [
            withUnknownField(
              { itemId: "item_0000001", targetId: "target_00001" },
              "provider",
              "host",
            ),
          ],
          feedbackByItemId: {},
        },
      ),
      targetWith(
        {
          kind: "classify",
          items: [{ id: "item_0000001" }],
          categories: [{ id: "catgry_00001" }],
        },
        {
          kind: "classify",
          correctPlacements: [
            withUnknownField(
              { itemId: "item_0000001", categoryId: "catgry_00001" },
              "provider",
              "host",
            ),
          ],
          feedbackByItemId: {},
        },
      ),
      targetWith(
        { kind: "fill-blanks", blanks: [{ id: "blank_000001" }] },
        {
          kind: "fill-blanks",
          blanks: [
            withUnknownField(
              {
                blankId: "blank_000001",
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

  it("accepts all eight matching interaction and answer-key variants", () => {
    const variants: Array<{
      interaction: z.input<typeof AssessmentInteractionContractSchema>;
      answerKey: z.input<typeof AssessmentAnswerKeySchema>;
    }> = [
      {
        interaction: {
          kind: "single-select",
          options: [{ id: "option_00001", label: "A" }],
        },
        answerKey: {
          kind: "single-select",
          correctOptionId: "option_00001",
          feedbackByOptionId: {},
        },
      },
      {
        interaction: {
          kind: "multi-select",
          options: [{ id: "option_00001" }, { id: "option_00002" }],
          maxSelections: 2,
        },
        answerKey: {
          kind: "multi-select",
          correctOptionIds: ["option_00001"],
          feedbackByOptionId: {},
        },
      },
      {
        interaction: {
          kind: "sequence",
          items: [{ id: "step__000001" }, { id: "step__000002", label: "Second" }],
        },
        answerKey: {
          kind: "sequence",
          correctOrder: ["step__000001", "step__000002"],
          feedbackByItemId: {},
        },
      },
      {
        interaction: {
          kind: "match",
          items: [{ id: "term__000001" }],
          targets: [{ id: "defn__000001" }],
        },
        answerKey: {
          kind: "match",
          correctPairs: [{ itemId: "term__000001", targetId: "defn__000001" }],
          feedbackByItemId: {},
        },
      },
      {
        interaction: {
          kind: "classify",
          items: [{ id: "item_0000001" }],
          categories: [{ id: "catgry_00001" }],
        },
        answerKey: {
          kind: "classify",
          correctPlacements: [{ itemId: "item_0000001", categoryId: "catgry_00001" }],
          feedbackByItemId: {},
        },
      },
      {
        interaction: {
          kind: "fill-blanks",
          blanks: [{ id: "blank_000001", label: "First blank" }],
        },
        answerKey: {
          kind: "fill-blanks",
          blanks: [
            {
              blankId: "blank_000001",
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
              id: "hotsp_000001",
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
          correctHotspotIds: ["hotsp_000001"],
          feedbackByHotspotId: {},
        },
      },
      {
        interaction: {
          kind: "spatial-placement",
          markers: [{ id: "marker_00001", label: "Capital" }],
        },
        answerKey: {
          kind: "spatial-placement",
          gradingMode: "partial-credit",
          imageAspectRatio: 2,
          correctPlacements: [
            {
              markerId: "marker_00001",
              geometry: { kind: "circle", centerX: 25, centerY: 75, radius: 8 },
            },
          ],
          feedbackByMarkerId: {},
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

  it("enforces the complete spatial-placement target graph without changing contract v2", () => {
    expectTypeOf<SpatialPlacementMarkerId>().toEqualTypeOf<EmbeddedDataId>();

    const interaction = {
      kind: "spatial-placement" as const,
      markers: [
        { id: "marker_00001", label: "Capital" },
        { id: "marker_00002", label: "Harbour" },
      ],
    };
    const assessment = {
      kind: "spatial-placement" as const,
      gradingMode: "partial-credit" as const,
      imageAspectRatio: 2,
      correctPlacements: [
        {
          markerId: "marker_00001",
          geometry: { kind: "circle" as const, centerX: 25, centerY: 75, radius: 8 },
        },
        {
          markerId: "marker_00002",
          geometry: { kind: "circle" as const, centerX: 75, centerY: 25, radius: 12 },
        },
      ],
      feedbackByMarkerId: { marker_00001: feedback },
      summaryFeedback: feedback,
    };
    const target = targetWith(interaction, assessment);

    expect(SCAFFOLD_ASSESSMENT_CONTRACT_VERSION).toBe(2);
    expect(AssessmentTargetContractSchema.parse(target)).toEqual(target);

    const invalidTargets = [
      targetWith(
        {
          ...interaction,
          markers: [interaction.markers[0], { ...interaction.markers[1], id: "marker_00001" }],
        },
        assessment,
      ),
      targetWith(
        { ...interaction, markers: [{ ...interaction.markers[0], label: "   " }] },
        { ...assessment, correctPlacements: [assessment.correctPlacements[0]] },
      ),
      targetWith(interaction, {
        ...assessment,
        correctPlacements: [assessment.correctPlacements[0]],
      }),
      targetWith(interaction, {
        ...assessment,
        correctPlacements: [
          ...assessment.correctPlacements,
          {
            markerId: "marker_00003",
            geometry: { kind: "circle", centerX: 50, centerY: 50, radius: 10 },
          },
        ],
      }),
      targetWith(interaction, {
        ...assessment,
        correctPlacements: [assessment.correctPlacements[0], assessment.correctPlacements[0]],
      }),
      targetWith(interaction, {
        ...assessment,
        feedbackByMarkerId: { marker_00003: feedback },
      }),
      targetWith(interaction, { ...assessment, imageAspectRatio: null }),
      targetWith(interaction, {
        ...assessment,
        correctPlacements: [
          {
            ...assessment.correctPlacements[0],
            geometry: { kind: "circle", centerX: 25, centerY: 75, radius: 0 },
          },
          assessment.correctPlacements[1],
        ],
      }),
      targetWith(interaction, {
        kind: "spatial-hotspot",
        gradingMode: "partial-credit",
        correctHotspotIds: [],
        feedbackByHotspotId: {},
      }),
    ];

    for (const invalidTarget of invalidTargets) {
      expect(AssessmentTargetContractSchema.safeParse(invalidTarget).success).toBe(false);
    }
  });

  it("applies the spatial-placement aspect-ratio refinement at both answer-key boundaries", () => {
    const invalidAnswerKey = {
      kind: "spatial-placement" as const,
      gradingMode: "partial-credit" as const,
      imageAspectRatio: null,
      correctPlacements: [
        {
          markerId: "marker_00001",
          geometry: { kind: "circle" as const, centerX: 25, centerY: 75, radius: 8 },
        },
      ],
      feedbackByMarkerId: {},
    };
    const directResult = SpatialPlacementAssessmentSchema.safeParse(invalidAnswerKey);
    const unionResult = AssessmentAnswerKeySchema.safeParse(invalidAnswerKey);

    expect(directResult.success).toBe(false);
    expect(unionResult.success).toBe(false);
    if (directResult.success || unionResult.success) {
      throw new Error("Expected the spatial-placement aspect-ratio refinement to fail");
    }
    expect(unionResult.error.issues).toEqual(directResult.error.issues);
  });

  it("accepts every private answer variant with authored rich-text feedback", () => {
    const assessments: Array<z.input<typeof AssessmentAnswerKeySchema>> = [
      {
        kind: "single-select",
        correctOptionId: null,
        feedbackByOptionId: { option_00001: feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "multi-select",
        correctOptionIds: ["option_00001", "option_00002"],
        feedbackByOptionId: { option_00001: feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "sequence",
        correctOrder: ["step__000001", "step__000002"],
        feedbackByItemId: { step__000001: feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "match",
        correctPairs: [{ itemId: "term__000001", targetId: "defn__000001" }],
        feedbackByItemId: { term__000001: feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "classify",
        correctPlacements: [{ itemId: "item_0000001", categoryId: "catgry_00001" }],
        feedbackByItemId: { item_0000001: feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "fill-blanks",
        blanks: [
          {
            blankId: "blank_000001",
            acceptedAnswers: ["Scaffold"],
            caseSensitive: false,
            trimWhitespace: true,
          },
        ],
        feedbackByBlankId: { blank_000001: feedback },
        summaryFeedback: feedback,
      },
      {
        kind: "spatial-hotspot",
        gradingMode: "partial-credit",
        correctHotspotIds: ["hotsp_000001"],
        feedbackByHotspotId: { hotsp_000001: feedback },
        missFeedback: feedback,
        summaryFeedback: feedback,
      },
      {
        kind: "spatial-placement",
        gradingMode: "partial-credit",
        imageAspectRatio: 2,
        correctPlacements: [
          {
            markerId: "marker_00001",
            geometry: { kind: "circle", centerX: 25, centerY: 75, radius: 8 },
          },
        ],
        feedbackByMarkerId: { marker_00001: feedback },
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
        blanks: [{ blankId: "blank_000001", acceptedAnswers: ["answer"] }],
      }),
    ).toEqual({
      kind: "fill-blanks",
      blanks: [
        {
          blankId: "blank_000001",
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
    expect(
      AssessmentAnswerKeySchema.parse({
        kind: "spatial-placement",
        gradingMode: "partial-credit",
        imageAspectRatio: null,
        correctPlacements: [],
      }),
    ).toEqual({
      kind: "spatial-placement",
      gradingMode: "partial-credit",
      imageAspectRatio: null,
      correctPlacements: [],
      feedbackByMarkerId: {},
    });
  });

  it("rejects sentinel, missing, and mismatched answer keys", () => {
    const singleSelect: z.input<typeof AssessmentInteractionContractSchema> = {
      kind: "single-select",
      options: [{ id: "option_00001" }],
    };
    const spatialHotspot: z.input<typeof AssessmentInteractionContractSchema> = {
      kind: "spatial-hotspot",
      hotspots: [
        {
          id: "hotsp_000001",
          geometry: { kind: "circle", centerX: 0.5, centerY: 0.5, radius: 0.1 },
        },
      ],
      maxSelections: 1,
    };
    const singleSelectTarget = targetWith(singleSelect, {
      kind: "single-select",
      correctOptionId: "option_00001",
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
          correctOptionIds: ["option_00001"],
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

  it("accepts only literal v2 targets with non-blank identity fields", () => {
    const interaction: z.input<typeof AssessmentInteractionContractSchema> = {
      kind: "single-select",
      options: [{ id: "option_00001" }],
    };
    const target = targetWith(interaction, {
      kind: "single-select",
      correctOptionId: "option_00001",
      feedbackByOptionId: {},
    });

    expect(AssessmentTargetContractSchema.safeParse(target).success).toBe(true);
    expect(AssessmentTargetContractSchema.safeParse({ ...target, schemaVersion: 0 }).success).toBe(
      false,
    );
    expect(AssessmentTargetContractSchema.safeParse({ ...target, schemaVersion: 1 }).success).toBe(
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
    const interaction: z.input<typeof AssessmentInteractionContractSchema> = {
      kind: "multi-select",
      options: [{ id: "option_00001" }, { id: "option_00002" }],
      maxSelections: null,
    };
    const assessment: z.input<typeof AssessmentAnswerKeySchema> = {
      kind: "multi-select",
      correctOptionIds: ["option_00001"],
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
      { ...target.settings, points: 0.5 },
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
        correctOptionId: "option_00001",
        feedbackByOptionId: {
          option_00001: {
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
        correctHotspotIds: ["hotsp_000001"],
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
            id: "hotsp_000001",
            label: "Primary region",
            geometry: { kind: "circle", centerX: 0.4, centerY: 0.6, radius: 0.2 },
          },
        ],
        maxSelections: 1,
      },
      {
        kind: "spatial-hotspot",
        gradingMode: "partial-credit",
        correctHotspotIds: ["hotsp_000001"],
        feedbackByHotspotId: { hotsp_000001: feedback },
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

  const answerKeys: Array<z.input<typeof AssessmentAnswerKeySchema>> = [
    {
      kind: "single-select",
      correctOptionId: "option_00002",
      feedbackByOptionId: { option_00002: feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "multi-select",
      correctOptionIds: ["option_00001", "option_00002"],
      feedbackByOptionId: { option_00001: feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "sequence",
      correctOrder: ["step__000001", "step__000002"],
      feedbackByItemId: { step__000001: feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "match",
      correctPairs: [{ itemId: "term__000001", targetId: "defn__000001" }],
      feedbackByItemId: { term__000001: feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "classify",
      correctPlacements: [{ itemId: "item_0000001", categoryId: "catgry_00001" }],
      feedbackByItemId: { item_0000001: feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "fill-blanks",
      blanks: [
        {
          blankId: "blank_000001",
          acceptedAnswers: ["Scaffold"],
          caseSensitive: false,
          trimWhitespace: true,
        },
      ],
      feedbackByBlankId: { blank_000001: feedback },
      summaryFeedback: feedback,
    },
    {
      kind: "spatial-hotspot",
      gradingMode: "partial-credit",
      correctHotspotIds: ["hotsp_000001"],
      feedbackByHotspotId: { hotsp_000001: feedback },
      missFeedback: feedback,
      summaryFeedback: feedback,
    },
    {
      kind: "spatial-placement",
      gradingMode: "all-or-nothing",
      imageAspectRatio: 2,
      correctPlacements: [
        {
          markerId: "marker_00001",
          geometry: { kind: "circle", centerX: 25, centerY: 75, radius: 8 },
        },
      ],
      feedbackByMarkerId: { marker_00001: feedback },
      summaryFeedback: feedback,
    },
  ];

  it("accepts all eight answer-bearing variants and their rich feedback", () => {
    for (const answerKey of answerKeys) {
      const reveal = AnswerRevealSchema.parse({ answerKey });

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
      { kind: "multi-select", correctOptionIds: "option_00001" },
      { kind: "sequence", correctOrder: [1] },
      { kind: "match", correctPairs: [{ itemId: "term__000001" }] },
      { kind: "classify", correctPlacements: [{ categoryId: "catgry_00001" }] },
      { kind: "fill-blanks", blanks: [{ blankId: "blank_000001" }] },
      {
        kind: "spatial-hotspot",
        gradingMode: "weighted",
        correctHotspotIds: ["hotsp_000001"],
      },
      {
        kind: "spatial-placement",
        gradingMode: "partial-credit",
        imageAspectRatio: 2,
        correctPlacements: [{ markerId: "marker_00001" }],
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
    passingScore: null,
    timer,
  };
  const group: z.input<typeof AssessmentGroupContractSchema> = {
    schemaVersion: 2,
    kind: "quiz",
    groupId: "quiz__000001",
    targetIds: ["questn_00001", "questn_00002"],
    settings,
  };

  it("accepts complete current Quiz settings in an ordered v2 group", () => {
    expect(QuizTimerSettingsSchema.parse(timer)).toEqual(timer);
    expect(QuizAssessmentSettingsSchema.parse(settings)).toEqual(settings);
    expect(AssessmentGroupContractSchema.parse(group)).toEqual(group);
    expect(AssessmentGroupContractSchema.parse(group).targetIds).toEqual([
      "questn_00001",
      "questn_00002",
    ]);
  });

  it("requires the current Quiz passing score field", () => {
    expect(QuizPassingScoreSchema.parse(0.8)).toBe(0.8);
    expect(QuizSuccessStatusSchema.parse(null)).toBeNull();
    expect(
      AssessmentGroupContractSchema.parse({
        ...group,
        settings: { ...group.settings, passingScore: 0.8 },
      }),
    ).toMatchObject({
      schemaVersion: 2,
      settings: { passingScore: 0.8 },
    });
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
    for (const schemaVersion of [0, 1, 99]) {
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
      "passingScore",
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

    for (const targetIds of [[], [""], ["questn_00001", "  "]]) {
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
        targetIds: ["questn_00001", "questn_00002", "questn_00001"],
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
    const configuredGroup: z.input<typeof AssessmentGroupContractSchema> = {
      ...group,
      settings: {
        allowBacktracking: false,
        reviewTiming: "after_each_answer",
        reviewDetail: "full_review",
        attemptsPerQuestion: 3,
        isGraded: false,
        passingScore: 0.8,
        timer: { enabled: false, durationSeconds: 900 },
      },
    };
    const parsed = AssessmentGroupContractSchema.parse(configuredGroup);
    const reparsed = AssessmentGroupContractSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed).toEqual(parsed);
  });
});

describe("assessment response value contracts", () => {
  it("exports and accepts all eight provider-neutral response variants", () => {
    const responses: Array<z.input<typeof AssessmentResponseValueSchema>> = [
      { kind: "single-select", optionId: "option_00002" },
      { kind: "multi-select", optionIds: ["option_00001", "option_00003"] },
      { kind: "sequence", orderedItemIds: ["item_0000002", "item_0000001"] },
      { kind: "match", pairs: [{ itemId: "item_0000001", targetId: "target_00002" }] },
      {
        kind: "classify",
        placements: [{ itemId: "item_0000001", categoryId: "catgry_00002" }],
      },
      { kind: "fill-blanks", blanks: [{ blankId: "blank_000001", value: "Scaffold" }] },
      {
        kind: "spatial-hotspot",
        selections: [{ hotspotId: "hotsp_000001", x: -0.25, y: 1.5 }],
      },
      {
        kind: "spatial-placement",
        placements: [{ markerId: "marker_00001", x: 25, y: 75 }],
      },
    ];

    expect(SingleSelectResponseSchema.parse(responses[0])).toEqual(responses[0]);
    expect(MultiSelectResponseSchema.parse(responses[1])).toEqual(responses[1]);
    expect(SequenceResponseSchema.parse(responses[2])).toEqual(responses[2]);
    expect(MatchResponseSchema.parse(responses[3])).toEqual(responses[3]);
    expect(ClassifyResponseSchema.parse(responses[4])).toEqual(responses[4]);
    expect(FillBlanksResponseSchema.parse(responses[5])).toEqual(responses[5]);
    expect(SpatialHotspotResponseSchema.parse(responses[6])).toEqual(responses[6]);
    expect(SpatialPlacementResponseSchema.parse(responses[7])).toEqual(responses[7]);

    for (const response of responses) {
      expect(AssessmentResponseValueSchema.parse(response)).toEqual(response);
    }
  });

  it("accepts empty and partial draft response values", () => {
    const drafts: Array<z.input<typeof AssessmentResponseValueSchema>> = [
      { kind: "single-select", optionId: null },
      { kind: "multi-select", optionIds: [] },
      { kind: "sequence", orderedItemIds: [] },
      { kind: "match", pairs: [] },
      { kind: "classify", placements: [] },
      { kind: "fill-blanks", blanks: [] },
      { kind: "fill-blanks", blanks: [{ blankId: "blank_000001", value: "" }] },
      { kind: "spatial-hotspot", selections: [] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: -1, y: 2 }] },
      { kind: "spatial-placement", placements: [] },
      {
        kind: "spatial-placement",
        placements: [{ markerId: "marker_00001", x: 25, y: 75 }],
      },
    ];

    for (const draft of drafts) {
      expect(AssessmentResponseValueSchema.safeParse(draft).success).toBe(true);
    }
  });

  it("rejects missing and unsupported response kinds", () => {
    for (const response of [
      { optionId: "option_00001" },
      { kind: "choice", optionId: "option_00001" },
      { kind: "none" },
    ]) {
      expect(AssessmentResponseValueSchema.safeParse(response).success).toBe(false);
    }
  });

  it("requires every structural identifier in a response to be non-blank", () => {
    const responses = [
      { kind: "single-select", optionId: "" },
      { kind: "multi-select", optionIds: ["option_00001", "   "] },
      { kind: "sequence", orderedItemIds: ["\t"] },
      { kind: "match", pairs: [{ itemId: "", targetId: "target_00001" }] },
      { kind: "match", pairs: [{ itemId: "item_0000001", targetId: "  " }] },
      { kind: "classify", placements: [{ itemId: "\n", categoryId: "catgry_00001" }] },
      { kind: "classify", placements: [{ itemId: "item_0000001", categoryId: "" }] },
      { kind: "fill-blanks", blanks: [{ blankId: "   ", value: "" }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: "\t", x: 0, y: 0 }] },
      { kind: "spatial-placement", placements: [{ markerId: "\t", x: 25, y: 75 }] },
    ];

    for (const response of responses) {
      expect(AssessmentResponseValueSchema.safeParse(response).success).toBe(false);
    }
  });

  it("rejects malformed nested response entries", () => {
    const responses = [
      { kind: "match", pairs: [{ itemId: "item_0000001" }] },
      { kind: "match", pairs: [null] },
      { kind: "classify", placements: [{ itemId: "item_0000001", categoryId: 1 }] },
      { kind: "fill-blanks", blanks: [{ blankId: "blank_000001" }] },
      { kind: "fill-blanks", blanks: [{ blankId: "blank_000001", value: null }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: 0 }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: "0", y: 0 }] },
      { kind: "spatial-placement", placements: [{ markerId: "marker_00001", x: 25 }] },
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

  it("requires bounded unique spatial-placement response entries", () => {
    const placement = { markerId: "marker_00001", x: 25, y: 75 };

    expect(
      AssessmentResponseValueSchema.safeParse({
        kind: "spatial-placement",
        placements: [placement],
      }).success,
    ).toBe(true);
    for (const placements of [
      [placement, placement],
      [{ ...placement, x: -1 }],
      [{ ...placement, y: 101 }],
      [{ ...placement, x: Number.NaN }],
      [{ ...placement, y: Infinity }],
    ]) {
      expect(
        AssessmentResponseValueSchema.safeParse({
          kind: "spatial-placement",
          placements,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects raw block-local and unrelated top-level response fields", () => {
    const responses: Array<z.input<typeof AssessmentResponseValueSchema>> = [
      { kind: "single-select", optionId: "option_00001" },
      { kind: "multi-select", optionIds: ["option_00001"] },
      { kind: "sequence", orderedItemIds: ["item_0000001"] },
      { kind: "match", pairs: [{ itemId: "item_0000001", targetId: "target_00001" }] },
      {
        kind: "classify",
        placements: [{ itemId: "item_0000001", categoryId: "catgry_00001" }],
      },
      { kind: "fill-blanks", blanks: [{ blankId: "blank_000001", value: "answer" }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: 0, y: 0 }] },
      { kind: "spatial-placement", placements: [{ markerId: "marker_00001", x: 25, y: 75 }] },
    ];

    for (const response of responses) {
      expect(
        AssessmentResponseValueSchema.safeParse({ ...response, unrelated: true }).success,
      ).toBe(false);
    }

    expect(
      AssessmentResponseValueSchema.safeParse({
        kind: "single-select",
        optionId: "option_00001",
        choices: "option_00001",
      }).success,
    ).toBe(false);
    expect(
      AssessmentResponseValueSchema.safeParse({
        kind: "single-select",
        optionId: "option_00001",
        schemaVersion: 1,
        targetId: "questn_00001",
        blockId: "block_000001",
        points: 1,
        isCorrect: true,
        feedback: null,
      }).success,
    ).toBe(false);
  });

  it("rejects unrelated fields in nested response entries", () => {
    for (const response of [
      { kind: "match", pairs: [{ itemId: "item_0000001", targetId: "target_00001", score: 1 }] },
      {
        kind: "classify",
        placements: [{ itemId: "item_0000001", categoryId: "catgry_00001", correct: true }],
      },
      {
        kind: "fill-blanks",
        blanks: [{ blankId: "blank_000001", value: "answer", acceptedAnswers: ["answer"] }],
      },
      {
        kind: "spatial-hotspot",
        selections: [{ hotspotId: null, x: 0, y: 0, id: "click_000001" }],
      },
      {
        kind: "spatial-placement",
        placements: [{ markerId: "marker_00001", x: 25, y: 75, correct: true }],
      },
    ]) {
      expect(AssessmentResponseValueSchema.safeParse(response).success).toBe(false);
    }
  });

  it("preserves ordered arrays and permits duplicate identifiers", () => {
    const response: z.input<typeof AssessmentResponseValueSchema> = {
      kind: "sequence",
      orderedItemIds: ["item_0000002", "item_0000001", "item_0000002"],
    };

    expect(AssessmentResponseValueSchema.parse(response)).toEqual(response);
  });

  it("round-trips every response variant through JSON", () => {
    const responses: Array<z.input<typeof AssessmentResponseValueSchema>> = [
      { kind: "single-select", optionId: null },
      { kind: "multi-select", optionIds: ["option_00001"] },
      { kind: "sequence", orderedItemIds: ["item_0000001"] },
      { kind: "match", pairs: [{ itemId: "item_0000001", targetId: "target_00001" }] },
      {
        kind: "classify",
        placements: [{ itemId: "item_0000001", categoryId: "catgry_00001" }],
      },
      { kind: "fill-blanks", blanks: [{ blankId: "blank_000001", value: "" }] },
      { kind: "spatial-hotspot", selections: [{ hotspotId: null, x: 0.4, y: 0.6 }] },
      { kind: "spatial-placement", placements: [{ markerId: "marker_00001", x: 25, y: 75 }] },
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
      "option_00001",
      "",
      -1.25,
      0,
      2.5,
      false,
      true,
      [],
      ["item_0000001", "item_0000002"],
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
      { optionId: "option_00001" },
      [1],
      [true],
      ["item_0000001", 2],
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
      expected: ["option_00001", "option_00002"],
      given: 0.5,
      feedback,
    };

    expect(AssessmentItemDetailSchema.parse(minimal)).toEqual(minimal);
    expect(AssessmentItemDetailSchema.parse(complete)).toEqual(complete);
  });

  it("rejects unsupported detail values and malformed feedback", () => {
    for (const detail of [
      { correct: false, expected: null },
      { correct: false, given: { optionId: "option_00001" } },
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
        expected: "option_00001",
        score: 1,
      }).success,
    ).toBe(false);
  });
});

describe("score contracts", () => {
  it("accepts scaled-only and complete integer score tuples", () => {
    const scores: Score[] = [
      { scaled: 0 },
      { scaled: 0.5 },
      { scaled: 1 },
      { scaled: 0.5, raw: 1, min: 0, max: 2 },
      { scaled: 0.5, raw: -1, min: -2, max: 0 },
      {
        scaled: 1,
        raw: Number.MAX_SAFE_INTEGER,
        min: 0,
        max: Number.MAX_SAFE_INTEGER,
      },
      {
        scaled: 0,
        raw: Number.MIN_SAFE_INTEGER,
        min: Number.MIN_SAFE_INTEGER,
        max: 0,
      },
    ];

    for (const score of scores) {
      expect(ScoreSchema.parse(score)).toEqual(score);
    }
  });

  it("rejects malformed, partial, fractional, and inconsistent score shapes", () => {
    for (const score of [
      {},
      { raw: 1, min: 0, max: 2 },
      { scaled: -0.01 },
      { scaled: 1.01 },
      { scaled: Number.NaN },
      { scaled: Infinity },
      { scaled: 0.5, raw: 1 },
      { scaled: 0.5, raw: 1, min: 0 },
      { scaled: 0.5, raw: 0.5, min: 0, max: 1 },
      { scaled: 0.5, raw: 1, min: 0.5, max: 2 },
      { scaled: 0.5, raw: 1, min: 0, max: 2.5 },
      { scaled: 0.5, raw: 1, min: 1, max: 1 },
      { scaled: 0.5, raw: 0, min: 1, max: 2 },
      { scaled: 0.5, raw: 3, min: 0, max: 2 },
      { scaled: 1, raw: Number.MAX_SAFE_INTEGER + 1, min: 0, max: Number.MAX_SAFE_INTEGER + 1 },
      { scaled: 0, raw: Number.MIN_SAFE_INTEGER - 1, min: Number.MIN_SAFE_INTEGER - 1, max: 0 },
      { scaled: 0.5, providerScale: 100 },
    ]) {
      expect(ScoreSchema.safeParse(score).success).toBe(false);
    }
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
    score: { scaled: 0.5 },
    feedback,
    items: {
      item_0000001: {
        correct: false,
        expected: ["option_00001", "option_00002"],
        given: ["option_00001"],
        feedback,
      },
    },
  };

  it("accepts normalized score boundaries and an empty item record", () => {
    const results: AssessmentResult[] = [
      {
        isCorrect: false,
        score: { scaled: 0 },
        feedback: null,
        items: {},
      },
      result,
      {
        isCorrect: true,
        score: { scaled: 1, raw: 2, min: 0, max: 2 },
        feedback: null,
        items: {},
      },
    ];

    for (const value of results) {
      expect(AssessmentResultSchema.parse(value)).toEqual(value);
    }
  });

  it("requires the canonical structured score", () => {
    for (const score of [0.5, {}, { scaled: 0.5, raw: 1 }]) {
      expect(AssessmentResultSchema.safeParse({ ...result, score }).success).toBe(false);
    }
  });

  it("rejects the removed maxScore field", () => {
    for (const maxScore of [0, 0.5, 2, "1", null]) {
      expect(AssessmentResultSchema.safeParse({ ...result, maxScore }).success).toBe(false);
    }
  });

  it("requires every result envelope field, including feedback and items", () => {
    for (const field of ["isCorrect", "score", "feedback", "items"]) {
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
          item_0000001: {
            ...result.items["item_0000001"],
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
    score: { scaled: 1, raw: 1, min: 0, max: 1 },
    feedback: null,
    items: {},
  };

  it("requires success status in every current attempt", () => {
    expect(QuizAttemptStateSchema.parse(inProgressAttempt)).toEqual(inProgressAttempt);
    expect(QuizSuccessStatusSchema.parse("passed")).toBe("passed");
    expect(QuizSuccessStatusSchema.parse("failed")).toBe("failed");

    const missingSuccessStatus = structuredClone(inProgressAttempt);
    Reflect.deleteProperty(missingSuccessStatus, "successStatus");
    expect(QuizAttemptStateSchema.safeParse(missingSuccessStatus).success).toBe(false);
  });

  const inProgressAttempt: z.input<typeof QuizAttemptStateSchema> = {
    attemptId: "attempt-1",
    groupId: "artifact:artifact-1/group:quiz__000001",
    status: "in_progress",
    currentTargetId: "questn_00001",
    submittedTargetIds: [],
    startedAt: "2026-07-15T12:00:00Z",
    finishedAt: null,
    expiresAt: null,
    score: null,
    successStatus: null,
    resultsByTargetId: {},
    answerReviewAuthorized: false,
  };

  const completedAttempt: z.input<typeof QuizAttemptStateSchema> = {
    ...inProgressAttempt,
    status: "completed",
    currentTargetId: null,
    submittedTargetIds: ["questn_00001"],
    finishedAt: "2026-07-15T12:05:00Z",
    score: { scaled: 1, raw: 1, min: 0, max: 1 },
    successStatus: "passed",
    resultsByTargetId: { questn_00001: result },
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
        score: { scaled: 0 },
      }),
    ).toEqual({
      ...completedAttempt,
      status: "expired",
      score: { scaled: 0 },
    });
  });

  it("enforces lifecycle-specific score and success shapes", () => {
    for (const successStatus of ["passed", "failed"]) {
      expect(
        QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, successStatus }).success,
      ).toBe(false);
    }
    expect(
      QuizAttemptStateSchema.safeParse({
        ...inProgressAttempt,
        score: { scaled: 0 },
      }).success,
    ).toBe(false);
    expect(
      QuizAttemptStateSchema.safeParse({
        ...completedAttempt,
        score: null,
        successStatus: null,
      }).success,
    ).toBe(false);
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
    for (const submittedTargetIds of [[""], ["questn_00001", "  "]]) {
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
        submittedTargetIds: ["questn_00001", "questn_00002", "questn_00001"],
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

  it("requires a canonical terminal score", () => {
    for (const score of [0.5, {}, { scaled: 0.5, raw: 1 }]) {
      expect(QuizAttemptStateSchema.safeParse({ ...completedAttempt, score }).success).toBe(false);
    }
  });

  it("rejects terminal score during an in-progress attempt and removed maxScore fields", () => {
    expect(
      QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, score: { scaled: 0 } }).success,
    ).toBe(false);
    expect(QuizAttemptStateSchema.safeParse({ ...inProgressAttempt, maxScore: null }).success).toBe(
      false,
    );
    expect(QuizAttemptStateSchema.safeParse({ ...completedAttempt, maxScore: 1 }).success).toBe(
      false,
    );
  });

  it("validates every nested result against the canonical result schema", () => {
    expect(
      QuizAttemptStateSchema.safeParse({
        ...completedAttempt,
        resultsByTargetId: {
          questn_00001: { ...result, success: true },
        },
      }).success,
    ).toBe(false);

    const incompleteResult = structuredClone(result);
    Reflect.deleteProperty(incompleteResult, "items");
    expect(
      QuizAttemptStateSchema.safeParse({
        ...completedAttempt,
        resultsByTargetId: { questn_00001: incompleteResult },
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
      "successStatus",
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
