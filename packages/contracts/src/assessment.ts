import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { EmbeddedDataIdSchema, EmbeddedNodeIdSchema, type EmbeddedId } from "./embedded-id";

export const SCAFFOLD_ASSESSMENT_CONTRACT_VERSION = 2;
export const SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION = 2;

const NodeIdLabelSchema = z
  .object({
    id: EmbeddedNodeIdSchema,
    label: z.string().optional(),
  })
  .strict();

const DataIdLabelSchema = z
  .object({
    id: EmbeddedDataIdSchema,
    label: z.string().optional(),
  })
  .strict();

// JavaScript object keys are always structural strings. Use the unwrapped
// physical codec so record types stay assignable and generated JSON Schema
// retains the embedded-ID property-name constraint.
const EmbeddedNodeRecordKeySchema = EmbeddedNodeIdSchema.unwrap().unwrap();
const EmbeddedDataRecordKeySchema = EmbeddedDataIdSchema.unwrap().unwrap();

// Aggregate assessment values cross runtime and host boundaries where object
// keys and decoded JSON remain structural strings. Component schemas retain
// their Node/Data brands; this helper prevents those brands from leaking into
// transport-facing aggregate types and forcing consumer casts.
type StructuralAssessmentIds<T> = T extends EmbeddedId
  ? string
  : T extends readonly (infer Item)[]
    ? StructuralAssessmentIds<Item>[]
    : T extends object
      ? { [Key in keyof T]: StructuralAssessmentIds<T[Key]> }
      : T;

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
    options: z.array(NodeIdLabelSchema),
  })
  .strict();
export type SingleSelectInteraction = z.infer<typeof SingleSelectInteractionSchema>;

export const MultiSelectInteractionSchema = z
  .object({
    kind: z.literal("multi-select"),
    options: z.array(NodeIdLabelSchema),
    maxSelections: z.number().int().positive().nullable().default(null),
  })
  .strict();
export type MultiSelectInteraction = z.infer<typeof MultiSelectInteractionSchema>;

export const SequenceInteractionSchema = z
  .object({
    kind: z.literal("sequence"),
    items: z.array(NodeIdLabelSchema),
  })
  .strict();
export type SequenceInteraction = z.infer<typeof SequenceInteractionSchema>;

export const MatchInteractionSchema = z
  .object({
    kind: z.literal("match"),
    items: z.array(NodeIdLabelSchema),
    targets: z.array(NodeIdLabelSchema),
  })
  .strict();
export type MatchInteraction = z.infer<typeof MatchInteractionSchema>;

export const ClassifyInteractionSchema = z
  .object({
    kind: z.literal("classify"),
    items: z.array(NodeIdLabelSchema),
    categories: z.array(NodeIdLabelSchema),
  })
  .strict();
export type ClassifyInteraction = z.infer<typeof ClassifyInteractionSchema>;

export const FillBlanksInteractionSchema = z
  .object({
    kind: z.literal("fill-blanks"),
    blanks: z.array(NodeIdLabelSchema),
  })
  .strict();
export type FillBlanksInteraction = z.infer<typeof FillBlanksInteractionSchema>;

export const SpatialHotspotInteractionSchema = z
  .object({
    kind: z.literal("spatial-hotspot"),
    hotspots: z.array(
      DataIdLabelSchema.extend({
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

const AssessmentInteractionContractValueSchema = z.discriminatedUnion("kind", [
  SingleSelectInteractionSchema,
  MultiSelectInteractionSchema,
  SequenceInteractionSchema,
  MatchInteractionSchema,
  ClassifyInteractionSchema,
  FillBlanksInteractionSchema,
  SpatialHotspotInteractionSchema,
]);
export const AssessmentInteractionContractSchema: z.ZodType<
  StructuralAssessmentIds<z.infer<typeof AssessmentInteractionContractValueSchema>>,
  z.ZodTypeDef,
  z.input<typeof AssessmentInteractionContractValueSchema>
> = AssessmentInteractionContractValueSchema;
export type AssessmentInteractionContract = z.infer<typeof AssessmentInteractionContractSchema>;

export const SingleSelectAssessmentSchema = z
  .object({
    kind: z.literal("single-select"),
    correctOptionId: EmbeddedNodeIdSchema.nullable(),
    feedbackByOptionId: z
      .record(EmbeddedNodeRecordKeySchema, AssessmentFeedbackContentSchema)
      .default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type SingleSelectAssessment = z.infer<typeof SingleSelectAssessmentSchema>;

export const MultiSelectAssessmentSchema = z
  .object({
    kind: z.literal("multi-select"),
    correctOptionIds: z.array(EmbeddedNodeIdSchema),
    feedbackByOptionId: z
      .record(EmbeddedNodeRecordKeySchema, AssessmentFeedbackContentSchema)
      .default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type MultiSelectAssessment = z.infer<typeof MultiSelectAssessmentSchema>;

export const SequenceAssessmentSchema = z
  .object({
    kind: z.literal("sequence"),
    correctOrder: z.array(EmbeddedNodeIdSchema),
    feedbackByItemId: z
      .record(EmbeddedNodeRecordKeySchema, AssessmentFeedbackContentSchema)
      .default({}),
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
          itemId: EmbeddedNodeIdSchema,
          targetId: EmbeddedNodeIdSchema,
        })
        .strict(),
    ),
    feedbackByItemId: z
      .record(EmbeddedNodeRecordKeySchema, AssessmentFeedbackContentSchema)
      .default({}),
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
          itemId: EmbeddedNodeIdSchema,
          categoryId: EmbeddedNodeIdSchema,
        })
        .strict(),
    ),
    feedbackByItemId: z
      .record(EmbeddedNodeRecordKeySchema, AssessmentFeedbackContentSchema)
      .default({}),
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
          blankId: EmbeddedNodeIdSchema,
          acceptedAnswers: z.array(z.string()),
          caseSensitive: z.boolean().default(false),
          trimWhitespace: z.boolean().default(true),
        })
        .strict(),
    ),
    feedbackByBlankId: z
      .record(EmbeddedNodeRecordKeySchema, AssessmentFeedbackContentSchema)
      .default({}),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type FillBlanksAssessment = z.infer<typeof FillBlanksAssessmentSchema>;

export const SpatialHotspotAssessmentSchema = z
  .object({
    kind: z.literal("spatial-hotspot"),
    gradingMode: z.enum(["partial-credit", "all-or-nothing"]),
    correctHotspotIds: z.array(EmbeddedDataIdSchema),
    feedbackByHotspotId: z
      .record(EmbeddedDataRecordKeySchema, AssessmentFeedbackContentSchema)
      .default({}),
    missFeedback: AssessmentFeedbackContentSchema.optional(),
    summaryFeedback: AssessmentFeedbackContentSchema.nullable().optional(),
  })
  .strict();
export type SpatialHotspotAssessment = z.infer<typeof SpatialHotspotAssessmentSchema>;

const AssessmentAnswerKeyValueSchema = z.discriminatedUnion("kind", [
  SingleSelectAssessmentSchema,
  MultiSelectAssessmentSchema,
  SequenceAssessmentSchema,
  MatchAssessmentSchema,
  ClassifyAssessmentSchema,
  FillBlanksAssessmentSchema,
  SpatialHotspotAssessmentSchema,
]);
export const AssessmentAnswerKeySchema: z.ZodType<
  StructuralAssessmentIds<z.infer<typeof AssessmentAnswerKeyValueSchema>>,
  z.ZodTypeDef,
  z.input<typeof AssessmentAnswerKeyValueSchema>
> = AssessmentAnswerKeyValueSchema;
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
    points: z.number().int().nonnegative(),
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
    targetId: EmbeddedNodeIdSchema,
    blockId: EmbeddedNodeIdSchema,
    blockType: NonBlankStringSchema,
    settings: AssessmentTargetSettingsSchema,
  })
  .strict();

const AssessmentTargetContractVariantSchema = z.union([
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

function addDuplicateIdentityIssue(
  ids: readonly string[],
  context: z.RefinementCtx,
  path: (string | number)[],
  label: string,
): void {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `${label} must be unique`,
    });
  }
}

function addDanglingReferenceIssues(
  ownerIds: ReadonlySet<string>,
  references: readonly string[],
  context: z.RefinementCtx,
  path: (string | number)[],
  label: string,
): void {
  if (references.some((reference) => !ownerIds.has(reference))) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: `${label} must reference an interaction owner`,
    });
  }
}

const AssessmentTargetContractValueSchema = AssessmentTargetContractVariantSchema.superRefine(
  (target, context) => {
    switch (target.interaction.kind) {
      case "single-select": {
        if (target.assessment.kind !== "single-select") return;
        const optionIds = target.interaction.options.map((option) => option.id);
        const owners = new Set<string>(optionIds);
        addDuplicateIdentityIssue(optionIds, context, ["interaction", "options"], "Option IDs");
        addDanglingReferenceIssues(
          owners,
          target.assessment.correctOptionId === null ? [] : [target.assessment.correctOptionId],
          context,
          ["assessment", "correctOptionId"],
          "Correct option",
        );
        addDanglingReferenceIssues(
          owners,
          Object.keys(target.assessment.feedbackByOptionId),
          context,
          ["assessment", "feedbackByOptionId"],
          "Option feedback keys",
        );
        break;
      }
      case "multi-select": {
        if (target.assessment.kind !== "multi-select") return;
        const optionIds = target.interaction.options.map((option) => option.id);
        const owners = new Set<string>(optionIds);
        addDuplicateIdentityIssue(optionIds, context, ["interaction", "options"], "Option IDs");
        addDuplicateIdentityIssue(
          target.assessment.correctOptionIds,
          context,
          ["assessment", "correctOptionIds"],
          "Correct option IDs",
        );
        addDanglingReferenceIssues(
          owners,
          target.assessment.correctOptionIds,
          context,
          ["assessment", "correctOptionIds"],
          "Correct option IDs",
        );
        addDanglingReferenceIssues(
          owners,
          Object.keys(target.assessment.feedbackByOptionId),
          context,
          ["assessment", "feedbackByOptionId"],
          "Option feedback keys",
        );
        break;
      }
      case "sequence": {
        if (target.assessment.kind !== "sequence") return;
        const itemIds = target.interaction.items.map((item) => item.id);
        const owners = new Set<string>(itemIds);
        addDuplicateIdentityIssue(itemIds, context, ["interaction", "items"], "Item IDs");
        addDuplicateIdentityIssue(
          target.assessment.correctOrder,
          context,
          ["assessment", "correctOrder"],
          "Correct-order item IDs",
        );
        addDanglingReferenceIssues(
          owners,
          target.assessment.correctOrder,
          context,
          ["assessment", "correctOrder"],
          "Correct-order item IDs",
        );
        addDanglingReferenceIssues(
          owners,
          Object.keys(target.assessment.feedbackByItemId),
          context,
          ["assessment", "feedbackByItemId"],
          "Item feedback keys",
        );
        break;
      }
      case "match": {
        if (target.assessment.kind !== "match") return;
        const itemIds = target.interaction.items.map((item) => item.id);
        const targetIds = target.interaction.targets.map((item) => item.id);
        const itemOwners = new Set<string>(itemIds);
        const targetOwners = new Set<string>(targetIds);
        const correctItemIds = target.assessment.correctPairs.map((pair) => pair.itemId);
        const correctTargetIds = target.assessment.correctPairs.map((pair) => pair.targetId);
        addDuplicateIdentityIssue(itemIds, context, ["interaction", "items"], "Item IDs");
        addDuplicateIdentityIssue(targetIds, context, ["interaction", "targets"], "Target IDs");
        addDuplicateIdentityIssue(
          correctItemIds,
          context,
          ["assessment", "correctPairs"],
          "Correct-pair item IDs",
        );
        addDuplicateIdentityIssue(
          correctTargetIds,
          context,
          ["assessment", "correctPairs"],
          "Correct-pair target IDs",
        );
        addDanglingReferenceIssues(
          itemOwners,
          correctItemIds,
          context,
          ["assessment", "correctPairs"],
          "Correct-pair item IDs",
        );
        addDanglingReferenceIssues(
          targetOwners,
          correctTargetIds,
          context,
          ["assessment", "correctPairs"],
          "Correct-pair target IDs",
        );
        addDanglingReferenceIssues(
          itemOwners,
          Object.keys(target.assessment.feedbackByItemId),
          context,
          ["assessment", "feedbackByItemId"],
          "Item feedback keys",
        );
        break;
      }
      case "classify": {
        if (target.assessment.kind !== "classify") return;
        const itemIds = target.interaction.items.map((item) => item.id);
        const categoryIds = target.interaction.categories.map((category) => category.id);
        const itemOwners = new Set<string>(itemIds);
        const categoryOwners = new Set<string>(categoryIds);
        const placedItemIds = target.assessment.correctPlacements.map(
          (placement) => placement.itemId,
        );
        const placedCategoryIds = target.assessment.correctPlacements.map(
          (placement) => placement.categoryId,
        );
        addDuplicateIdentityIssue(itemIds, context, ["interaction", "items"], "Item IDs");
        addDuplicateIdentityIssue(
          categoryIds,
          context,
          ["interaction", "categories"],
          "Category IDs",
        );
        addDuplicateIdentityIssue(
          placedItemIds,
          context,
          ["assessment", "correctPlacements"],
          "Placement item IDs",
        );
        addDanglingReferenceIssues(
          itemOwners,
          placedItemIds,
          context,
          ["assessment", "correctPlacements"],
          "Placement item IDs",
        );
        addDanglingReferenceIssues(
          categoryOwners,
          placedCategoryIds,
          context,
          ["assessment", "correctPlacements"],
          "Placement category IDs",
        );
        addDanglingReferenceIssues(
          itemOwners,
          Object.keys(target.assessment.feedbackByItemId),
          context,
          ["assessment", "feedbackByItemId"],
          "Item feedback keys",
        );
        break;
      }
      case "fill-blanks": {
        if (target.assessment.kind !== "fill-blanks") return;
        const blankIds = target.interaction.blanks.map((blank) => blank.id);
        const owners = new Set<string>(blankIds);
        const answerBlankIds = target.assessment.blanks.map((blank) => blank.blankId);
        addDuplicateIdentityIssue(blankIds, context, ["interaction", "blanks"], "Blank IDs");
        addDuplicateIdentityIssue(
          answerBlankIds,
          context,
          ["assessment", "blanks"],
          "Answer blank IDs",
        );
        addDanglingReferenceIssues(
          owners,
          answerBlankIds,
          context,
          ["assessment", "blanks"],
          "Answer blank IDs",
        );
        addDanglingReferenceIssues(
          owners,
          Object.keys(target.assessment.feedbackByBlankId),
          context,
          ["assessment", "feedbackByBlankId"],
          "Blank feedback keys",
        );
        break;
      }
      case "spatial-hotspot": {
        if (target.assessment.kind !== "spatial-hotspot") return;
        const hotspotIds = target.interaction.hotspots.map((hotspot) => hotspot.id);
        const owners = new Set<string>(hotspotIds);
        addDuplicateIdentityIssue(hotspotIds, context, ["interaction", "hotspots"], "Hotspot IDs");
        addDuplicateIdentityIssue(
          target.assessment.correctHotspotIds,
          context,
          ["assessment", "correctHotspotIds"],
          "Correct hotspot IDs",
        );
        addDanglingReferenceIssues(
          owners,
          target.assessment.correctHotspotIds,
          context,
          ["assessment", "correctHotspotIds"],
          "Correct hotspot IDs",
        );
        addDanglingReferenceIssues(
          owners,
          Object.keys(target.assessment.feedbackByHotspotId),
          context,
          ["assessment", "feedbackByHotspotId"],
          "Hotspot feedback keys",
        );
        break;
      }
    }
  },
);
export const AssessmentTargetContractSchema: z.ZodType<
  StructuralAssessmentIds<z.infer<typeof AssessmentTargetContractValueSchema>>,
  z.ZodTypeDef,
  z.input<typeof AssessmentTargetContractValueSchema>
> = AssessmentTargetContractValueSchema;
export type AssessmentTargetContract = z.infer<typeof AssessmentTargetContractSchema>;

export const QuizReviewTimingSchema = z.enum(["after_quiz", "after_each_answer"]);
export type QuizReviewTiming = z.infer<typeof QuizReviewTimingSchema>;

export const QuizReviewDetailSchema = z.enum(["none", "result_only", "full_review"]);
export type QuizReviewDetail = z.infer<typeof QuizReviewDetailSchema>;

export const QuizAttemptsPerQuestionSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type QuizAttemptsPerQuestion = z.infer<typeof QuizAttemptsPerQuestionSchema>;

export const QuizPassingScoreSchema = z.number().finite().min(0).max(1).nullable();
export type QuizPassingScore = z.infer<typeof QuizPassingScoreSchema>;

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
    passingScore: QuizPassingScoreSchema,
    timer: QuizTimerSettingsSchema,
  })
  .strict();
export type QuizAssessmentSettings = z.infer<typeof QuizAssessmentSettingsSchema>;

const AssessmentGroupContractValueSchema = z
  .object({
    schemaVersion: z.literal(SCAFFOLD_ASSESSMENT_CONTRACT_VERSION),
    kind: z.literal("quiz"),
    groupId: EmbeddedNodeIdSchema,
    targetIds: z
      .array(EmbeddedNodeIdSchema)
      .min(1)
      .refine((targetIds) => new Set(targetIds).size === targetIds.length, {
        message: "Target IDs must be unique",
      }),
    settings: QuizAssessmentSettingsSchema,
  })
  .strict();
export const AssessmentGroupContractSchema: z.ZodType<
  StructuralAssessmentIds<z.infer<typeof AssessmentGroupContractValueSchema>>,
  z.ZodTypeDef,
  z.input<typeof AssessmentGroupContractValueSchema>
> = AssessmentGroupContractValueSchema;
export type AssessmentGroupContract = z.infer<typeof AssessmentGroupContractSchema>;

export const SingleSelectResponseSchema = z
  .object({
    kind: z.literal("single-select"),
    optionId: EmbeddedNodeIdSchema.nullable(),
  })
  .strict();
export type SingleSelectResponse = z.infer<typeof SingleSelectResponseSchema>;

export const MultiSelectResponseSchema = z
  .object({
    kind: z.literal("multi-select"),
    optionIds: z.array(EmbeddedNodeIdSchema),
  })
  .strict();
export type MultiSelectResponse = z.infer<typeof MultiSelectResponseSchema>;

export const SequenceResponseSchema = z
  .object({
    kind: z.literal("sequence"),
    orderedItemIds: z.array(EmbeddedNodeIdSchema),
  })
  .strict();
export type SequenceResponse = z.infer<typeof SequenceResponseSchema>;

export const MatchResponseSchema = z
  .object({
    kind: z.literal("match"),
    pairs: z.array(
      z
        .object({
          itemId: EmbeddedNodeIdSchema,
          targetId: EmbeddedNodeIdSchema,
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
          itemId: EmbeddedNodeIdSchema,
          categoryId: EmbeddedNodeIdSchema,
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
          blankId: EmbeddedNodeIdSchema,
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
          hotspotId: EmbeddedDataIdSchema.nullable(),
          x: z.number().finite(),
          y: z.number().finite(),
        })
        .strict(),
    ),
  })
  .strict();
export type SpatialHotspotResponse = z.infer<typeof SpatialHotspotResponseSchema>;

const AssessmentResponseValueContractSchema = z.discriminatedUnion("kind", [
  SingleSelectResponseSchema,
  MultiSelectResponseSchema,
  SequenceResponseSchema,
  MatchResponseSchema,
  ClassifyResponseSchema,
  FillBlanksResponseSchema,
  SpatialHotspotResponseSchema,
]);
export const AssessmentResponseValueSchema: z.ZodType<
  StructuralAssessmentIds<z.infer<typeof AssessmentResponseValueContractSchema>>,
  z.ZodTypeDef,
  z.input<typeof AssessmentResponseValueContractSchema>
> = AssessmentResponseValueContractSchema;
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

const AssessmentItemReferenceIdSchema = z.union([EmbeddedNodeIdSchema, EmbeddedDataIdSchema]);
const AssessmentItemReferenceRecordKeySchema: z.ZodType<string> = AssessmentItemReferenceIdSchema;

const ScaledScoreSchema = z.number().finite().min(0).max(1);
const ScoreIntegerSchema = z
  .number()
  .finite()
  .int()
  .min(Number.MIN_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER);

export const ScoreSchema = z.union([
  z.object({ scaled: ScaledScoreSchema }).strict(),
  z
    .object({
      scaled: ScaledScoreSchema,
      raw: ScoreIntegerSchema,
      min: ScoreIntegerSchema,
      max: ScoreIntegerSchema,
    })
    .strict()
    .superRefine((score, context) => {
      if (score.min >= score.max) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["max"],
          message: "Score max must be greater than min",
        });
      }
      if (score.raw < score.min || score.raw > score.max) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["raw"],
          message: "Score raw must be within min and max",
        });
      }
    }),
]);
export type Score = z.infer<typeof ScoreSchema>;

export const AssessmentResultSchema = z
  .object({
    isCorrect: z.boolean(),
    score: ScoreSchema,
    feedback: AssessmentFeedbackContentSchema.nullable(),
    items: z.record(AssessmentItemReferenceRecordKeySchema, AssessmentItemDetailSchema),
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

export const QuizSuccessStatusSchema = z.enum(["passed", "failed"]).nullable();
export type QuizSuccessStatus = z.infer<typeof QuizSuccessStatusSchema>;

const QuizAttemptStateBaseSchema = z.object({
  attemptId: NonBlankStringSchema,
  groupId: NonBlankStringSchema.regex(/^artifact:.+\/group:.+$/, {
    message: "Group ID must be a derived runtime assessment scope",
  }),
  currentTargetId: EmbeddedNodeIdSchema.nullable(),
  submittedTargetIds: z
    .array(EmbeddedNodeIdSchema)
    .refine((targetIds) => new Set(targetIds).size === targetIds.length, {
      message: "Submitted target IDs must be unique",
    }),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  resultsByTargetId: z.record(EmbeddedNodeRecordKeySchema, AssessmentResultSchema),
  answerReviewAuthorized: z.boolean(),
});

const QuizAttemptStateValueSchema = z.union([
  QuizAttemptStateBaseSchema.extend({
    status: z.literal("in_progress"),
    score: z.null(),
    successStatus: z.null(),
  }).strict(),
  QuizAttemptStateBaseSchema.extend({
    status: z.literal("completed"),
    score: ScoreSchema,
    successStatus: QuizSuccessStatusSchema,
  }).strict(),
  QuizAttemptStateBaseSchema.extend({
    status: z.literal("expired"),
    score: ScoreSchema,
    successStatus: QuizSuccessStatusSchema,
  }).strict(),
]);
export const QuizAttemptStateSchema: z.ZodType<
  StructuralAssessmentIds<z.infer<typeof QuizAttemptStateValueSchema>>,
  z.ZodTypeDef,
  z.input<typeof QuizAttemptStateValueSchema>
> = QuizAttemptStateValueSchema;
export type QuizAttemptState = z.infer<typeof QuizAttemptStateSchema>;

const QuizAttemptSnapshotBaseSchema = QuizAttemptStateBaseSchema.omit({ groupId: true });

const QuizAttemptSnapshotValueSchema = z.union([
  QuizAttemptSnapshotBaseSchema.extend({
    status: z.literal("in_progress"),
    score: z.null(),
    successStatus: z.null(),
  }).strict(),
  QuizAttemptSnapshotBaseSchema.extend({
    status: z.literal("completed"),
    score: ScoreSchema,
    successStatus: QuizSuccessStatusSchema,
  }).strict(),
  QuizAttemptSnapshotBaseSchema.extend({
    status: z.literal("expired"),
    score: ScoreSchema,
    successStatus: QuizSuccessStatusSchema,
  }).strict(),
]);
export const QuizAttemptSnapshotSchema: z.ZodType<
  StructuralAssessmentIds<z.infer<typeof QuizAttemptSnapshotValueSchema>>,
  z.ZodTypeDef,
  z.input<typeof QuizAttemptSnapshotValueSchema>
> = QuizAttemptSnapshotValueSchema;
export type QuizAttemptSnapshot = z.infer<typeof QuizAttemptSnapshotSchema>;

const AssessmentProblemSnapshotBaseSchema = z.object({
  response: AssessmentResponseValueSchema.nullable(),
  attemptNumber: z.number().int().nonnegative(),
  hintsShown: z.number().int().nonnegative(),
  checkResult: AssessmentResultSchema.nullable(),
});

const AssessmentProblemSnapshotValueSchema = z.union([
  AssessmentProblemSnapshotBaseSchema.extend({
    submitted: z.literal(false),
    submissionResult: z.null(),
  }).strict(),
  AssessmentProblemSnapshotBaseSchema.extend({
    submitted: z.literal(true),
    submissionResult: AssessmentResultSchema,
  }).strict(),
]);
export const AssessmentProblemSnapshotSchema: z.ZodType<
  StructuralAssessmentIds<z.infer<typeof AssessmentProblemSnapshotValueSchema>>,
  z.ZodTypeDef,
  z.input<typeof AssessmentProblemSnapshotValueSchema>
> = AssessmentProblemSnapshotValueSchema;
export type AssessmentProblemSnapshot = z.infer<typeof AssessmentProblemSnapshotSchema>;

const AssessmentLearnerSnapshotValueSchema = z
  .object({
    snapshotVersion: z.literal(SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION),
    artifactId: NonBlankStringSchema,
    problems: z.record(EmbeddedNodeRecordKeySchema, AssessmentProblemSnapshotSchema),
    quizzes: z.record(EmbeddedNodeRecordKeySchema, QuizAttemptSnapshotSchema),
  })
  .strict();
export const AssessmentLearnerSnapshotSchema: z.ZodType<
  StructuralAssessmentIds<z.infer<typeof AssessmentLearnerSnapshotValueSchema>>,
  z.ZodTypeDef,
  z.input<typeof AssessmentLearnerSnapshotValueSchema>
> = AssessmentLearnerSnapshotValueSchema;
export type AssessmentLearnerSnapshot = z.infer<typeof AssessmentLearnerSnapshotSchema>;
