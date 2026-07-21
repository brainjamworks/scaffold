import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { AssessmentCommonSettingsSchema } from "./assessment-settings";

/** Sequencing block-level SETTINGS attrs. */
export const SequencingSettingsSchema = AssessmentCommonSettingsSchema.extend({
  legend: z.string().optional(),
  points: z.number().int().nonnegative().default(1),
  maxAttempts: z.number().int().positive().nullable().default(null),
});
export type SequencingSettings = z.infer<typeof SequencingSettingsSchema>;

export const SequencingPrivateAssessmentSchema = z.object({
  correctOrder: z.array(z.string()).default([]),
  feedbackByItemId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
  summaryFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
});
export type SequencingPrivateAssessment = z.infer<typeof SequencingPrivateAssessmentSchema>;
