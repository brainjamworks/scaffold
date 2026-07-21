import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { AssessmentCommonSettingsSchema } from "./assessment-settings";

/**
 * Multiselect block-level SETTINGS attrs. Author config edited via
 * `ConfigurationSettingsSheet`. `maxSelect` caps the number of choices a
 * student may pick at runtime (the choice hook enforces it).
 * `null` = no cap.
 */
export const MultiselectSettingsSchema = AssessmentCommonSettingsSchema.extend({
  legend: z.string().optional(),
  points: z.number().int().nonnegative().default(1),
  maxAttempts: z.number().int().positive().nullable().default(null),
  maxSelect: z.number().int().positive().nullable().default(null),
});
export type MultiselectSettings = z.infer<typeof MultiselectSettingsSchema>;

export const MultiselectPrivateAssessmentSchema = z.object({
  correctOptionIds: z.array(z.string()).default([]),
  feedbackByOptionId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
  summaryFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
});
export type MultiselectPrivateAssessment = z.infer<typeof MultiselectPrivateAssessmentSchema>;
