import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { projectAssessmentDocument } from "@/authoring/publication/document-projection";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "../../built-in-surface-variant-definitions";

describe("slide Fill in Blanks assessment projection", () => {
  it("projects one canonical fill-blanks target from the Surface owner", () => {
    const projection = projectAssessmentDocument(
      { status: "supported", canonicalDocument: courseDocument() },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );

    expect(projection.warnings).toEqual([]);
    expect(projection.targets).toHaveLength(1);
    expect(projection.targets[0]).toMatchObject({
      targetId: "target000001",
      blockId: "target000001",
      blockType: "fill_blanks",
      interaction: {
        kind: "fill-blanks",
        blanks: [
          { id: "blank0000001", label: "first term" },
          { id: "blank0000002", label: "second term" },
        ],
      },
      assessment: {
        kind: "fill-blanks",
        blanks: [
          {
            blankId: "blank0000001",
            acceptedAnswers: ["alpha", "Alpha"],
            caseSensitive: false,
            trimWhitespace: true,
          },
          {
            blankId: "blank0000002",
            acceptedAnswers: ["beta"],
            caseSensitive: true,
            trimWhitespace: false,
          },
        ],
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        legend: "Complete both gaps",
        maxAttempts: 2,
        points: 3,
        showAnswer: true,
      },
    });

    const learnerQuestion = descendantsOfType(
      projection.learnerDocument,
      "surface_fill_blanks_question",
    )[0];
    expect(learnerQuestion?.attrs).not.toHaveProperty("assessment");
    expect(JSON.stringify(learnerQuestion)).not.toContain("alpha");
    expect(JSON.stringify(learnerQuestion)).not.toContain("Per-blank feedback");
  });

  it("keeps malformed fixed Surface content observable as an invariant failure", () => {
    const document = courseDocument();
    const surface = document.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected Surface fixture.");
    surface.content = [{ type: "paragraph", content: [{ type: "text", text: "Invalid" }] }];

    expect(() =>
      projectAssessmentDocument(
        { status: "supported", canonicalDocument: document },
        builtInBlockRegistry,
        builtInSurfaceVariantRegistry,
      ),
    ).toThrow(
      'Surface "slide-fill-blanks-question" must contain exactly one Fill in Blanks question.',
    );
  });
});

function courseDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-fill-blanks-question");
  if (!definition) throw new Error("Expected slide-fill-blanks-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Fill in Blanks question.");

  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
          {
            ...surface,
            content: [
              {
                ...question,
                attrs: {
                  ...question.attrs,
                  id: "target000001",
                  settings: {
                    feedbackMode: "on_submit",
                    isGraded: true,
                    legend: "Complete both gaps",
                    maxAttempts: 2,
                    points: 3,
                    showAnswer: true,
                  },
                  assessment: {
                    blanksById: {
                      blank0000001: {
                        acceptedAnswers: ["alpha", "Alpha"],
                        caseSensitive: false,
                        feedback: richFeedback("Per-blank feedback"),
                        trimWhitespace: true,
                      },
                      blank0000002: {
                        acceptedAnswers: ["beta"],
                        caseSensitive: true,
                        feedback: null,
                        trimWhitespace: false,
                      },
                    },
                    summaryFeedback: null,
                  },
                },
                content: (question.content ?? []).map((child) =>
                  child.type === "fill_blanks_body" ? authoredBody() : child,
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}

function authoredBody(): JSONContent {
  return {
    type: "fill_blanks_body",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "The first term is " },
          { type: "fill_blank", attrs: { id: "blank0000001", placeholder: "first term" } },
          { type: "text", text: ", while the second is " },
          { type: "fill_blank", attrs: { id: "blank0000002", placeholder: "second term" } },
          { type: "text", text: "." },
        ],
      },
    ],
  };
}

function richFeedback(text: string) {
  return {
    kind: "rich-text" as const,
    document: {
      type: "doc" as const,
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    },
  };
}

function descendantsOfType(root: JSONContent, type: string): JSONContent[] {
  const matches: JSONContent[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === type) matches.push(node);
    for (const child of node.content ?? []) walk(child);
  };
  walk(root);
  return matches;
}
