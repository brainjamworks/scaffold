// @vitest-environment happy-dom

import { Editor, type JSONContent } from "@tiptap/core";
import {
  EmbeddedNodeIdSchema,
  MatchingPrivateAssessmentSchema,
  MatchingSettingsSchema,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { setMatchingPairFeedback } from "@/editor/blocks/assessment/matching/commands";
import { insertSurfaceTemplateAfterSurface } from "../../authoring/surface-template-insertion";
import { builtInSurfaceVariantRegistry } from "../built-in-surface-variant-definitions";
import { slideCoverSurfaceDefinition } from "../templates/slide-cover";

describe("surface Matching question", () => {
  it("creates one private target owner with editable Matching defaults", () => {
    const definition = requireMatchingDefinition();
    const surfaceId = createEmbeddedNodeId();
    const surface = definition.createSurface({ surfaceId });
    const question = surface.content?.[0] as JSONContent | undefined;

    expect(surface).toMatchObject({
      type: "surface",
      attrs: {
        id: surfaceId,
        variant: "slide-matching-question",
      },
    });
    expect(surface.content).toHaveLength(1);
    if (!definition.catalogue) throw new Error("Expected Matching Surface catalogue metadata.");
    expect(definition.catalogue.section).toBe("assessment");
    expect(definition.structurePolicy).toEqual({
      fixedChildren: [{ type: "surface_matching_question" }],
      allowRootInsertion: false,
    });
    expect(question).toMatchObject({
      type: "surface_matching_question",
      attrs: {
        settings: MatchingSettingsSchema.parse({}),
        assessment: MatchingPrivateAssessmentSchema.parse({}),
      },
    });

    const pairs = question?.content?.find(({ type }) => type === "matching_pairs_group")?.content;
    expect(pairs).toHaveLength(3);
    expect(
      pairs?.map((pair) => [
        EmbeddedNodeIdSchema.safeParse(pair.attrs?.["id"]).success,
        EmbeddedNodeIdSchema.safeParse(pair.content?.[0]?.attrs?.["id"]).success,
        EmbeddedNodeIdSchema.safeParse(pair.content?.[1]?.attrs?.["id"]).success,
      ]),
    ).toEqual([
      [true, true, true],
      [true, true, true],
      [true, true, true],
    ]);
  });

  it("assigns and preserves one stable target id during template insertion", () => {
    const definition = requireMatchingDefinition();
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
          variantId: definition.id,
        }),
      ).toBe(true);

      const firstTargetId = findSurfaceMatchingQuestion(editor)?.attrs["id"];
      expect(EmbeddedNodeIdSchema.safeParse(firstTargetId).success).toBe(true);

      editor.commands.setContent(editor.getJSON());

      expect(findSurfaceMatchingQuestion(editor)?.attrs["id"]).toBe(firstTargetId);
      expect(findNodesByType(editor, "surface_matching_question")).toHaveLength(1);
    } finally {
      editor.destroy();
    }
  });

  it("does not expose the private owner as an insertable block", () => {
    expect(builtInBlockRegistry.getByNodeType("surface_matching_question")).toBeUndefined();
  });

  it("persists feedback against the Surface-owned Matching question", () => {
    const definition = requireMatchingDefinition();
    const editor = new Editor({
      extensions: createCourseDocumentAuthoringExtensions({
        editable: true,
        composition: createCoreScaffoldAuthoringComposition(),
      }),
      content: matchingSurfaceDocument(definition),
    });

    try {
      const firstPair = findFirstPair(editor);

      expect(
        setMatchingPairFeedback(editor, firstPair.pos, firstPair.itemId, richFeedback("Correct.")),
      ).toBe(true);

      expect(findSurfaceMatchingQuestion(editor)?.attrs["assessment"]).toMatchObject({
        feedbackByItemId: {
          [firstPair.itemId]: richFeedback("Correct."),
        },
      });
    } finally {
      editor.destroy();
    }
  });
});

function requireMatchingDefinition() {
  const definition = builtInSurfaceVariantRegistry.get("slide-matching-question");
  if (!definition) throw new Error("Expected slide-matching-question Surface definition.");
  return definition;
}

function findSurfaceMatchingQuestion(editor: Editor) {
  return findNodesByType(editor, "surface_matching_question")[0];
}

function findNodesByType(editor: Editor, nodeType: string) {
  const nodes: Array<{ attrs: Record<string, unknown> }> = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === nodeType) nodes.push({ attrs: node.attrs });
    return true;
  });
  return nodes;
}

function matchingSurfaceDocument(definition: ReturnType<typeof requireMatchingDefinition>) {
  const surface = definition.createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Surface Matching question content.");
  return {
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
          {
            ...surface,
            content: [
              {
                ...question,
                attrs: { ...question.attrs, id: "target000001" },
              },
            ],
          },
        ],
      },
    ],
  };
}

function findFirstPair(editor: Editor) {
  const matches: Array<{ itemId: string; pos: number }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (matches.length > 0 || node.type.name !== "matching_pair") return true;
    const itemId = node.firstChild?.attrs["id"];
    if (typeof itemId === "string") matches.push({ itemId, pos });
    return false;
  });
  const first = matches[0];
  if (!first) throw new Error("Expected a matching pair.");
  return first;
}

function richFeedback(text: string) {
  return {
    kind: "rich-text" as const,
    document: {
      type: "doc" as const,
      content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text }] }],
    },
  };
}
