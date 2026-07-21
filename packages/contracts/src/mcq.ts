import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { AssessmentCommonSettingsSchema } from "./assessment-settings";

/**
 * MCQ block-level SETTINGS attrs. Author config edited via the
 * block configuration definition and validated through the settings sheet.
 */
export const McqSettingsSchema = AssessmentCommonSettingsSchema.extend({
  legend: z.string().optional(),
  points: z.number().int().nonnegative().default(1),
  maxAttempts: z.number().int().positive().nullable().default(null),
});
export type McqSettings = z.infer<typeof McqSettingsSchema>;

export const McqPrivateAssessmentSchema = z.object({
  correctOptionId: z.string().nullable().default(null),
  feedbackByOptionId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
  summaryFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
});
export type McqPrivateAssessment = z.infer<typeof McqPrivateAssessmentSchema>;
