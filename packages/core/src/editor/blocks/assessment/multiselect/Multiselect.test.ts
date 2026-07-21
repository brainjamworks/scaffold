// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Editor, Node as TiptapNode } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createAssessmentRuntimeTestRoot } from "@/runtime/assessment/test-utils";

import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { AUTHORING_FRAME_ATTR } from "@/editor/interactions/dom/authoring-frame";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentActionsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group-runtime";
import { AssessmentChoicesGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group";
import { AssessmentChoicesGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group-runtime";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SelectableChoiceBodyNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import { SelectableChoiceAuthoringNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice-authoring";
import { SelectableChoiceRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/selectable-choice-runtime";

import { multiselectBlockDefinition } from "./multiselect-definition";
import { MultiselectAuthoringExtension } from "./multiselect-authoring-extension";
import { MultiselectRuntimeExtension } from "./multiselect-runtime-extension";

const BoundedRegionTestNode = TiptapNode.create({
  name: "region",
  group: "block",
  content: "block+",
  selectable: false,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-node="region"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", { ...HTMLAttributes, "data-node": "region" }, 0];
  },
});

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([multiselectBlockDefinition.nodeType]),
      BoundedRegionTestNode,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentChoicesGroupNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SelectableChoiceBodyNode,
      SelectableChoiceAuthoringNode,
      MultiselectAuthoringExtension,
    ],
  });
}

function makeRuntimeEditor() {
  return new Editor({
    editable: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([multiselectBlockDefinition.nodeType]),
      BoundedRegionTestNode,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentChoicesGroupRuntimeNode,
      AssessmentActionsGroupRuntimeNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SelectableChoiceBodyNode,
      SelectableChoiceRuntimeNode,
      MultiselectRuntimeExtension,
    ],
  });
}

function choice(id: string, _isCorrect: boolean, text?: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [
          text ? { type: "paragraph", content: [{ type: "text", text }] } : { type: "paragraph" },
        ],
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

function assessmentActions(): JSONContent {
  return {
    type: "assessment_actions_group",
    content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
  };
}

function multiselectDoc(attrs: Record<string, unknown> = {}): JSONContent {
  return {
    type: "multiselect",
    attrs: {
      id: "block-multiselect-test",
      assessment: {
        correctOptionIds: ["a"],
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
      ...attrs,
    },
    content: [
      { type: "assessment_title", content: [{ type: "paragraph" }] },
      { type: "assessment_instructions", content: [{ type: "paragraph" }] },
      { type: "assessment_prompt", content: [{ type: "paragraph" }] },
      {
        type: "assessment_choices_group",
        content: [choice("a", true), choice("b", false)],
      },
      assessmentActions(),
    ],
  };
}

function selectFirstNode(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
}

function renderAssessmentEditor(editor: Editor) {
  return render(
    createAssessmentRuntimeTestRoot({
      children: createElement(EditorContent, { editor }),
    }),
  );
}

describe("composite multiselect node", () => {
  afterEach(() => {
    cleanup();
    document.body.replaceChildren();
  });

  it("declares bounded fill placement", () => {
    expect(multiselectBlockDefinition.boundedPlacement).toBe("fill");
  });

  it("round-trips a full composite tree across settings attrs", () => {
    const editor = makeEditor();
    const doc = {
      type: "doc",
      content: [
        {
          type: "multiselect",
          attrs: {
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: false,
              legend: "Pick all primes",
              points: 3,
              maxAttempts: 2,
              maxSelect: 2,
            },
            assessment: {
              correctOptionIds: ["b", "c"],
              feedbackByOptionId: {},
              summaryFeedback: richFeedback("Nice."),
            },
          },
          content: [
            {
              type: "assessment_title",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Primes" }],
                },
              ],
            },
            {
              type: "assessment_instructions",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Pick every prime." }],
                },
              ],
            },
            {
              type: "assessment_prompt",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Q?" }] }],
            },
            {
              type: "assessment_choices_group",
              content: [choice("a", false, "4"), choice("b", true, "7"), choice("c", true, "11")],
            },
            {
              type: "assessment_actions_group",
              content: [
                {
                  type: "assessment_hints_group",
                  content: [
                    {
                      type: "assessment_hint",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Hint" }],
                        },
                      ],
                    },
                  ],
                },
                { type: "assessment_summary_feedback" },
              ],
            },
          ],
        },
      ],
    };
    editor.commands.setContent(doc);
    const json = editor.getJSON();
    const ms = json.content?.[0] as JSONContent | undefined;
    expect(ms?.attrs?.["quick"]).toBeUndefined();
    expect(ms?.attrs).not.toHaveProperty("data");
    expect(ms?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: false,
      legend: "Pick all primes",
      points: 3,
      maxAttempts: 2,
      maxSelect: 2,
    });
    expect(ms?.attrs?.["assessment"]).toMatchObject({
      correctOptionIds: ["b", "c"],
      feedbackByOptionId: {},
      summaryFeedback: richFeedback("Nice."),
    });
    expect(ms?.content?.length).toBe(5);
    const children = ms?.content as JSONContent[] | undefined;
    expect(children?.[3]?.type).toBe("assessment_choices_group");
    expect(children?.[4]?.type).toBe("assessment_actions_group");
    expect(children?.[4]?.content?.map((child) => child.type)).toEqual([
      "assessment_hints_group",
      "assessment_summary_feedback",
    ]);
    const choices = children?.[3]?.content as JSONContent[] | undefined;
    expect(choices?.[1]?.attrs).toEqual({ id: "b" });
    expect(choices?.[2]?.attrs).toEqual({ id: "c" });
    editor.destroy();
  });

  it("parses defaults when attrs are absent", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "multiselect",
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "assessment_choices_group",
              content: [choice("a", false)],
            },
            assessmentActions(),
          ],
        },
      ],
    });
    const json = editor.getJSON();
    const ms = json.content?.[0] as JSONContent | undefined;
    expect(ms?.attrs?.["quick"]).toBeUndefined();
    expect(ms?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
      maxSelect: null,
    });
    editor.destroy();
  });

  it("renders a block drag handle when the multiselect is selected", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "multiselect",
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "assessment_choices_group",
              content: [choice("a", true)],
            },
            assessmentActions(),
          ],
        },
      ],
    });

    selectFirstNode(editor);
    renderAssessmentEditor(editor);

    expect(screen.queryByRole("button", { name: "Move multi-select" })).toBeNull();
    expect(document.body.querySelector("[data-authoring-move-handle]")).toBeNull();

    editor.destroy();
  });

  it("renders the learner multiselect with a runtime frame instead of authoring chrome", async () => {
    const editor = makeRuntimeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "multiselect",
          attrs: { id: "block-multiselect-runtime" },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "assessment_choices_group",
              content: [choice("a", true), choice("b", false)],
            },
            assessmentActions(),
          ],
        },
      ],
    });

    renderAssessmentEditor(editor);

    await waitFor(() => {
      expect(
        document.body.querySelector(
          '[data-runtime-frame="block"][data-id="block-multiselect-runtime"]',
        ),
      ).toBeInstanceOf(HTMLElement);
    });
    expect(document.body.querySelector("[data-authoring-frame-wrapper]")).toBeNull();

    editor.destroy();
  });

  it("marks bounded authoring multiselect choices as the internal scroll lane", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-authoring" },
          content: [multiselectDoc({ id: "block-multiselect-bounded-authoring" })],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-multiselect-bounded-authoring"]`,
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element?.getAttribute("data-bounded-placement")).toBe("fill");
      return element;
    });
    const shell = frame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const choices = frame?.querySelector<HTMLElement>('[data-slot="assessment-choices-group"]');
    const scrollLane = choices?.querySelector<HTMLElement>("[data-assessment-bounded-scroll]");
    const hint = choices?.querySelector<HTMLElement>("[data-assessment-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(choices).toBeInstanceOf(HTMLElement);
    expect(choices?.getAttribute("data-assessment-bounded-scroll-frame")).toBe("");
    expect(choices?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-assessment-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(shell?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);

    editor.destroy();
  });

  it("marks bounded runtime multiselect choices as the internal scroll lane", async () => {
    const editor = makeRuntimeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-runtime" },
          content: [multiselectDoc({ id: "block-multiselect-bounded-runtime" })],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-runtime-frame="block"][data-id="block-multiselect-bounded-runtime"]',
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element?.getAttribute("data-bounded-placement")).toBe("fill");
      return element;
    });
    const shell = frame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const choices = frame?.querySelector<HTMLElement>('[data-slot="assessment-choices-group"]');
    const scrollLane = choices?.querySelector<HTMLElement>("[data-assessment-bounded-scroll]");
    const hint = choices?.querySelector<HTMLElement>("[data-assessment-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(choices).toBeInstanceOf(HTMLElement);
    expect(choices?.getAttribute("data-assessment-bounded-scroll-frame")).toBe("");
    expect(choices?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-assessment-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(shell?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);

    editor.destroy();
  });
});
