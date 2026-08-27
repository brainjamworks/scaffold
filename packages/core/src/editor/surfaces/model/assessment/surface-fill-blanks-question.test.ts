// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema, FillBlanksPrivateAssessmentSchema } from "@scaffold/contracts";
import { Editor, type JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCoreScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { applyFillBlankToEditor } from "@/editor/blocks/assessment/fill-blanks/commands";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";

import { builtInSurfaceVariantRegistry } from "../built-in-surface-variant-definitions";

describe("surface Fill in Blanks question", () => {
  it("creates one private target owner with a fixed authored shell and several blanks", () => {
    const surface = requireDefinition().createSurface({
      surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
    });
    const question = surface.content?.[0];

    expect(question).toMatchObject({
      type: "surface_fill_blanks_question",
      attrs: {
        assessment: expect.objectContaining({ blanksById: expect.any(Object) }),
      },
    });
    expect(question?.content?.map(({ type }) => type)).toEqual([
      "assessment_title",
      "assessment_instructions",
      "assessment_prompt",
      "fill_blanks_body",
      "assessment_actions_group",
    ]);
    expect(descendantsOfType(question!, "fill_blank")).toHaveLength(3);
    expect(Object.keys(question?.attrs?.["assessment"]?.blanksById ?? {})).toHaveLength(3);
  });

  it("keeps the private owner out of the ordinary block catalogue", () => {
    expect(builtInBlockRegistry.getByNodeType("surface_fill_blanks_question")).toBeUndefined();
  });

  it("creates a blank inside Surface prose and synchronizes the private answer key", () => {
    const editor = createAuthoringEditor();

    try {
      let from = -1;
      editor.state.doc.descendants((node, pos) => {
        if (!node.isText || !node.text?.includes("evidence")) return;
        from = pos + node.text.indexOf("evidence");
      });
      expect(from).toBeGreaterThan(0);
      editor.commands.setTextSelection({ from, to: from + "evidence".length });

      expect(applyFillBlankToEditor(editor)).toBe(true);
      const question = findQuestion(editor);
      const assessment = FillBlanksPrivateAssessmentSchema.parse(question.attrs["assessment"]);
      const createdBlank = descendantsOfType(question.toJSON(), "fill_blank").find(
        (blank) =>
          assessment.blanksById[String(blank.attrs?.["id"])]?.acceptedAnswers[0] === "evidence",
      );

      expect(createdBlank).toBeDefined();
      expect(assessment.blanksById[String(createdBlank?.attrs?.["id"])]).toMatchObject({
        acceptedAnswers: ["evidence"],
      });
    } finally {
      editor.destroy();
    }
  });
});

function requireDefinition() {
  const definition = builtInSurfaceVariantRegistry.get("slide-fill-blanks-question");
  if (!definition) throw new Error("Expected slide-fill-blanks-question Surface definition.");
  return definition;
}

function createAuthoringEditor() {
  const surface = requireDefinition().createSurface({
    surfaceId: EmbeddedNodeIdSchema.parse("surface00001"),
  });
  const question = surface.content?.[0];
  if (!question) throw new Error("Expected Fill in Blanks question content.");
  const body = question.content?.find((child) => child.type === "fill_blanks_body");
  if (!body) throw new Error("Expected Fill in Blanks body.");

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
                  attrs: { ...question.attrs, id: "target000001" },
                  content: (question.content ?? []).map((child) =>
                    child.type === "fill_blanks_body"
                      ? {
                          ...body,
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Use evidence to complete this." }],
                            },
                          ],
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

function findQuestion(editor: Editor) {
  let question = editor.state.doc;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "surface_fill_blanks_question") return true;
    question = node;
    return false;
  });
  return question;
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
