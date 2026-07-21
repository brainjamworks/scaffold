import { describe, expect, it } from "vite-plus/test";

import {
  CategorisePrivateAssessmentSchema,
  CategoriseSettingsSchema,
  type CategorisePrivateAssessment,
  type CategoriseSettings,
} from "./index";

const richFeedback = (text: string) => ({
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  },
});

describe("categorise authored contract", () => {
  it("preserves settings and private assessment defaults", () => {
    expect(CategoriseSettingsSchema.parse({})).toEqual({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    expect(CategorisePrivateAssessmentSchema.parse({})).toEqual({
      feedbackByItemId: {},
      summaryFeedback: null,
    });
  });

  it("preserves the canonical serialized shapes", () => {
    const settings: CategoriseSettings = {
      feedbackMode: "immediate",
      isGraded: false,
      showAnswer: false,
      legend: "Sort the animals",
      points: 4,
      maxAttempts: 2,
    };
    const assessment: CategorisePrivateAssessment = {
      feedbackByItemId: { eagle: richFeedback("Eagles are birds.") },
      summaryFeedback: richFeedback("Review every category."),
    };

    expect(CategoriseSettingsSchema.parse(settings)).toEqual(settings);
    expect(CategorisePrivateAssessmentSchema.parse(assessment)).toEqual(assessment);
  });

  it("keeps settings strict and private assessment unknown-key stripping", () => {
    expect(CategoriseSettingsSchema.safeParse({ editorOnly: true }).success).toBe(false);
    expect(CategorisePrivateAssessmentSchema.parse({ editorOnly: true })).not.toHaveProperty(
      "editorOnly",
    );
  });

  it.each([{ points: -1 }, { points: 1.5 }, { maxAttempts: 0 }, { feedbackMode: "after_review" }])(
    "rejects invalid settings %#",
    (value) => {
      expect(CategoriseSettingsSchema.safeParse(value).success).toBe(false);
    },
  );
});
