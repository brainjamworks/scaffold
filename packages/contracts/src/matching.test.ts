import { describe, expect, it } from "vite-plus/test";

import {
  MatchingPrivateAssessmentSchema,
  MatchingSettingsSchema,
  type MatchingPrivateAssessment,
  type MatchingSettings,
} from "./index";

const richFeedback = (text: string) => ({
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  },
});

describe("matching authored contract", () => {
  it("preserves settings and private assessment defaults", () => {
    expect(MatchingSettingsSchema.parse({})).toEqual({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    expect(MatchingPrivateAssessmentSchema.parse({})).toEqual({
      correctPairs: [],
      feedbackByItemId: {},
      summaryFeedback: null,
    });
  });

  it("preserves the canonical serialized shapes", () => {
    const settings: MatchingSettings = {
      feedbackMode: "immediate",
      isGraded: false,
      showAnswer: false,
      legend: "Match the capitals",
      points: 5,
      maxAttempts: 3,
    };
    const assessment: MatchingPrivateAssessment = {
      correctPairs: [{ itemId: "france", targetId: "paris" }],
      feedbackByItemId: { france: richFeedback("Paris is correct.") },
      summaryFeedback: richFeedback("Review the pairs."),
    };

    expect(MatchingSettingsSchema.parse(settings)).toEqual(settings);
    expect(MatchingPrivateAssessmentSchema.parse(assessment)).toEqual(assessment);
  });

  it("keeps settings strict and private assessment unknown-key stripping", () => {
    expect(MatchingSettingsSchema.safeParse({ editorOnly: true }).success).toBe(false);
    expect(MatchingPrivateAssessmentSchema.parse({ editorOnly: true })).not.toHaveProperty(
      "editorOnly",
    );
  });

  it.each([
    { points: -1 },
    { maxAttempts: 0 },
    { correctPairs: [{ itemId: "item" }] },
    { feedbackByItemId: { item: { kind: "plain-text" } } },
  ])("rejects invalid authored values %#", (value) => {
    const schema =
      "correctPairs" in value || "feedbackByItemId" in value
        ? MatchingPrivateAssessmentSchema
        : MatchingSettingsSchema;
    expect(schema.safeParse(value).success).toBe(false);
  });
});
