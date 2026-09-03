// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { projectAssessmentDocument } from "@/authoring/publication/document-projection";
import { createSurfaceCreationCatalog } from "@/editor/surfaces/authoring/surface-creation-catalog";

import { builtInSurfaceVariantRegistry } from "../built-in-surface-variant-definitions";
import { SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE } from "./surface-multiple-choice-question-node";
import { SURFACE_DRAG_DROP_QUESTION_NODE_TYPE } from "./surface-drag-drop-question-node";
import { SURFACE_QUIZ_NODE_TYPE } from "./surface-quiz-node";
import {
  createQuizQuestion,
  SLIDE_QUIZ_VARIANT_ID,
  slideQuizSurfaceDefinition,
} from "../templates/assessment/slide-quiz";

describe("Quiz Surface", () => {
  it("creates one fixed private Quiz aggregate with one private multiple-choice question", () => {
    const surfaceId = EmbeddedNodeIdSchema.parse("surface00001");
    const surface = slideQuizSurfaceDefinition.createSurface({ surfaceId });
    const quiz = surface.content?.[0];
    const question = quiz?.content?.[0];

    expect(surface).toMatchObject({
      type: "surface",
      attrs: { id: surfaceId, variant: SLIDE_QUIZ_VARIANT_ID },
    });
    expect(surface.content?.map(({ type }) => type)).toEqual([SURFACE_QUIZ_NODE_TYPE]);
    expect(quiz).toMatchObject({
      type: SURFACE_QUIZ_NODE_TYPE,
      attrs: { id: expect.any(String) },
    });
    expect(quiz?.content).toHaveLength(1);
    expect(question).toMatchObject({
      type: SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE,
      attrs: { id: expect.any(String) },
    });
    expect(builtInBlockRegistry.getByNodeType(SURFACE_QUIZ_NODE_TYPE)).toBeUndefined();
    expect(
      builtInBlockRegistry.getByNodeType(SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE),
    ).toBeUndefined();

    const ids = stableIds(surface);
    expect(ids).toContain(surfaceId);
    expect(ids).toContain(quiz?.attrs?.["id"]);
    expect(ids).toContain(question?.attrs?.["id"]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => EmbeddedNodeIdSchema.safeParse(id).success)).toBe(true);
  });

  it("fixes only the private aggregate at the Surface boundary", () => {
    expect(slideQuizSurfaceDefinition.structurePolicy).toEqual({
      fixedChildren: [{ type: SURFACE_QUIZ_NODE_TYPE }],
      allowRootInsertion: false,
    });
    expect(slideQuizSurfaceDefinition.assessmentTargets).toBeDefined();
  });

  it("creates Drag and Drop through its native private Surface definition", () => {
    const question = createQuizQuestion(SURFACE_DRAG_DROP_QUESTION_NODE_TYPE);

    expect(question).toMatchObject({
      type: SURFACE_DRAG_DROP_QUESTION_NODE_TYPE,
      attrs: {
        id: expect.any(String),
        settings: { maxAttempts: null, gradingMode: "partial-credit" },
      },
      content: expect.arrayContaining([expect.objectContaining({ type: "drag_drop_canvas" })]),
    });
    expect(
      builtInBlockRegistry.getByNodeType(SURFACE_DRAG_DROP_QUESTION_NODE_TYPE),
    ).toBeUndefined();
  });

  it("publishes one Quiz group whose membership is the ordered child target list", () => {
    const surface = slideQuizSurfaceDefinition.createSurface({
      surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
    });
    const quiz = surface.content?.[0];
    if (!quiz) throw new Error("Expected Quiz Surface content.");
    const quizId = String(quiz.attrs?.["id"] ?? "");
    const questionId = String(quiz.content?.[0]?.attrs?.["id"] ?? "");
    surface.content = [boundary("surface_header"), quiz, boundary("surface_footer")];
    const projection = projectAssessmentDocument(
      {
        status: "supported",
        canonicalDocument: { type: "courseDocument", content: [surface] },
      },
      builtInBlockRegistry,
      builtInSurfaceVariantRegistry,
    );

    expect(projection.targets.map(({ targetId }) => targetId)).toEqual([questionId]);
    expect(projection.groups).toHaveLength(1);
    expect(projection.groups[0]).toMatchObject({
      kind: "quiz",
      groupId: quizId,
      targetIds: [questionId],
    });
    expect(projection.groups[0]?.groupId).not.toBe(surface.attrs?.["id"]);
    expect(
      descendantsOfType(projection.learnerDocument, SURFACE_MULTIPLE_CHOICE_QUESTION_NODE_TYPE)[0]
        ?.attrs,
    ).not.toHaveProperty("assessment");
    expect(projection.warnings).toEqual([]);
  });

  it("is the final assessment entry in the Slideshow catalogue", () => {
    const assessmentEntries = createSurfaceCreationCatalog(builtInSurfaceVariantRegistry)
      .forMode("slideshow")
      .filter(({ catalogue }) => catalogue.section === "assessment");

    expect(assessmentEntries.map(({ variantId }) => variantId)).toEqual([
      "slide-categorise-question",
      "slide-sequencing-question",
      "slide-matching-question",
      "slide-image-hotspot-question",
      "slide-multiple-choice-question",
      "slide-multiselect-question",
      "slide-dropdown-question",
      "slide-drag-drop-question",
      "slide-fill-blanks-question",
      SLIDE_QUIZ_VARIANT_ID,
    ]);
  });
});

function stableIds(root: JSONContent): string[] {
  const ids: string[] = [];
  const visit = (node: JSONContent) => {
    const id = node.attrs?.["id"];
    if (typeof id === "string") ids.push(id);
    for (const child of node.content ?? []) visit(child);
  };
  visit(root);
  return ids;
}

function descendantsOfType(root: JSONContent, type: string): JSONContent[] {
  const matches: JSONContent[] = [];
  const visit = (node: JSONContent) => {
    if (node.type === type) matches.push(node);
    for (const child of node.content ?? []) visit(child);
  };
  visit(root);
  return matches;
}

function boundary(type: "surface_header" | "surface_footer"): JSONContent {
  return {
    type,
    content: [
      {
        type: "surface_header_footer_slot",
        attrs: { position: "center" },
        content: [{ type: "paragraph" }],
      },
    ],
  };
}
