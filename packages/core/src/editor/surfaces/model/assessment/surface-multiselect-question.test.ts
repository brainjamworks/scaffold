// @vitest-environment happy-dom

import {
  EmbeddedNodeIdSchema,
  MultiselectPrivateAssessmentSchema,
  MultiselectSettingsSchema,
} from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { deleteAssessmentChoice } from "@/editor/blocks/assessment/shared/model/delete-assessment-choice";
import {
  choiceCorrectnessUnavailableReason,
  readPrivateChoiceState,
  toggleChoiceCorrect,
} from "@/editor/blocks/assessment/shared/nodes/selectable-choice";

import { insertSurfaceTemplateAfterSurface } from "../../authoring/surface-template-insertion";
import { builtInSurfaceVariantRegistry } from "../built-in-surface-variant-definitions";
import { slideCoverSurfaceDefinition } from "../templates/slide-cover";

describe("surface Multi-select question", () => {
  it("creates one private target owner with four editable choices and two correct answers", () => {
    const surface = requireDefinition().createSurface({
      surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
    });
    const question = surface.content?.[0];

    expect(question).toMatchObject({
      type: "surface_multiselect_question",
      attrs: {
        settings: MultiselectSettingsSchema.parse({ legend: "Choose all that apply" }),
        assessment: expect.objectContaining({
          correctOptionIds: [expect.any(String), expect.any(String)],
        }),
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
    expect(builtInBlockRegistry.getByNodeType("surface_multiselect_question")).toBeUndefined();
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

  it("uses Surface settings and private assessment for correctness limits and feedback", () => {
    const editor = createAuthoringEditor();

    try {
      const choices = choicePositions(editor);
      expect(choices).toHaveLength(4);
      const thirdChoiceId = choiceId(editor, choices[2]!);
      expect(toggleChoiceCorrect(editor, choices[2]!)).toBe(false);
      expect(choiceCorrectnessUnavailableReason(editor, choices[2]!)).toBe(
        "Increase max selections or unmark another correct answer.",
      );
      expect(readPrivateChoiceState(editor, choices[2]!, thirdChoiceId).isCorrect).toBe(false);

      expect(toggleChoiceCorrect(editor, choices[0]!)).toBe(true);
      expect(toggleChoiceCorrect(editor, choices[2]!)).toBe(true);
      expect(readPrivateChoiceState(editor, choices[2]!, thirdChoiceId).isCorrect).toBe(true);
    } finally {
      editor.destroy();
    }
  });

  it("deletes a Surface choice and its answer-key and feedback references atomically", () => {
    const editor = createAuthoringEditor();

    try {
      const choices = choicePositions(editor);
      expect(deleteAssessmentChoice(editor, choices[1]!)).toBe(true);
      const question = findQuestion(editor);
      const assessment = MultiselectPrivateAssessmentSchema.parse(question.attrs["assessment"]);
      expect(assessment.correctOptionIds).toEqual(["choice_00001"]);
      expect(assessment.feedbackByOptionId).not.toHaveProperty("choice_00002");
      expect(choicePositions(editor)).toHaveLength(3);
    } finally {
      editor.destroy();
    }
  });
});

function requireDefinition() {
  const definition = builtInSurfaceVariantRegistry.get("slide-multiselect-question");
  if (!definition) throw new Error("Expected slide-multiselect-question Surface definition.");
  return definition;
}

function createAuthoringEditor() {
  const surface = requireDefinition().createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Multi-select question content.");
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
                    settings: MultiselectSettingsSchema.parse({
                      legend: "Choose all that apply",
                      maxSelect: 2,
                    }),
                    assessment: MultiselectPrivateAssessmentSchema.parse({
                      correctOptionIds: choiceIds.slice(0, 2),
                      feedbackByOptionId: {
                        choice_00002: richFeedback("This option is part of the answer."),
                      },
                    }),
                  },
                  content: (question.content ?? []).map((child) =>
                    child.type === "assessment_choices_group"
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
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
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

function choicePositions(editor: Editor): number[] {
  const positions: number[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === "selectable_choice") positions.push(pos);
    return true;
  });
  return positions;
}

function choiceId(editor: Editor, pos: number): string {
  return String(editor.state.doc.nodeAt(pos)?.attrs["id"] ?? "");
}

function findQuestion(editor: Editor) {
  let question = editor.state.doc;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "surface_multiselect_question") return true;
    question = node;
    return false;
  });
  return question;
}

function findQuestionId(editor: Editor): unknown {
  return findQuestion(editor).attrs["id"];
}
