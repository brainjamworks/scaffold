import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { AssessmentCommonSettingsSchema } from "./assessment-settings";

/** Block settings configuration. */
export const CategoriseSettingsSchema = AssessmentCommonSettingsSchema.extend({
  legend: z.string().optional(),
  points: z.number().int().nonnegative().default(1),
  maxAttempts: z.number().int().positive().nullable().default(null),
});
export type CategoriseSettings = z.infer<typeof CategoriseSettingsSchema>;

export const CategorisePrivateAssessmentSchema = z.object({
  feedbackByItemId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
  summaryFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
});
export type CategorisePrivateAssessment = z.infer<typeof CategorisePrivateAssessmentSchema>;
