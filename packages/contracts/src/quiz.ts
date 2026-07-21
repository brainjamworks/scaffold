import { z } from "zod";

import {
  QuizAttemptsPerQuestionSchema,
  QuizAssessmentSettingsSchema,
  QuizReviewDetailSchema,
  QuizReviewTimingSchema,
  QuizTimerSettingsSchema,
} from "./assessment";

export const QuizSettingsSchema = QuizAssessmentSettingsSchema.extend({
  allowBacktracking: z.boolean().default(true),
  reviewTiming: QuizReviewTimingSchema.default("after_quiz"),
  reviewDetail: QuizReviewDetailSchema.default("result_only"),
  attemptsPerQuestion: QuizAttemptsPerQuestionSchema.default(1),
  isGraded: z.boolean().default(true),
  timer: QuizTimerSettingsSchema.default({
    enabled: false,
    durationSeconds: 0,
  }),
});
export type QuizSettings = z.infer<typeof QuizSettingsSchema>;
