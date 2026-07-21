import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";

export const SCAFFOLD_ASSESSMENT_CONTRACT_VERSION = 1;
export const SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION = 1;

const IdLabelSchema = z
  .object({
    id: z.string(),
    label: z.string().optional(),
  })
  .strict();

export const AssessmentInteractionKindSchema = z.enum([
  "single-select",
  "multi-select",
  "sequence",
  "match",
  "classify",
  "fill-blanks",
  "spatial-hotspot",
]);
export type AssessmentInteractionKind = z.infer<typeof AssessmentInteractionKindSchema>;

export const SingleSelectInteractionSchema = z
  .object({
    kind: z.literal("single-select"),
    options: z.array(IdLabelSchema),
  })
  .strict();
export type SingleSelectInteraction = z.infer<typeof SingleSelectInteractionSchema>;

export const MultiSelectInteractionSchema = z
  .object({
    kind: z.literal("multi-select"),
    options: z.array(IdLabelSchema),
    maxSelections: z.number().int().positive().nullable().default(null),
  })
  .strict();
export type MultiSelectInteraction = z.infer<typeof MultiSelectInteractionSchema>;

export const SequenceInteractionSchema = z
  .object({
    kind: z.literal("sequence"),
    items: z.array(IdLabelSchema),
  })
  .strict();
export type SequenceInteraction = z.infer<typeof SequenceInteractionSchema>;

export const MatchInteractionSchema = z
  .object({
    kind: z.literal("match"),
    items: z.array(IdLabelSchema),
    targets: z.array(IdLabelSchema),
  })
  .strict();
export type MatchInteraction = z.infer<typeof MatchInteractionSchema>;

export const ClassifyInteractionSchema = z
  .object({
    kind: z.literal("classify"),
    items: z.array(IdLabelSchema),
    categories: z.array(IdLabelSchema),
  })
  .strict();
export type ClassifyInteraction = z.infer<typeof ClassifyInteractionSchema>;

export const FillBlanksInteractionSchema = z
  .object({
    kind: z.literal("fill-blanks"),
    blanks: z.array(IdLabelSchema),
  })
  .strict();
export type FillBlanksInteraction = z.infer<typeof FillBlanksInteractionSchema>;

export const SpatialHotspotInteractionSchema = z
  .object({
    kind: z.literal("spatial-hotspot"),
    hotspots: z.array(
      IdLabelSchema.extend({
        geometry: z
          .object({
            kind: z.literal("circle"),
            centerX: z.number(),
            centerY: z.number(),
            radius: z.number(),
          })
          .strict(),
      }).strict(),
    ),
    maxSelections: z.number().int().positive().nullable().default(null),
  })
  .strict();
export type SpatialHotspotInteraction = z.infer<typeof SpatialHotspotInteractionSchema>;

export const AssessmentInteractionContractSchema = z.discriminatedUnion("kind", [
  SingleSelectInteractionSchema,
  MultiSelectInteractionSchema,
  SequenceInteractionSchema,
  MatchInteractionSchema,
  ClassifyInteractionSchema,
  FillBlanksInteractionSchema,
  SpatialHotspotInteractionSchema,
]);
export type AssessmentInteractionContract = z.infer<typeof AssessmentInteractionContractSchema>;

export const SingleSelectAssessmentSchema = z
  .object({
    kind: z.literal("single-select"),
    correctOptionId: z.string().nullable(),
    feedbackByOptionId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type SingleSelectAssessment = z.infer<typeof SingleSelectAssessmentSchema>;

export const MultiSelectAssessmentSchema = z
  .object({
    kind: z.literal("multi-select"),
    correctOptionIds: z.array(z.string()),
    feedbackByOptionId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type MultiSelectAssessment = z.infer<typeof MultiSelectAssessmentSchema>;

export const SequenceAssessmentSchema = z
  .object({
    kind: z.literal("sequence"),
    correctOrder: z.array(z.string()),
    feedbackByItemId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type SequenceAssessment = z.infer<typeof SequenceAssessmentSchema>;

export const MatchAssessmentSchema = z
  .object({
    kind: z.literal("match"),
    correctPairs: z.array(
      z
        .object({
          itemId: z.string(),
          targetId: z.string(),
        })
        .strict(),
    ),
    feedbackByItemId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type MatchAssessment = z.infer<typeof MatchAssessmentSchema>;

export const ClassifyAssessmentSchema = z
  .object({
    kind: z.literal("classify"),
    correctPlacements: z.array(
      z
        .object({
          itemId: z.string(),
          categoryId: z.string(),
        })
        .strict(),
    ),
    feedbackByItemId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type ClassifyAssessment = z.infer<typeof ClassifyAssessmentSchema>;

export const FillBlanksAssessmentSchema = z
  .object({
    kind: z.literal("fill-blanks"),
    blanks: z.array(
      z
        .object({
          blankId: z.string(),
          acceptedAnswers: z.array(z.string()),
          caseSensitive: z.boolean().default(false),
          trimWhitespace: z.boolean().default(true),
        })
        .strict(),
    ),
    feedbackByBlankId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type FillBlanksAssessment = z.infer<typeof FillBlanksAssessmentSchema>;

export const SpatialHotspotAssessmentSchema = z
  .object({
    kind: z.literal("spatial-hotspot"),
    gradingMode: z.enum(["partial-credit", "all-or-nothing"]),
    correctHotspotIds: z.array(z.string()),
    feedbackByHotspotId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
    missFeedback: AssessmentFeedbackContentSchema.optional(),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type SpatialHotspotAssessment = z.infer<typeof SpatialHotspotAssessmentSchema>;

export const AssessmentAnswerKeySchema = z.discriminatedUnion("kind", [
  SingleSelectAssessmentSchema,
  MultiSelectAssessmentSchema,
  SequenceAssessmentSchema,
  MatchAssessmentSchema,
  ClassifyAssessmentSchema,
  FillBlanksAssessmentSchema,
  SpatialHotspotAssessmentSchema,
]);
export type AssessmentAnswerKey = z.infer<typeof AssessmentAnswerKeySchema>;

export const AnswerRevealSchema = z.object({ answerKey: AssessmentAnswerKeySchema }).strict();
export type AnswerReveal = z.infer<typeof AnswerRevealSchema>;

export const AssessmentFeedbackModeSchema = z.enum(["immediate", "on_submit"]);
export type AssessmentFeedbackMode = z.infer<typeof AssessmentFeedbackModeSchema>;

export const AssessmentTargetSettingsSchema = z
  .object({
    feedbackMode: AssessmentFeedbackModeSchema,
    isGraded: z.boolean(),
    showAnswer: z.boolean(),
    points: z.number().nonnegative(),
    maxAttempts: z.number().int().positive().nullable(),
    legend: z.string().optional(),
    label: z.string().optional(),
    placeholder: z.string().optional(),
    maxSelections: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type AssessmentTargetSettings = z.infer<typeof AssessmentTargetSettingsSchema>;

const NonBlankStringSchema = z.string().regex(/\S/, {
  message: "Must be a non-blank string",
});

const AssessmentTargetContractBaseSchema = z
  .object({
    schemaVersion: z.literal(SCAFFOLD_ASSESSMENT_CONTRACT_VERSION),
    targetId: NonBlankStringSchema,
    blockId: NonBlankStringSchema,
    blockType: NonBlankStringSchema,
    settings: AssessmentTargetSettingsSchema,
  })
  .strict();

export const AssessmentTargetContractSchema = z.union([
  AssessmentTargetContractBaseSchema.extend({
    interaction: SingleSelectInteractionSchema,
    assessment: SingleSelectAssessmentSchema,
  }).strict(),
  AssessmentTargetContractBaseSchema.extend({
    interaction: MultiSelectInteractionSchema,
    assessment: MultiSelectAssessmentSchema,
  }).strict(),
  AssessmentTargetContractBaseSchema.extend({
    interaction: SequenceInteractionSchema,
    assessment: SequenceAssessmentSchema,
  }).strict(),
  AssessmentTargetContractBaseSchema.extend({
    interaction: MatchInteractionSchema,
    assessment: MatchAssessmentSchema,
  }).strict(),
  AssessmentTargetContractBaseSchema.extend({
    interaction: ClassifyInteractionSchema,
    assessment: ClassifyAssessmentSchema,
  }).strict(),
  AssessmentTargetContractBaseSchema.extend({
    interaction: FillBlanksInteractionSchema,
    assessment: FillBlanksAssessmentSchema,
  }).strict(),
  AssessmentTargetContractBaseSchema.extend({
    interaction: SpatialHotspotInteractionSchema,
    assessment: SpatialHotspotAssessmentSchema,
  }).strict(),
]);
export type AssessmentTargetContract = z.infer<typeof AssessmentTargetContractSchema>;

export const QuizReviewTimingSchema = z.enum(["after_quiz", "after_each_answer"]);
export type QuizReviewTiming = z.infer<typeof QuizReviewTimingSchema>;

export const QuizReviewDetailSchema = z.enum(["none", "result_only", "full_review"]);
export type QuizReviewDetail = z.infer<typeof QuizReviewDetailSchema>;

export const QuizAttemptsPerQuestionSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type QuizAttemptsPerQuestion = z.infer<typeof QuizAttemptsPerQuestionSchema>;

export const QuizTimerSettingsSchema = z
  .object({
    enabled: z.boolean(),
    durationSeconds: z.number().finite().int().nonnegative(),
  })
  .strict();
export type QuizTimerSettings = z.infer<typeof QuizTimerSettingsSchema>;

export const QuizAssessmentSettingsSchema = z
  .object({
    allowBacktracking: z.boolean(),
    reviewTiming: QuizReviewTimingSchema,
    reviewDetail: QuizReviewDetailSchema,
    attemptsPerQuestion: QuizAttemptsPerQuestionSchema,
    isGraded: z.boolean(),
    timer: QuizTimerSettingsSchema,
  })
  .strict();
export type QuizAssessmentSettings = z.infer<typeof QuizAssessmentSettingsSchema>;

export const AssessmentGroupContractSchema = z
  .object({
    schemaVersion: z.literal(SCAFFOLD_ASSESSMENT_CONTRACT_VERSION),
    kind: z.literal("quiz"),
    groupId: NonBlankStringSchema,
    targetIds: z
      .array(NonBlankStringSchema)
      .min(1)
      .refine((targetIds) => new Set(targetIds).size === targetIds.length, {
        message: "Target IDs must be unique",
      }),
    settings: QuizAssessmentSettingsSchema,
  })
  .strict();
export type AssessmentGroupContract = z.infer<typeof AssessmentGroupContractSchema>;

export const SingleSelectResponseSchema = z
  .object({
    kind: z.literal("single-select"),
    optionId: NonBlankStringSchema.nullable(),
  })
  .strict();
export type SingleSelectResponse = z.infer<typeof SingleSelectResponseSchema>;

export const MultiSelectResponseSchema = z
  .object({
    kind: z.literal("multi-select"),
    optionIds: z.array(NonBlankStringSchema),
  })
  .strict();
export type MultiSelectResponse = z.infer<typeof MultiSelectResponseSchema>;

export const SequenceResponseSchema = z
  .object({
    kind: z.literal("sequence"),
    orderedItemIds: z.array(NonBlankStringSchema),
  })
  .strict();
export type SequenceResponse = z.infer<typeof SequenceResponseSchema>;

export const MatchResponseSchema = z
  .object({
    kind: z.literal("match"),
    pairs: z.array(
      z
        .object({
          itemId: NonBlankStringSchema,
          targetId: NonBlankStringSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type MatchResponse = z.infer<typeof MatchResponseSchema>;

export const ClassifyResponseSchema = z
  .object({
    kind: z.literal("classify"),
    placements: z.array(
      z
        .object({
          itemId: NonBlankStringSchema,
          categoryId: NonBlankStringSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type ClassifyResponse = z.infer<typeof ClassifyResponseSchema>;

export const FillBlanksResponseSchema = z
  .object({
    kind: z.literal("fill-blanks"),
    blanks: z.array(
      z
        .object({
          blankId: NonBlankStringSchema,
          value: z.string(),
        })
        .strict(),
    ),
  })
  .strict();
export type FillBlanksResponse = z.infer<typeof FillBlanksResponseSchema>;

export const SpatialHotspotResponseSchema = z
  .object({
    kind: z.literal("spatial-hotspot"),
    selections: z.array(
      z
        .object({
          hotspotId: NonBlankStringSchema.nullable(),
          x: z.number().finite(),
          y: z.number().finite(),
        })
        .strict(),
    ),
  })
  .strict();
export type SpatialHotspotResponse = z.infer<typeof SpatialHotspotResponseSchema>;

export const AssessmentResponseValueSchema = z.discriminatedUnion("kind", [
  SingleSelectResponseSchema,
  MultiSelectResponseSchema,
  SequenceResponseSchema,
  MatchResponseSchema,
  ClassifyResponseSchema,
  FillBlanksResponseSchema,
  SpatialHotspotResponseSchema,
]);
export type AssessmentResponseValue = z.infer<typeof AssessmentResponseValueSchema>;

export const AssessmentItemValueSchema = z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.array(z.string()),
]);
export type AssessmentItemValue = z.infer<typeof AssessmentItemValueSchema>;

export const AssessmentItemDetailSchema = z
  .object({
    correct: z.boolean(),
    expected: AssessmentItemValueSchema.optional(),
    given: AssessmentItemValueSchema.optional(),
    feedback: AssessmentFeedbackContentSchema.optional(),
  })
  .strict();
export type AssessmentItemDetail = z.infer<typeof AssessmentItemDetailSchema>;

export const AssessmentResultSchema = z
  .object({
    isCorrect: z.boolean(),
    score: z.number().finite().min(0).max(1),
    maxScore: z.literal(1),
    feedback: AssessmentFeedbackContentSchema.nullable(),
    items: z.record(z.string(), AssessmentItemDetailSchema),
  })
  .strict();
export type AssessmentResult = z.infer<typeof AssessmentResultSchema>;

export const AssessmentActivityStatusSchema = z.enum(["not_started", "in_progress", "completed"]);
export type AssessmentActivityStatus = z.infer<typeof AssessmentActivityStatusSchema>;

export const AssessmentGradingStatusSchema = z.enum(["not_ready", "graded"]);
export type AssessmentGradingStatus = z.infer<typeof AssessmentGradingStatusSchema>;

const Rfc3339InstantWithSubsecondPrecisionSchema = z
  .string()
  .datetime({ offset: true })
  .regex(/\.\d+(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);

const AssessmentGradeProjectionBaseSchema = z.object({
  activityStatus: AssessmentActivityStatusSchema,
  changedAt: Rfc3339InstantWithSubsecondPrecisionSchema,
});

export const AssessmentGradeProjectionSchema = z.union([
  AssessmentGradeProjectionBaseSchema.extend({
    normalizedScore: z.null(),
    gradingStatus: z.literal("not_ready"),
  }).strict(),
  AssessmentGradeProjectionBaseSchema.extend({
    normalizedScore: z.number().finite().min(0).max(1),
    gradingStatus: z.literal("graded"),
  }).strict(),
]);
export type AssessmentGradeProjection = z.infer<typeof AssessmentGradeProjectionSchema>;

export const QuizAttemptStatusSchema = z.enum(["in_progress", "completed", "expired"]);
export type QuizAttemptStatus = z.infer<typeof QuizAttemptStatusSchema>;

const QuizAttemptStateBaseSchema = z.object({
  attemptId: NonBlankStringSchema,
  groupId: NonBlankStringSchema,
  status: QuizAttemptStatusSchema,
  currentTargetId: NonBlankStringSchema.nullable(),
  submittedTargetIds: z
    .array(NonBlankStringSchema)
    .refine((targetIds) => new Set(targetIds).size === targetIds.length, {
      message: "Submitted target IDs must be unique",
    }),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  resultsByTargetId: z.record(NonBlankStringSchema, AssessmentResultSchema),
  answerReviewAuthorized: z.boolean(),
});

export const QuizAttemptStateSchema = z.union([
  QuizAttemptStateBaseSchema.extend({
    score: z.null(),
    maxScore: z.null(),
  }).strict(),
  QuizAttemptStateBaseSchema.extend({
    score: z.number().finite().nonnegative(),
    maxScore: z.number().finite().nonnegative(),
  }).strict(),
]);
export type QuizAttemptState = z.infer<typeof QuizAttemptStateSchema>;

const QuizAttemptSnapshotBaseSchema = QuizAttemptStateBaseSchema.omit({ groupId: true });

export const QuizAttemptSnapshotSchema = z.union([
  QuizAttemptSnapshotBaseSchema.extend({
    score: z.null(),
    maxScore: z.null(),
  }).strict(),
  QuizAttemptSnapshotBaseSchema.extend({
    score: z.number().finite().nonnegative(),
    maxScore: z.number().finite().nonnegative(),
  }).strict(),
]);
export type QuizAttemptSnapshot = z.infer<typeof QuizAttemptSnapshotSchema>;

const AssessmentSnapshotTargetIdSchema = NonBlankStringSchema.regex(
  /^(?!artifact:[\s\S]*\/block:)/,
  { message: "Problem keys must be canonical target ids, not runtime composite ids" },
);

const AssessmentProblemSnapshotBaseSchema = z.object({
  response: AssessmentResponseValueSchema.nullable(),
  attemptNumber: z.number().int().nonnegative(),
  hintsShown: z.number().int().nonnegative(),
  checkResult: AssessmentResultSchema.nullable(),
});

export const AssessmentProblemSnapshotSchema = z.union([
  AssessmentProblemSnapshotBaseSchema.extend({
    submitted: z.literal(false),
    submissionResult: z.null(),
  }).strict(),
  AssessmentProblemSnapshotBaseSchema.extend({
    submitted: z.literal(true),
    submissionResult: AssessmentResultSchema,
  }).strict(),
]);
export type AssessmentProblemSnapshot = z.infer<typeof AssessmentProblemSnapshotSchema>;

export const AssessmentLearnerSnapshotSchema = z
  .object({
    snapshotVersion: z.literal(SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION),
    artifactId: NonBlankStringSchema,
    problems: z.record(AssessmentSnapshotTargetIdSchema, AssessmentProblemSnapshotSchema),
    quizzes: z.record(NonBlankStringSchema, QuizAttemptSnapshotSchema),
  })
  .strict();
export type AssessmentLearnerSnapshot = z.infer<typeof AssessmentLearnerSnapshotSchema>;
