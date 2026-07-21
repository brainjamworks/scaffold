import { describe, expect, it } from "vite-plus/test";

import {
  SequencingPrivateAssessmentSchema,
  SequencingSettingsSchema,
  type SequencingPrivateAssessment,
  type SequencingSettings,
} from "./index";

const richFeedback = (text: string) => ({
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  },
});

describe("sequencing authored contract", () => {
  it("preserves settings and private assessment defaults", () => {
    expect(SequencingSettingsSchema.parse({})).toEqual({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    expect(SequencingPrivateAssessmentSchema.parse({})).toEqual({
      correctOrder: [],
      feedbackByItemId: {},
      summaryFeedback: null,
    });
  });

  it("preserves the canonical serialized shapes", () => {
    const settings: SequencingSettings = {
      feedbackMode: "immediate",
      isGraded: false,
      showAnswer: false,
      legend: "Order the steps",
      points: 3,
      maxAttempts: 2,
    };
    const assessment: SequencingPrivateAssessment = {
      correctOrder: ["first", "second"],
      feedbackByItemId: { first: richFeedback("This is the first step.") },
      summaryFeedback: richFeedback("Review the sequence."),
    };

    expect(SequencingSettingsSchema.parse(settings)).toEqual(settings);
    expect(SequencingPrivateAssessmentSchema.parse(assessment)).toEqual(assessment);
  });

  it("keeps settings strict and private assessment unknown-key stripping", () => {
    expect(SequencingSettingsSchema.safeParse({ editorOnly: true }).success).toBe(false);
    expect(SequencingPrivateAssessmentSchema.parse({ editorOnly: true })).not.toHaveProperty(
      "editorOnly",
    );
  });

  it.each([
    { points: -1 },
    { maxAttempts: 0 },
    { correctOrder: [1] },
    { feedbackByItemId: { first: { kind: "plain-text" } } },
  ])("rejects invalid authored values %#", (value) => {
    const schema =
      "correctOrder" in value || "feedbackByItemId" in value
        ? SequencingPrivateAssessmentSchema
        : SequencingSettingsSchema;
    expect(schema.safeParse(value).success).toBe(false);
  });
});
