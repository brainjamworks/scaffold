import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { describe, expect, it } from "vite-plus/test";

import { AssessmentChoicesGroupNode } from "../nodes/assessment-choices-group";
import { AssessmentActionsGroupNode } from "../nodes/assessment-actions-group";
import { AssessmentHintNode } from "../nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "../nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "../nodes/assessment-instructions";
import { AssessmentPromptNode } from "../nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "../nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "../nodes/assessment-title";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SelectableChoiceBodyNode, SelectableChoiceNode } from "../nodes/selectable-choice";

import { McqNode } from "@/editor/blocks/assessment/mcq/node";
import { createTestNodeIdentityExtension } from "@/editor/testing/node-identity";

import {
  readAssessmentFeedbackContent,
  resolveAssessmentAttrParent,
  richTextDocumentToAssessmentFeedback,
} from "./private-assessment-attrs";

function makeEditor(content: JSONContent): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      createTestNodeIdentityExtension(),
      ExtendedParagraph,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentChoicesGroupNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SelectableChoiceBodyNode,
      SelectableChoiceNode,
      McqNode,
    ],
    content,
  });
}

function paragraph(text = ""): JSONContent {
  return {
    type: "paragraph",
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

function mcqDoc(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "mcq",
        attrs: {
          id: "mcq000000001",
          assessment: { correctChoiceId: "option000001" },
        },
        content: [
          { type: "assessment_title", content: [paragraph()] },
          { type: "assessment_instructions", content: [paragraph()] },
          { type: "assessment_prompt", content: [paragraph("Prompt")] },
          {
            type: "assessment_choices_group",
            content: [
              {
                type: "selectable_choice",
                attrs: { id: "option000001" },
                content: [
                  {
                    type: "selectable_choice_body",
                    content: [paragraph("Choice")],
                  },
                ],
              },
            ],
          },
          {
            type: "assessment_actions_group",
            content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
          },
        ],
      },
    ],
  };
}

describe("resolveAssessmentAttrParent", () => {
  it("converts Tiptap rich text through the canonical feedback contract", () => {
    const feedback = richTextDocumentToAssessmentFeedback({
      type: "doc",
      content: [paragraph("Private authored feedback")],
    });

    expect(AssessmentFeedbackContentSchema.parse(feedback)).toEqual(feedback);
    expect(readAssessmentFeedbackContent(feedback)).toEqual(feedback);
  });

  it("returns null for stale positions outside the current document", () => {
    const editor = makeEditor(mcqDoc());

    expect(resolveAssessmentAttrParent(editor, editor.state.doc.content.size + 1)).toBeNull();

    editor.destroy();
  });

  it("resolves the nearest assessment attrs parent for valid child positions", () => {
    const editor = makeEditor(mcqDoc());
    let summaryFeedbackPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "assessment_summary_feedback") {
        summaryFeedbackPos = pos;
      }
    });

    const parent = resolveAssessmentAttrParent(editor, summaryFeedbackPos!);

    expect(parent?.typeName).toBe("mcq");
    expect(parent?.node.attrs["id"]).toBe("mcq000000001");
    editor.destroy();
  });
});
