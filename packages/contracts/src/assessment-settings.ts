import { z } from "zod";

export const AssessmentCommonSettingsSchema = z
  .object({
    feedbackMode: z.enum(["immediate", "on_submit"]).default("on_submit"),
    isGraded: z.boolean().default(true),
    showAnswer: z.boolean().default(true),
  })
  .strict();
export type AssessmentCommonSettings = z.infer<typeof AssessmentCommonSettingsSchema>;
