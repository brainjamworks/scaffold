// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import {
  CategorisePrivateAssessmentSchema,
  CategoriseSettingsSchema,
  EmbeddedNodeIdSchema,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { insertSurfaceTemplateAfterSurface } from "../../authoring/surface-template-insertion";
import { slideCoverSurfaceDefinition } from "../templates/slide-cover";
import { slideCategoriseQuestionSurfaceDefinition } from "../templates/assessment/slide-categorise-question";
import {
  SURFACE_CATEGORISE_QUESTION_NODE_TYPE,
  SurfaceCategoriseQuestionNode,
} from "./surface-categorise-question-node";

describe("surface Categorise question", () => {
  it("creates one private target owner with editable Categorise defaults", () => {
    const surfaceId = createEmbeddedNodeId();
    const surface = slideCategoriseQuestionSurfaceDefinition.createSurface({ surfaceId });
    const question = surface.content?.[0] as JSONContent | undefined;

    expect(surface).toMatchObject({
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: "slide-categorise-question",
      },
    });
    expect(surface.content).toHaveLength(1);
    expect(slideCategoriseQuestionSurfaceDefinition.catalogue.section).toBe("assessment");
    expect(slideCategoriseQuestionSurfaceDefinition.structurePolicy).toEqual({
      fixedChildren: [{ type: SURFACE_CATEGORISE_QUESTION_NODE_TYPE }],
      allowRootInsertion: false,
    });
    expect(SurfaceCategoriseQuestionNode.config.selectable).toBe(false);
    expect(SurfaceCategoriseQuestionNode.config.isolating).toBe(true);
    expect(question).toMatchObject({
      type: SURFACE_CATEGORISE_QUESTION_NODE_TYPE,
      attrs: {
        settings: CategoriseSettingsSchema.parse({}),
        assessment: CategorisePrivateAssessmentSchema.parse({}),
      },
    });

    const bins = question?.content
      ?.find(({ type }) => type === "categorise_content")
      ?.content?.find(({ type }) => type === "categorise_bins_group")?.content;
    expect(bins).toHaveLength(2);
    expect(bins?.map((bin) => bin.content?.[1]?.content?.length)).toEqual([2, 2]);
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
          variantId: slideCategoriseQuestionSurfaceDefinition.id,
        }),
      ).toBe(true);

      const firstTargetId = findSurfaceCategoriseQuestion(editor)?.attrs["id"];
      expect(EmbeddedNodeIdSchema.safeParse(firstTargetId).success).toBe(true);

      editor.commands.setContent(editor.getJSON());

      const reparsedTargetId = findSurfaceCategoriseQuestion(editor)?.attrs["id"];
      expect(reparsedTargetId).toBe(firstTargetId);
      expect(findNodesByType(editor, SURFACE_CATEGORISE_QUESTION_NODE_TYPE)).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });

  it("does not expose the private owner as an insertable block", () => {
    expect(
      builtInBlockRegistry.getByNodeType(SURFACE_CATEGORISE_QUESTION_NODE_TYPE),
    ).toBeUndefined();
  });
});

function findSurfaceCategoriseQuestion(editor: Editor) {
  return findNodesByType(editor, SURFACE_CATEGORISE_QUESTION_NODE_TYPE)[0];
}

function findNodesByType(editor: Editor, nodeType: string) {
  const nodes: Array<{ attrs: Record<string, unknown> }> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === nodeType) nodes.push({ attrs: node.attrs });
    return true;
  });
  return nodes;
}
