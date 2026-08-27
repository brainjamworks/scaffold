// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import {
  EmbeddedNodeIdSchema,
  SequencingPrivateAssessmentSchema,
  SequencingSettingsSchema,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { insertSurfaceTemplateAfterSurface } from "../../authoring/surface-template-insertion";
import { slideCoverSurfaceDefinition } from "../templates/slide-cover";
import { slideSequencingQuestionSurfaceDefinition } from "../templates/assessment/slide-sequencing-question";
import {
  addSequencingItem,
  deleteSequencingItem,
} from "@/editor/blocks/assessment/sequencing/commands";
import {
  SURFACE_SEQUENCING_QUESTION_NODE_TYPE,
  SurfaceSequencingQuestionNode,
} from "./surface-sequencing-question-node";

describe("surface Sequencing question", () => {
  it("creates one private target owner with editable Sequencing defaults", () => {
    const surfaceId = createEmbeddedNodeId();
    const surface = slideSequencingQuestionSurfaceDefinition.createSurface({ surfaceId });
    const question = surface.content?.[0] as JSONContent | undefined;

    expect(surface).toMatchObject({
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: "slide-sequencing-question",
      },
    });
    expect(surface.content).toHaveLength(1);
    expect(slideSequencingQuestionSurfaceDefinition.catalogue.section).toBe("assessment");
    expect(slideSequencingQuestionSurfaceDefinition.structurePolicy).toEqual({
      fixedChildren: [{ type: SURFACE_SEQUENCING_QUESTION_NODE_TYPE }],
      allowRootInsertion: false,
    });
    expect(SurfaceSequencingQuestionNode.config.selectable).toBe(false);
    expect(SurfaceSequencingQuestionNode.config.isolating).toBe(true);
    expect(question).toMatchObject({
      type: SURFACE_SEQUENCING_QUESTION_NODE_TYPE,
      attrs: {
        settings: SequencingSettingsSchema.parse({}),
      },
    });

    const items = question?.content?.find(({ type }) => type === "sequencing_items_group")?.content;
    const itemIds = items?.map((item) => item.attrs?.["id"]);
    expect(items).toHaveLength(3);
    expect(itemIds?.every((id) => EmbeddedNodeIdSchema.safeParse(id).success)).toBe(true);
    expect(question?.attrs?.["assessment"]).toEqual(
      SequencingPrivateAssessmentSchema.parse({ correctOrder: itemIds }),
    );
  });

  it("projects one sequence assessment target and redacts learner private data", () => {
    const surface = slideSequencingQuestionSurfaceDefinition.createSurface({
      surfaceId: createEmbeddedNodeId(),
    });
    const question = surface.content?.[0] as JSONContent | undefined;
    if (!question) throw new Error("Expected Sequencing Question Surface content.");
    const assessmentTargetId = createEmbeddedNodeId();
    question.attrs = { ...question.attrs, id: assessmentTargetId };

    const targets =
      slideSequencingQuestionSurfaceDefinition.assessmentTargets.projectTargets(surface);
    const learner =
      slideSequencingQuestionSurfaceDefinition.assessmentTargets.projectLearnerSurface(surface);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      targetId: assessmentTargetId,
      blockId: assessmentTargetId,
      blockType: "sequencing",
      interaction: { kind: "sequence" },
      assessment: { kind: "sequence" },
    });
    expect(JSON.stringify(learner)).not.toContain('"assessment":');
  });

  it("keeps missing ids and unsupported structures observable", () => {
    const surface = slideSequencingQuestionSurfaceDefinition.createSurface({
      surfaceId: createEmbeddedNodeId(),
    });

    expect(() =>
      slideSequencingQuestionSurfaceDefinition.assessmentTargets.projectTargets(surface),
    ).toThrow("question is missing its assessment target id");
    expect(() =>
      slideSequencingQuestionSurfaceDefinition.assessmentTargets.projectTargets({
        ...surface,
        content: [],
      }),
    ).toThrow("must contain exactly one sequencing question");
  });

  it("assigns and preserves one stable target id during template insertion", () => {
    const composition = createCoreScaffoldAuthoringComposition();
    const firstSurfaceId = createEmbeddedNodeId();
    const editor = new Editor({
      extensions: createCourseDocumentAuthoringExtensions({ editable: true, composition }),
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "slideshow" },
            content: [
              {
                type: "courseSection",
                attrs: { id: createEmbeddedNodeId(), title: "Introduction" },
              },
              slideCoverSurfaceDefinition.createSurface({ surfaceId: firstSurfaceId }),
            ],
          },
        ],
      },
    });

    try {
      expect(
        insertSurfaceTemplateAfterSurface(editor, composition.capabilities.surfaces.registry, {
          afterSurfaceId: firstSurfaceId,
          variantId: slideSequencingQuestionSurfaceDefinition.id,
        }),
      ).toBe(true);

      const firstTargetId = findSurfaceSequencingQuestion(editor)?.attrs["id"];
      expect(EmbeddedNodeIdSchema.safeParse(firstTargetId).success).toBe(true);

      editor.commands.setContent(editor.getJSON());

      const reparsedTargetId = findSurfaceSequencingQuestion(editor)?.attrs["id"];
      expect(reparsedTargetId).toBe(firstTargetId);
      expect(findNodesByType(editor, SURFACE_SEQUENCING_QUESTION_NODE_TYPE)).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });

  it("does not expose the private owner as an insertable block", () => {
    expect(
      builtInBlockRegistry.getByNodeType(SURFACE_SEQUENCING_QUESTION_NODE_TYPE),
    ).toBeUndefined();
  });

  it("keeps the Surface-owned answer key aligned when authoring items change", () => {
    const surface = slideSequencingQuestionSurfaceDefinition.createSurface({
      surfaceId: createEmbeddedNodeId(),
    });
    const editor = new Editor({
      extensions: createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: createCoreScaffoldAuthoringComposition(),
      }),
      content: {
        type: "doc",
        content: [
          {
            type: "courseDocument",
            attrs: { mode: "slideshow" },
            content: [
              {
                type: "courseSection",
                attrs: { id: createEmbeddedNodeId(), title: "Assessment" },
              },
              surface,
            ],
          },
        ],
      },
    });

    try {
      const initialQuestion = findSurfaceSequencingQuestion(editor);
      const initialIds = sequencingItemIds(editor);
      expect(initialIds).toHaveLength(3);
      expect(initialQuestion?.attrs["assessment"]).toMatchObject({ correctOrder: initialIds });

      const groupPos = findNodePos(editor, "sequencing_items_group");
      if (groupPos === null) throw new Error("Expected Sequencing items group.");
      expect(addSequencingItem(editor, groupPos)).toBe(true);
      const afterAddIds = sequencingItemIds(editor);
      expect(afterAddIds).toHaveLength(4);
      expect(findSurfaceSequencingQuestion(editor)?.attrs["assessment"]).toMatchObject({
        correctOrder: afterAddIds,
      });

      const itemPos = findNodePos(editor, "sequencing_item");
      if (itemPos === null) throw new Error("Expected Sequencing item.");
      expect(deleteSequencingItem(editor, itemPos)).toBe(true);
      const afterDeleteIds = sequencingItemIds(editor);
      expect(afterDeleteIds).toHaveLength(3);
      expect(findSurfaceSequencingQuestion(editor)?.attrs["assessment"]).toMatchObject({
        correctOrder: afterDeleteIds,
      });
    } finally {
      editor.destroy();
    }
  });
});

function findSurfaceSequencingQuestion(editor: Editor) {
  return findNodesByType(editor, SURFACE_SEQUENCING_QUESTION_NODE_TYPE)[0];
}

function findNodesByType(editor: Editor, nodeType: string) {
  const nodes: Array<{ attrs: Record<string, unknown> }> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === nodeType) nodes.push({ attrs: node.attrs });
    return true;
  });
  return nodes;
}

function sequencingItemIds(editor: Editor): string[] {
  return findNodesByType(editor, "sequencing_item").map(({ attrs }) => {
    const id = attrs["id"];
    return typeof id === "string" ? id : "";
  });
}

function findNodePos(editor: Editor, nodeType: string): number | null {
  let result: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (result === null && node.type.name === nodeType) result = pos;
    return result === null;
  });
  return result;
}
