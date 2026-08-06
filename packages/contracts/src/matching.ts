import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { AssessmentCommonSettingsSchema } from "./assessment-settings";

/** Block settings configuration. */
export const MatchingSettingsSchema = AssessmentCommonSettingsSchema.extend({
  legend: z.string().optional(),
  points: z.number().int().nonnegative().default(1),
  maxAttempts: z.number().int().positive().nullable().default(null),
});
export type MatchingSettings = z.infer<typeof MatchingSettingsSchema>;

export const MatchingPrivateAssessmentSchema = z.object({
  feedbackByItemId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
  summaryFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
});
export type MatchingPrivateAssessment = z.infer<typeof MatchingPrivateAssessmentSchema>;
