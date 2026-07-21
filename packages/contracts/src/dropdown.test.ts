import { describe, expect, it } from "vite-plus/test";

import {
  DropdownPrivateAssessmentSchema,
  DropdownSettingsSchema,
  type DropdownPrivateAssessment,
  type DropdownSettings,
} from "./index";

const richFeedback = (text: string) => ({
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  },
});

describe("dropdown authored contract", () => {
  it("preserves settings and private assessment defaults", () => {
    expect(DropdownSettingsSchema.parse({})).toEqual({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      placeholder: "Select...",
      points: 1,
      maxAttempts: null,
    });
    expect(DropdownPrivateAssessmentSchema.parse({})).toEqual({
      correctOptionId: null,
      feedbackByOptionId: {},
      summaryFeedback: null,
    });
  });

  it("preserves the canonical serialized shapes", () => {
    const settings: DropdownSettings = {
      feedbackMode: "immediate",
      isGraded: false,
      showAnswer: false,
      label: "Choose a city",
      placeholder: "Pick one",
      points: 3,
      maxAttempts: 2,
    };
    const assessment: DropdownPrivateAssessment = {
      correctOptionId: "paris",
      feedbackByOptionId: { paris: richFeedback("Paris is correct.") },
      summaryFeedback: richFeedback("Review the options."),
    };

    expect(DropdownSettingsSchema.parse(settings)).toEqual(settings);
    expect(DropdownPrivateAssessmentSchema.parse(assessment)).toEqual(assessment);
  });

  it("keeps settings strict and private assessment unknown-key stripping", () => {
    expect(DropdownSettingsSchema.safeParse({ editorOnly: true }).success).toBe(false);
    expect(DropdownPrivateAssessmentSchema.parse({ editorOnly: true })).not.toHaveProperty(
      "editorOnly",
    );
  });

  it.each([{ points: -1 }, { points: 1.5 }, { maxAttempts: 0 }, { placeholder: 42 }])(
    "rejects invalid settings %#",
    (value) => {
      expect(DropdownSettingsSchema.safeParse(value).success).toBe(false);
    },
  );
});
