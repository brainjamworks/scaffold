// @vitest-environment happy-dom

import { render, screen, waitFor } from "@testing-library/react";
import { Editor, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { McqNode } from "@/editor/blocks/assessment/mcq/node";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createAssessmentRuntimeTestRoot } from "@/runtime/assessment/test-utils";

import { AssessmentActionsGroupNode } from "./assessment-actions-group";
import { AssessmentChoicesGroupNode } from "./assessment-choices-group";
import { AssessmentHintNode } from "./assessment-hint";
import { AssessmentHintsGroupNode } from "./assessment-hints-group";
import { AssessmentInstructionsNode } from "./assessment-instructions";
import { AssessmentPromptNode } from "./assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "./assessment-summary-feedback";
import { AssessmentTitleNode } from "./assessment-title";
import { SelectableChoiceBodyNode, SelectableChoiceNode } from "./selectable-choice";

afterEach(() => {
  vi.restoreAllMocks();
});

function makeEditor(content: JSONContent): Editor {
  return new Editor({
    editable: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentChoicesGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SelectableChoiceBodyNode,
      SelectableChoiceNode,
      McqNode,
    ],
    content,
  });
}

function paragraph(text?: string): JSONContent {
  if (!text) return { type: "paragraph" };
  return {
    type: "paragraph",
    content: [{ type: "text", text }],
  };
}

function mcqDoc({
  title,
  instructions,
}: { title?: string; instructions?: string } = {}): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "mcq",
        attrs: { id: "problem-1", settings: { points: 3 } },
        content: [
          { type: "assessment_title", content: [paragraph(title)] },
          { type: "assessment_instructions", content: [paragraph(instructions)] },
          {
            type: "assessment_prompt",
            content: [paragraph("Which number is prime?")],
          },
          {
            type: "assessment_choices_group",
            content: [
              {
                type: "selectable_choice",
                attrs: { id: "choice-1" },
                content: [
                  {
                    type: "selectable_choice_body",
                    content: [paragraph("7")],
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

describe("assessment metadata", () => {
  it("resolves points from the assessment node without a block registry", async () => {
    const editor = makeEditor(mcqDoc());

    render(createAssessmentRuntimeTestRoot({ children: <EditorContent editor={editor} /> }));

    expect(await screen.findByText("3 POINTS")).toBeInTheDocument();
    expect(screen.queryByText("MULTIPLE CHOICE")).toBeNull();
    expect(screen.queryByText("CHOOSE ONE")).toBeNull();
    editor.destroy();
  });

  it("renders persisted title and instructions with points", async () => {
    const editor = makeEditor(
      mcqDoc({
        title: "Primes quiz",
        instructions: "Select the best answer.",
      }),
    );

    render(createAssessmentRuntimeTestRoot({ children: <EditorContent editor={editor} /> }));

    expect(await screen.findByText("Primes quiz")).toBeInTheDocument();
    expect(screen.getByText("Select the best answer.")).toBeInTheDocument();
    expect(screen.getByText("3 POINTS")).toBeInTheDocument();
    editor.destroy();
  });

  it("makes each clipped metadata field independently focusable for its marquee", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains("sc-course-assessment-meta-content--inline") ? 120 : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
      function (this: HTMLElement) {
        if (this.tagName !== "P") return 0;
        return (this.textContent?.length ?? 0) * 10;
      },
    );
    const editor = makeEditor(
      mcqDoc({
        title: "A deliberately long assessment title",
        instructions: "Complete every response before checking your work.",
      }),
    );

    render(createAssessmentRuntimeTestRoot({ children: <EditorContent editor={editor} /> }));

    const title = (await screen.findByText("A deliberately long assessment title")).closest(
      '[data-slot="assessment-title"]',
    );
    const instructions = screen
      .getByText("Complete every response before checking your work.")
      .closest('[data-slot="assessment-instructions"]');

    await waitFor(() => {
      expect(title).toHaveAttribute("data-course-overflow", "true");
      expect(instructions).toHaveAttribute("data-course-overflow", "true");
    });
    expect(title).toHaveAttribute("tabindex", "0");
    expect(instructions).toHaveAttribute("tabindex", "0");
    expect(title).toHaveAccessibleName("A deliberately long assessment title");
    expect(instructions).toHaveAccessibleName(
      "Complete every response before checking your work. 3 POINTS",
    );
    editor.destroy();
  });
});
