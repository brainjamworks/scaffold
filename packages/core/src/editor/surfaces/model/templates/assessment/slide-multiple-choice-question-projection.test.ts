import type { JSONContent } from "@tiptap/core";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { projectAssessmentDocument } from "@/authoring/publication/document-projection";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "../../built-in-surface-variant-definitions";

describe("slide Multiple Choice question assessment projection", () => {
  it("projects one canonical single-select target from the Surface owner", () => {
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
      blockType: "mcq",
      interaction: {
        kind: "single-select",
        options: [
          { id: "choice_00001", label: "Venus" },
          { id: "choice_00002", label: "Mars" },
          { id: "choice_00003", label: "Jupiter" },
          { id: "choice_00004", label: "Mercury" },
        ],
      },
      assessment: {
        kind: "single-select",
        correctOptionId: "choice_00002",
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        legend: "Choose the correct planet",
        maxAttempts: 2,
        points: 3,
        showAnswer: true,
      },
    });

    const learnerQuestion = descendantsOfType(
      projection.learnerDocument,
      "surface_multiple_choice_question",
    )[0];
    expect(learnerQuestion?.attrs).not.toHaveProperty("assessment");
  });

  it("keeps malformed Surface-owned content observable", () => {
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
    ).toThrow("must contain exactly one multiple-choice question");
  });
});

function courseDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-multiple-choice-question");
  if (!definition) throw new Error("Expected slide-multiple-choice-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Multiple Choice question.");
  const labels = ["Venus", "Mars", "Jupiter", "Mercury"];

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
                    legend: "Choose the correct planet",
                    maxAttempts: 2,
                    points: 3,
                    showAnswer: true,
                  },
                  assessment: {
                    correctOptionId: "choice_00002",
                    feedbackByOptionId: {},
                    summaryFeedback: null,
                  },
                },
                content: (question.content ?? []).map((child) =>
                  child.type === "assessment_choices_group"
                    ? {
                        ...child,
                        content: labels.map((label, index) => choice(index + 1, label)),
                      }
                    : child,
                ),
              },
            ],
          },
        ],
      },
    ],
  };
}

function choice(index: number, label: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id: `choice_${String(index).padStart(5, "0")}` },
    content: [
      {
        type: "selectable_choice_body",
        content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
      },
    ],
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
