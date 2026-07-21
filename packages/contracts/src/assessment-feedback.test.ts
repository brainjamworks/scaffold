import { describe, expect, it } from "vite-plus/test";

import {
  AssessmentFeedbackContentSchema,
  ScaffoldRichTextDocumentSchema,
  type AssessmentFeedbackContent,
  type ScaffoldRichTextDocument,
  type ScaffoldRichTextMark,
  type ScaffoldRichTextNode,
} from "./index";

describe("assessment feedback contracts", () => {
  it("accepts nested rich-text content while preserving marks, attrs, and extension fields", () => {
    const mark: ScaffoldRichTextMark = {
      type: "link",
      attrs: { href: "https://example.com/feedback", target: "_blank" },
      inclusive: false,
    };
    const text: ScaffoldRichTextNode = {
      type: "text",
      text: "Review the worked example.",
      marks: [mark],
      source: "grader",
    };
    const document: ScaffoldRichTextDocument = {
      type: "doc",
      attrs: { locale: "en-GB" },
      content: [
        {
          type: "blockquote",
          attrs: { variant: "hint" },
          content: [{ type: "paragraph", content: [text] }],
          trackingId: "feedback-1",
        },
      ],
      schemaRevision: 3,
    };
    const feedback: AssessmentFeedbackContent = {
      kind: "rich-text",
      document,
    };

    expect(AssessmentFeedbackContentSchema.parse(feedback)).toEqual(feedback);
  });

  it("rejects invalid feedback and document root kinds", () => {
    expect(
      AssessmentFeedbackContentSchema.safeParse({
        kind: "plain-text",
        document: { type: "doc" },
      }).success,
    ).toBe(false);
    expect(ScaffoldRichTextDocumentSchema.safeParse({ type: "paragraph" }).success).toBe(false);
  });

  it("round-trips serialized feedback without dropping compatible extension data", () => {
    const feedback = {
      kind: "rich-text",
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Correct",
                marks: [{ type: "strong", attrs: { level: 2 }, priority: 100 }],
              },
            ],
            direction: "ltr",
          },
        ],
        sourceVersion: "1.0",
      },
    };

    const parsed = AssessmentFeedbackContentSchema.parse(feedback);
    const reparsed = AssessmentFeedbackContentSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed).toEqual(feedback);
  });
});
