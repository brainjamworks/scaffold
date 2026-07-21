import { describe, expect, it } from "vite-plus/test";

import { AssessmentCommonSettingsSchema, type AssessmentCommonSettings } from "./index";

describe("common assessment settings contract", () => {
  it("preserves the canonical serialized settings shape", () => {
    const settings: AssessmentCommonSettings = {
      feedbackMode: "immediate",
      isGraded: false,
      showAnswer: false,
    };

    expect(AssessmentCommonSettingsSchema.parse(settings)).toEqual(settings);
  });

  it("preserves the existing serialized defaults", () => {
    expect(AssessmentCommonSettingsSchema.parse({})).toEqual({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
    });
  });

  it("accepts both authored feedback modes", () => {
    expect(AssessmentCommonSettingsSchema.parse({ feedbackMode: "immediate" }).feedbackMode).toBe(
      "immediate",
    );
    expect(AssessmentCommonSettingsSchema.parse({ feedbackMode: "on_submit" }).feedbackMode).toBe(
      "on_submit",
    );
  });

  it("preserves strict unknown-key rejection", () => {
    expect(
      AssessmentCommonSettingsSchema.safeParse({
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        revealFeedback: true,
      }).success,
    ).toBe(false);
  });

  it("rejects invalid feedback modes and boolean settings", () => {
    expect(AssessmentCommonSettingsSchema.safeParse({ feedbackMode: "after_quiz" }).success).toBe(
      false,
    );
    expect(AssessmentCommonSettingsSchema.safeParse({ isGraded: "yes" }).success).toBe(false);
    expect(AssessmentCommonSettingsSchema.safeParse({ showAnswer: null }).success).toBe(false);
  });
});
