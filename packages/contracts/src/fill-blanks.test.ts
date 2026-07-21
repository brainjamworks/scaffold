import { describe, expect, it } from "vite-plus/test";

import {
  FillBlankAttrsSchema,
  FillBlankPrivateAssessmentEntrySchema,
  FillBlanksPrivateAssessmentSchema,
  FillBlanksSettingsSchema,
  type FillBlankAttrs,
  type FillBlankPrivateAssessmentEntry,
  type FillBlanksPrivateAssessment,
  type FillBlanksSettings,
} from "./fill-blanks";

function normalizedIssues(result: ReturnType<typeof FillBlanksSettingsSchema.safeParse>) {
  if (result.success) return [];
  return result.error.issues.map(({ code, path, message }) => ({ code, path, message }));
}

const richFeedback = {
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    attrs: { language: "en" },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Try the singular form", marks: [{ type: "bold" }] }],
        editorOnly: "preserved",
      },
    ],
  },
};

describe("fill-blanks authored persisted contracts", () => {
  it("preserves exact settings, blank, entry, and private defaults", () => {
    const settings: FillBlanksSettings = FillBlanksSettingsSchema.parse({});
    const blank: FillBlankAttrs = FillBlankAttrsSchema.parse({ id: "blank-1" });
    const entry: FillBlankPrivateAssessmentEntry = FillBlankPrivateAssessmentEntrySchema.parse({});
    const assessment: FillBlanksPrivateAssessment = FillBlanksPrivateAssessmentSchema.parse({});

    expect(settings).toEqual({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    expect(blank).toEqual({ id: "blank-1", placeholder: "" });
    expect(entry).toEqual({
      acceptedAnswers: [""],
      feedback: null,
      caseSensitive: false,
      trimWhitespace: true,
    });
    expect(assessment).toEqual({ blanksById: {}, summaryFeedback: null });
  });

  it("preserves authored values, rich feedback, and unknown-key stripping", () => {
    expect(
      FillBlankAttrsSchema.parse({ id: "", placeholder: "  noun  ", editorSelection: true }),
    ).toEqual({ id: "", placeholder: "  noun  " });
    expect(
      FillBlanksPrivateAssessmentSchema.parse({
        blanksById: {
          "blank-1": {
            acceptedAnswers: [" Cat ", "feline"],
            feedback: richFeedback,
            caseSensitive: true,
            trimWhitespace: false,
            editorOnly: true,
          },
        },
        summaryFeedback: richFeedback,
        editorOnly: true,
      }),
    ).toEqual({
      blanksById: {
        "blank-1": {
          acceptedAnswers: [" Cat ", "feline"],
          feedback: richFeedback,
          caseSensitive: true,
          trimWhitespace: false,
        },
      },
      summaryFeedback: richFeedback,
    });
  });

  it("preserves strict settings and normalized numeric issues", () => {
    expect(normalizedIssues(FillBlanksSettingsSchema.safeParse({ editorOnly: true }))).toEqual([
      {
        code: "unrecognized_keys",
        path: [],
        message: "Unrecognized key(s) in object: 'editorOnly'",
      },
    ]);
    expect(
      normalizedIssues(FillBlanksSettingsSchema.safeParse({ points: -1, maxAttempts: 0 })),
    ).toEqual([
      {
        code: "too_small",
        path: ["points"],
        message: "Number must be greater than or equal to 0",
      },
      {
        code: "too_small",
        path: ["maxAttempts"],
        message: "Number must be greater than 0",
      },
    ]);
  });
});
