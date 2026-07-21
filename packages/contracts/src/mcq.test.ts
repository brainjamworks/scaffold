import { describe, expect, it } from "vite-plus/test";

import {
  McqPrivateAssessmentSchema,
  McqSettingsSchema,
  type McqPrivateAssessment,
  type McqSettings,
} from "./index";

const richFeedback = (text: string) => ({
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  },
});

describe("mcq authored contract", () => {
  it("preserves settings and private assessment defaults", () => {
    expect(McqSettingsSchema.parse({})).toEqual({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    expect(McqPrivateAssessmentSchema.parse({})).toEqual({
      correctOptionId: null,
      feedbackByOptionId: {},
      summaryFeedback: null,
    });
  });

  it("preserves the canonical serialized shapes", () => {
    const settings: McqSettings = {
      feedbackMode: "immediate",
      isGraded: false,
      showAnswer: false,
      legend: "Choose one answer",
      points: 2,
      maxAttempts: 1,
    };
    const assessment: McqPrivateAssessment = {
      correctOptionId: "answer-a",
      feedbackByOptionId: { "answer-a": richFeedback("That is correct.") },
      summaryFeedback: richFeedback("Review the choices."),
    };

    expect(McqSettingsSchema.parse(settings)).toEqual(settings);
    expect(McqPrivateAssessmentSchema.parse(assessment)).toEqual(assessment);
  });

  it("keeps settings strict and private assessment unknown-key stripping", () => {
    expect(McqSettingsSchema.safeParse({ editorOnly: true }).success).toBe(false);
    expect(McqPrivateAssessmentSchema.parse({ editorOnly: true })).not.toHaveProperty("editorOnly");
  });

  it.each([{ points: -1 }, { points: 1.5 }, { maxAttempts: 0 }, { correctOptionId: 42 }])(
    "rejects invalid authored values %#",
    (value) => {
      const schema = "correctOptionId" in value ? McqPrivateAssessmentSchema : McqSettingsSchema;
      expect(schema.safeParse(value).success).toBe(false);
    },
  );
});
