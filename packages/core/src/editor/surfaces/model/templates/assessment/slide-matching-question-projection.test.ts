import type { JSONContent } from "@tiptap/core";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { projectAssessmentDocument } from "@/authoring/publication/document-projection";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "../../built-in-surface-variant-definitions";

describe("slide Matching question assessment projection", () => {
  it("projects one canonical match target from the Surface-owned question", () => {
    const document = courseDocumentWithMatchingSurface();
    const projection = projectAssessmentDocument(
      { status: "supported", canonicalDocument: document },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );

    expect(projection.warnings).toEqual([]);
    expect(projection.targets).toHaveLength(1);
    expect(projection.targets[0]).toMatchObject({
      targetId: "target000001",
      blockId: "target000001",
      blockType: "matching",
      interaction: {
        kind: "match",
        items: [
          { id: "item__000001", label: "France" },
          { id: "item__000002", label: "Spain" },
          { id: "item__000003", label: "Italy" },
        ],
      },
      assessment: {
        kind: "match",
        correctPairs: [
          { itemId: "item__000001", targetId: "target_00001" },
          { itemId: "item__000002", targetId: "target_00002" },
          { itemId: "item__000003", targetId: "target_00003" },
        ],
        feedbackByItemId: {
          item__000002: {
            kind: "rich-text",
            document: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Madrid matches Spain." }],
                },
              ],
            },
          },
        },
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        legend: "Match countries to capitals",
        maxAttempts: 2,
        points: 3,
        showAnswer: true,
      },
    });

    const learnerQuestion = descendantsOfType(
      projection.learnerDocument,
      "surface_matching_question",
    )[0];
    expect(learnerQuestion?.attrs).not.toHaveProperty("assessment");
    expect(descendantsOfType(projection.learnerDocument, "matching_feedback")).toHaveLength(0);
  });

  it("keeps a malformed Surface-owned Matching target observable", () => {
    const document = courseDocumentWithMatchingSurface();
    const surface = document.content?.[0]?.content?.[0];
    if (!surface) throw new Error("Expected surface fixture.");
    surface.content = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Not a matching question" }],
      },
    ];

    expect(() =>
      projectAssessmentDocument(
        { status: "supported", canonicalDocument: document },
        builtInBlockRegistry,
        builtInSurfaceVariantRegistry,
      ),
    ).toThrow("must contain exactly one matching question");
  });
});

function courseDocumentWithMatchingSurface(): JSONContent {
  const definition = builtInSurfaceVariantRegistry.get("slide-matching-question");
  if (!definition) throw new Error("Expected slide-matching-question Surface definition.");
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Matching question.");
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        attrs: { mode: "slideshow" },
        content: [
          {
            ...surface,
            content: [authoredQuestion(question)],
          },
        ],
      },
    ],
  };
}

function authoredQuestion(question: JSONContent): JSONContent {
  return {
    ...question,
    attrs: {
      ...question.attrs,
      id: "target000001",
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        legend: "Match countries to capitals",
        maxAttempts: 2,
        points: 3,
        showAnswer: true,
      },
      assessment: {
        feedbackByItemId: {
          item__000002: {
            kind: "rich-text",
            document: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Madrid matches Spain." }],
                },
              ],
            },
          },
        },
        summaryFeedback: null,
      },
    },
    content: (question.content ?? []).map((child) =>
      child.type === "matching_pairs_group"
        ? {
            ...child,
            content: [
              matchingPair("pair__000001", "item__000001", "target_00001", "France", "Paris"),
              matchingPair("pair__000002", "item__000002", "target_00002", "Spain", "Madrid"),
              matchingPair("pair__000003", "item__000003", "target_00003", "Italy", "Rome"),
            ],
          }
        : child,
    ),
  };
}

function matchingPair(
  id: string,
  itemId: string,
  targetId: string,
  itemText: string,
  targetText: string,
): JSONContent {
  return {
    type: "matching_pair",
    attrs: { id },
    content: [
      {
        type: "matching_item",
        attrs: { id: itemId },
        content: [{ type: "paragraph", content: [{ type: "text", text: itemText }] }],
      },
      {
        type: "matching_target",
        attrs: { id: targetId },
        content: [{ type: "paragraph", content: [{ type: "text", text: targetText }] }],
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
