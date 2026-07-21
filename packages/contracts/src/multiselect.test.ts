import { describe, expect, it } from "vite-plus/test";

import {
  MultiselectPrivateAssessmentSchema,
  MultiselectSettingsSchema,
  type MultiselectPrivateAssessment,
  type MultiselectSettings,
} from "./index";

const richFeedback = (text: string) => ({
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  },
});

describe("multiselect authored contract", () => {
  it("preserves settings and private assessment defaults", () => {
    expect(MultiselectSettingsSchema.parse({})).toEqual({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
      maxSelect: null,
    });
    expect(MultiselectPrivateAssessmentSchema.parse({})).toEqual({
      correctOptionIds: [],
      feedbackByOptionId: {},
      summaryFeedback: null,
    });
  });

  it("preserves the canonical serialized shapes", () => {
    const settings: MultiselectSettings = {
      feedbackMode: "immediate",
      isGraded: false,
      showAnswer: false,
      legend: "Choose every correct answer",
      points: 6,
      maxAttempts: 2,
      maxSelect: 3,
    };
    const assessment: MultiselectPrivateAssessment = {
      correctOptionIds: ["answer-a", "answer-c"],
      feedbackByOptionId: { "answer-a": richFeedback("This answer is correct.") },
      summaryFeedback: richFeedback("Review each option."),
    };

    expect(MultiselectSettingsSchema.parse(settings)).toEqual(settings);
    expect(MultiselectPrivateAssessmentSchema.parse(assessment)).toEqual(assessment);
  });

  it("keeps settings strict and private assessment unknown-key stripping", () => {
    expect(MultiselectSettingsSchema.safeParse({ editorOnly: true }).success).toBe(false);
    expect(MultiselectPrivateAssessmentSchema.parse({ editorOnly: true })).not.toHaveProperty(
      "editorOnly",
    );
  });

  it.each([{ points: -1 }, { maxAttempts: 0 }, { maxSelect: 0 }, { correctOptionIds: [1] }])(
    "rejects invalid authored values %#",
    (value) => {
      const schema =
        "correctOptionIds" in value
          ? MultiselectPrivateAssessmentSchema
          : MultiselectSettingsSchema;
      expect(schema.safeParse(value).success).toBe(false);
    },
  );
});
