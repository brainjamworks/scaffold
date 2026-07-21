import { z } from "zod";

import { AssessmentFeedbackContentSchema } from "./assessment-feedback";
import { AssessmentCommonSettingsSchema } from "./assessment-settings";

export const FillBlanksSettingsSchema = AssessmentCommonSettingsSchema.extend({
  legend: z.string().optional(),
  points: z.number().int().nonnegative().default(1),
  maxAttempts: z.number().int().positive().nullable().default(null),
});
export type FillBlanksSettings = z.infer<typeof FillBlanksSettingsSchema>;

export const FillBlankAttrsSchema = z.object({
  id: z.string(),
  placeholder: z.string().default(""),
});
export type FillBlankAttrs = z.infer<typeof FillBlankAttrsSchema>;

export const FillBlankPrivateAssessmentEntrySchema = z.object({
  acceptedAnswers: z.array(z.string()).default([""]),
  feedback: AssessmentFeedbackContentSchema.nullable().default(null),
  caseSensitive: z.boolean().default(false),
  trimWhitespace: z.boolean().default(true),
});
export type FillBlankPrivateAssessmentEntry = z.infer<typeof FillBlankPrivateAssessmentEntrySchema>;

export const FillBlanksPrivateAssessmentSchema = z.object({
  blanksById: z.record(z.string(), FillBlankPrivateAssessmentEntrySchema).default({}),
  summaryFeedback: AssessmentFeedbackContentSchema.nullable().default(null),
});
export type FillBlanksPrivateAssessment = z.infer<typeof FillBlanksPrivateAssessmentSchema>;
