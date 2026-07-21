import { describe, expect, it } from "vite-plus/test";

import {
  QuizAttemptsPerQuestionSchema,
  QuizReviewDetailSchema,
  QuizReviewTimingSchema,
} from "./assessment";
import { QuizSettingsSchema, type QuizSettings } from "./quiz";

function normalizedIssues(result: ReturnType<typeof QuizSettingsSchema.safeParse>) {
  if (result.success) return [];
  return result.error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

describe("quiz authored settings contract", () => {
  it("preserves enum order and exact defaults", () => {
    expect(QuizReviewTimingSchema.options).toEqual(["after_quiz", "after_each_answer"]);
    expect(QuizReviewDetailSchema.options).toEqual(["none", "result_only", "full_review"]);
    expect(QuizAttemptsPerQuestionSchema.options.map((option) => option.value)).toEqual([1, 2, 3]);

    const settings: QuizSettings = QuizSettingsSchema.parse({});

    expect(settings).toEqual({
      allowBacktracking: true,
      reviewTiming: "after_quiz",
      reviewDetail: "result_only",
      attemptsPerQuestion: 1,
      isGraded: true,
      timer: { enabled: false, durationSeconds: 0 },
    });
  });

  it("preserves complete authored settings", () => {
    const settings: QuizSettings = {
      allowBacktracking: false,
      reviewTiming: "after_each_answer",
      reviewDetail: "full_review",
      attemptsPerQuestion: 3,
      isGraded: false,
      timer: { enabled: true, durationSeconds: 900 },
    };

    expect(QuizSettingsSchema.parse(settings)).toEqual(settings);
  });

  it("preserves strict root and timer objects", () => {
    expect(normalizedIssues(QuizSettingsSchema.safeParse({ editorOnly: true }))).toEqual([
      {
        code: "unrecognized_keys",
        path: [],
        message: "Unrecognized key(s) in object: 'editorOnly'",
      },
    ]);
    expect(
      QuizSettingsSchema.safeParse({
        timer: { enabled: false, durationSeconds: 0, editorOnly: true },
      }).success,
    ).toBe(false);
  });

  it("preserves attempts and timer validation", () => {
    expect(QuizSettingsSchema.safeParse({ attemptsPerQuestion: 0 }).success).toBe(false);
    expect(
      QuizSettingsSchema.safeParse({ timer: { enabled: true, durationSeconds: -1 } }).success,
    ).toBe(false);
    expect(QuizSettingsSchema.safeParse({ timer: { enabled: true } }).success).toBe(false);
  });
});
