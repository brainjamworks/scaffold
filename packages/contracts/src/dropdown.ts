import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { AssessmentCommonSettingsSchema } from "./assessment-settings";

/**
 * Dropdown block-level SETTINGS attrs. `label` is the visible/select
 * accessibility label above the trigger; `placeholder` is shown before
 * the learner chooses an option.
 */
export const DropdownSettingsSchema = AssessmentCommonSettingsSchema.extend({
  label: z.string().optional(),
  placeholder: z.string().default("Select..."),
  points: z.number().int().nonnegative().default(1),
  maxAttempts: z.number().int().positive().nullable().default(null),
});
export type DropdownSettings = z.infer<typeof DropdownSettingsSchema>;

export const DropdownPrivateAssessmentSchema = z.object({
  correctOptionId: z.string().nullable().default(null),
  feedbackByOptionId: z.record(z.string(), AssessmentFeedbackContentSchema).default({}),
  summaryFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
});
export type DropdownPrivateAssessment = z.infer<typeof DropdownPrivateAssessmentSchema>;
