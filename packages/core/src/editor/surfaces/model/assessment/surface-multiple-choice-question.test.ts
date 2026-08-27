// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import {
  EmbeddedNodeIdSchema,
  McqPrivateAssessmentSchema,
  McqSettingsSchema,
} from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import {
  readPrivateChoiceState,
  toggleChoiceCorrect,
} from "@/editor/blocks/assessment/shared/nodes/selectable-choice";

import { insertSurfaceTemplateAfterSurface } from "../../authoring/surface-template-insertion";
import { builtInSurfaceVariantRegistry } from "../built-in-surface-variant-definitions";
import { slideCoverSurfaceDefinition } from "../templates/slide-cover";

describe("surface Multiple Choice question", () => {
  it("creates one private target owner with four editable choices", () => {
    const surface = requireDefinition().createSurface({
      surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
    });
    const question = surface.content?.[0];

    expect(question).toMatchObject({
      type: "surface_multiple_choice_question",
      attrs: {
        settings: McqSettingsSchema.parse({ legend: "Choose one answer" }),
        assessment: expect.objectContaining({ correctOptionId: expect.any(String) }),
      },
    });
    expect(question?.content?.map(({ type }) => type)).toEqual([
      "assessment_title",
      "assessment_instructions",
      "assessment_prompt",
      "assessment_choices_group",
      "assessment_actions_group",
    ]);
    expect(question?.content?.[3]?.content).toHaveLength(4);
  });

  it("keeps the private owner out of the ordinary block catalogue", () => {
    expect(builtInBlockRegistry.getByNodeType("surface_multiple_choice_question")).toBeUndefined();
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
              { type: "courseSection", attrs: { id: createEmbeddedNodeId(), title: "Intro" } },
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
          variantId: requireDefinition().id,
        }),
      ).toBe(true);
      const targetId = findQuestionId(editor);
      expect(EmbeddedNodeIdSchema.safeParse(targetId).success).toBe(true);

      editor.commands.setContent(editor.getJSON());
      expect(findQuestionId(editor)).toBe(targetId);
    } finally {
      editor.destroy();
    }
  });

  it("uses the Surface owner for correctness and feedback resolution", () => {
    const editor = createAuthoringEditor();

    try {
      const choices = choicePositions(editor);
      expect(choices).toHaveLength(4);
      expect(toggleChoiceCorrect(editor, choices[1]!)).toBe(true);

      const secondChoiceId = String(editor.state.doc.nodeAt(choices[1]!)?.attrs["id"] ?? "");
      const firstChoiceId = String(editor.state.doc.nodeAt(choices[0]!)?.attrs["id"] ?? "");
      const state = readPrivateChoiceState(editor, choices[1]!, secondChoiceId);
      expect(state.isCorrect).toBe(true);
      expect(readPrivateChoiceState(editor, choices[0]!, firstChoiceId).isCorrect).toBe(false);
    } finally {
      editor.destroy();
    }
  });
});

function requireDefinition() {
  const definition = builtInSurfaceVariantRegistry.get("slide-multiple-choice-question");
  if (!definition) throw new Error("Expected slide-multiple-choice-question Surface definition.");
  return definition;
}

function createAuthoringEditor() {
  const surface = requireDefinition().createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Multiple Choice question content.");

  return new Editor({
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
            { type: "courseSection", attrs: { id: createEmbeddedNodeId(), title: "Intro" } },
            {
              ...surface,
              content: [
                {
                  ...question,
                  attrs: {
                    ...question.attrs,
                    id: "target000001",
                    assessment: McqPrivateAssessmentSchema.parse({
                      correctOptionId: "choice_00001",
                    }),
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  });
}

function choicePositions(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "selectable_choice") positions.push(pos);
    return true;
  });
  return positions;
}

function findQuestionId(editor: Editor): unknown {
  let targetId: unknown;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "surface_multiple_choice_question") return true;
    targetId = node.attrs["id"];
    return false;
  });
  return targetId;
}
