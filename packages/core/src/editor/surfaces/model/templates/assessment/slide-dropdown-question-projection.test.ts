import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { projectAssessmentDocument } from "@/authoring/publication/document-projection";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "../../built-in-surface-variant-definitions";

describe("slide Dropdown question assessment projection", () => {
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
      blockType: "dropdown",
      interaction: {
        kind: "single-select",
        options: [
          { id: "choice_00001", label: "Mercury" },
          { id: "choice_00002", label: "Venus" },
          { id: "choice_00003", label: "Earth" },
          { id: "choice_00004", label: "Mars" },
        ],
      },
      assessment: {
        kind: "single-select",
        correctOptionId: "choice_00003",
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        label: "Select the planet",
        maxAttempts: 2,
        placeholder: "Choose a planet",
        points: 3,
        showAnswer: true,
      },
    });

    const learnerQuestion = descendantsOfType(
      projection.learnerDocument,
      "surface_dropdown_question",
    )[0];
    expect(learnerQuestion?.attrs).not.toHaveProperty("assessment");
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
    ).toThrow('Surface "slide-dropdown-question" must contain exactly one Dropdown question.');
  });
});

function courseDocument(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-dropdown-question");
  if (!definition) throw new Error("Expected slide-dropdown-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Dropdown question.");
  const labels = ["Mercury", "Venus", "Earth", "Mars"];

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
                    label: "Select the planet",
                    maxAttempts: 2,
                    placeholder: "Choose a planet",
                    points: 3,
                    showAnswer: true,
                  },
                  assessment: {
                    correctOptionId: "choice_00003",
                    feedbackByOptionId: {},
                    summaryFeedback: null,
                  },
                },
                content: (question.content ?? []).map((child) =>
                  child.type === "dropdown_choices_group"
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
    type: "dropdown_choice",
    attrs: { id: `choice_${String(index).padStart(5, "0")}` },
    content: [
      {
        type: "dropdown_choice_label",
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
