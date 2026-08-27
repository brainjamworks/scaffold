// @vitest-environment happy-dom

import {
  DropdownPrivateAssessmentSchema,
  DropdownSettingsSchema,
  EmbeddedNodeIdSchema,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { deleteAssessmentChoice } from "@/editor/blocks/assessment/shared/model/delete-assessment-choice";

import { builtInSurfaceVariantRegistry } from "../built-in-surface-variant-definitions";

describe("surface Dropdown question", () => {
  it("creates one private target owner with a fixed authored shell", () => {
    const surface = requireDefinition().createSurface({
      surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
    });
    const question = surface.content?.[0];

    expect(question).toMatchObject({
      type: "surface_dropdown_question",
      attrs: {
        settings: DropdownSettingsSchema.parse({ label: "Choose an answer" }),
        assessment: expect.objectContaining({ correctOptionId: expect.any(String) }),
      },
    });
    expect(question?.content?.map(({ type }) => type)).toEqual([
      "assessment_title",
      "assessment_instructions",
      "assessment_prompt",
      "dropdown_choices_group",
      "assessment_actions_group",
    ]);
    expect(question?.content?.[3]?.content).toHaveLength(4);
  });

  it("keeps the private owner out of the ordinary block catalogue", () => {
    expect(builtInBlockRegistry.getByNodeType("surface_dropdown_question")).toBeUndefined();
  });

  it("deletes a Surface option and its answer-key and feedback references atomically", () => {
    const editor = createAuthoringEditor();

    try {
      const positions = dropdownChoicePositions(editor);
      expect(deleteAssessmentChoice(editor, positions[0]!)).toBe(true);
      const assessment = DropdownPrivateAssessmentSchema.parse(
        findQuestion(editor).attrs["assessment"],
      );
      expect(assessment.correctOptionId).toBeNull();
      expect(assessment.feedbackByOptionId).not.toHaveProperty("choice_00001");
      expect(dropdownChoicePositions(editor)).toHaveLength(3);
    } finally {
      editor.destroy();
    }
  });
});

function requireDefinition() {
  const definition = builtInSurfaceVariantRegistry.get("slide-dropdown-question");
  if (!definition) throw new Error("Expected slide-dropdown-question Surface definition.");
  return definition;
}

function createAuthoringEditor() {
  const surface = requireDefinition().createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Dropdown question content.");
  const choiceIds = ["choice_00001", "choice_00002", "choice_00003", "choice_00004"];

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
                    assessment: DropdownPrivateAssessmentSchema.parse({
                      correctOptionId: choiceIds[0],
                      feedbackByOptionId: {
                        [choiceIds[0]!]: richFeedback("This is the correct option."),
                      },
                    }),
                  },
                  content: (question.content ?? []).map((child) =>
                    child.type === "dropdown_choices_group"
                      ? {
                          ...child,
                          content: choiceIds.map((id, index) => choice(id, `Option ${index + 1}`)),
                        }
                      : child,
                  ),
                },
              ],
            },
          ],
        },
      ],
    },
  });
}

function choice(id: string, label: string): JSONContent {
  return {
    type: "dropdown_choice",
    attrs: { id },
    content: [
      {
        type: "dropdown_choice_label",
        content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
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

function dropdownChoicePositions(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "dropdown_choice") positions.push(pos);
    return true;
  });
  return positions;
}

function findQuestion(editor: Editor) {
  let question = editor.state.doc;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "surface_dropdown_question") return true;
    question = node;
    return false;
  });
  return question;
}
