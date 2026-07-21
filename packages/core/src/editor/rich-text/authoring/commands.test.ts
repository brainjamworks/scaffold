// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  DropdownChoiceLabelNode,
  DropdownChoicesGroupNode,
  DropdownChoiceNode,
  dropdownChoiceLabelContent,
} from "@/editor/blocks/assessment/dropdown/dropdown-choice";
import { DropdownNode } from "@/editor/blocks/assessment/dropdown/node";
import { McqNode } from "@/editor/blocks/assessment/mcq/node";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentChoicesGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  SelectableChoiceBodyNode,
  SelectableChoiceNode,
} from "@/editor/blocks/assessment/shared/nodes/selectable-choice";
import { MathInlineNode } from "@/editor/rich-text/math/authoring/MathInlineNodeView";
import { InlineIconAuthoringNode } from "@/editor/rich-text/inline-icon/authoring/InlineIconAuthoringNode";
import { catalogIconValue } from "@/schemas/media/icon";
import {
  SurfaceHeaderFooterSlotNode,
  SurfaceHeaderNode,
} from "@/editor/surfaces/model/nodes/header-footer-slots";
import { createFieldContentEditorExtensions } from "@/editor/rich-text/authoring/field-content-extensions";
import {
  applyInlineIconToEditor,
  applyInlineMathToEditor,
  canApplyInlineIconToEditor,
  selectedInlineMath,
  selectedInlineIcon,
  setInlineIconSizeInEditor,
} from "./commands";

function makeAssessmentEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      MathInlineNode,
      InlineIconAuthoringNode,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentActionsGroupNode,
      AssessmentHintNode,
      AssessmentChoicesGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SelectableChoiceBodyNode,
      SelectableChoiceNode,
      DropdownChoiceLabelNode,
      DropdownChoiceNode,
      DropdownChoicesGroupNode,
      McqNode,
      DropdownNode,
    ],
  });
}

function makeHeaderFooterEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      MathInlineNode,
      InlineIconAuthoringNode,
      SurfaceHeaderNode,
      SurfaceHeaderFooterSlotNode,
    ],
  });
}

function makeNestedFieldContentEditor() {
  return new Editor({
    extensions: createFieldContentEditorExtensions(),
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Nested field text" }],
        },
      ],
    },
  });
}

function emptyContent(type: string) {
  return { type, content: [{ type: "paragraph" }] };
}

function emptyAssessmentActions() {
  return {
    type: "assessment_actions_group",
    content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
  };
}

function selectText(editor: Editor, text: string) {
  const from = textPos(editor, text);
  editor.commands.setTextSelection({ from, to: from + text.length });
}

function textPos(editor: Editor, text: string): number {
  let from: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (from !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;
    from = pos + index;
    return false;
  });

  if (from === null) throw new Error(`Text not found: ${text}`);
  return from;
}

function setHeaderFooterContent(editor: Editor) {
  editor.commands.setContent({
    type: "doc",
    content: [
      {
        type: "surface_header",
        content: [
          {
            type: "surface_header_footer_slot",
            attrs: { position: "left" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Left" }],
              },
            ],
          },
          {
            type: "surface_header_footer_slot",
            attrs: { position: "center" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Center" }],
              },
            ],
          },
          {
            type: "surface_header_footer_slot",
            attrs: { position: "right" },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Right" }],
              },
            ],
          },
        ],
      },
    ],
  });
}

function selectAcrossHeaderFooterSlots(editor: Editor) {
  const from = textPos(editor, "Left");
  const to = textPos(editor, "Center") + "Center".length;
  editor.commands.setTextSelection({ from, to });
}

function headerFooterSlotPositions(editor: Editor): unknown[] {
  const header = editor.getJSON().content?.[0] as JSONContent | undefined;
  return header?.content?.map((slot) => slot.attrs?.["position"]) ?? [];
}

function insertMathAtSelection(editor: Editor, latex: string) {
  const { from, to } = editor.state.selection;
  return applyInlineMathToEditor(
    editor,
    { from, to, latex: editor.state.doc.textBetween(from, to), mode: "insert" },
    latex,
  );
}

function insertIconAtSelection(editor: Editor, iconName: string) {
  const { from, to } = editor.state.selection;
  return applyInlineIconToEditor(
    editor,
    { from, to, value: null, size: "sm", mode: "insert" },
    catalogIconValue(iconName),
  );
}

describe("applyInlineMathToEditor", () => {
  it("inserts and updates inline math inside a nested field-content editor", () => {
    const editor = makeNestedFieldContentEditor();

    selectText(editor, "Nested");
    expect(insertMathAtSelection(editor, "n^2")).toBe(true);

    const selected = selectedInlineMath(editor);
    expect(selected).toMatchObject({
      mode: "update",
      latex: "n^2",
    });
    expect(selected ? applyInlineMathToEditor(editor, selected, "n^3") : false).toBe(true);

    const paragraph = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(paragraph?.content?.[0]).toMatchObject({
      type: "inlineMath",
      attrs: { latex: "n^3" },
    });
    editor.destroy();
  });

  it("inserts inline math inside an MCQ choice", () => {
    const editor = makeAssessmentEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "mcq",
          content: [
            emptyContent("assessment_title"),
            emptyContent("assessment_instructions"),
            emptyContent("assessment_prompt"),
            {
              type: "assessment_choices_group",
              content: [
                {
                  type: "selectable_choice",
                  attrs: { id: "a" },
                  content: [
                    {
                      type: "selectable_choice_body",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "A" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            emptyAssessmentActions(),
          ],
        },
      ],
    });

    selectText(editor, "A");
    expect(insertMathAtSelection(editor, "\\int x\\,dx")).toBe(true);

    const json = editor.getJSON() as JSONContent;
    const root = json.content?.[0] as JSONContent | undefined;
    const choicesGroup = root?.content?.[3] as JSONContent | undefined;
    const choice = choicesGroup?.content?.[0] as JSONContent | undefined;
    const body = choice?.content?.[0] as JSONContent | undefined;
    const paragraph = body?.content?.[0] as JSONContent | undefined;
    expect(paragraph?.content?.[0]).toMatchObject({
      type: "inlineMath",
      attrs: { latex: "\\int x\\,dx" },
    });
    editor.destroy();
  });

  it("inserts inline math inside a dropdown choice", () => {
    const editor = makeAssessmentEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "dropdown",
          content: [
            emptyContent("assessment_title"),
            emptyContent("assessment_instructions"),
            emptyContent("assessment_prompt"),
            {
              type: "dropdown_choices_group",
              content: [
                {
                  type: "dropdown_choice",
                  attrs: { id: "a", isCorrect: true },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent("A"),
                    },
                  ],
                },
              ],
            },
            emptyAssessmentActions(),
          ],
        },
      ],
    });

    selectText(editor, "A");
    expect(insertMathAtSelection(editor, "\\frac{1}{5}")).toBe(true);

    const json = editor.getJSON() as JSONContent;
    const root = json.content?.[0] as JSONContent | undefined;
    const choicesGroup = root?.content?.[3] as JSONContent | undefined;
    const choice = choicesGroup?.content?.[0] as JSONContent | undefined;
    const label = choice?.content?.[0] as JSONContent | undefined;
    const paragraph = label?.content?.[0] as JSONContent | undefined;
    expect(paragraph?.content?.[0]).toMatchObject({
      type: "inlineMath",
      attrs: { latex: "\\frac{1}{5}" },
    });
    editor.destroy();
  });

  it("does not replace across header/footer slots", () => {
    const editor = makeHeaderFooterEditor();
    setHeaderFooterContent(editor);
    selectAcrossHeaderFooterSlots(editor);

    expect(insertMathAtSelection(editor, "x")).toBe(false);
    expect(headerFooterSlotPositions(editor)).toEqual(["left", "center", "right"]);
    expect(JSON.stringify(editor.getJSON())).not.toContain("inlineMath");

    editor.destroy();
  });
});

describe("applyInlineIconToEditor", () => {
  it("is available in nested field-content editors and updates selected icons", () => {
    const editor = makeNestedFieldContentEditor();

    selectText(editor, "field");
    expect(canApplyInlineIconToEditor(editor)).toBe(true);
    expect(insertIconAtSelection(editor, "lightbulb")).toBe(true);

    const selected = selectedInlineIcon(editor);
    expect(selected).toMatchObject({
      mode: "update",
      size: "sm",
      value: { kind: "catalog", name: "lightbulb" },
    });
    expect(
      selected
        ? applyInlineIconToEditor(editor, selected, catalogIconValue("graduation-cap"), "lg")
        : false,
    ).toBe(true);

    const paragraph = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(paragraph?.content?.[1]).toMatchObject({
      type: "inlineIcon",
      attrs: {
        size: "lg",
        value: { kind: "catalog", name: "graduation-cap" },
      },
    });
    editor.destroy();
  });

  it("inserts inline icons inside an MCQ choice", () => {
    const editor = makeAssessmentEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "mcq",
          content: [
            emptyContent("assessment_title"),
            emptyContent("assessment_instructions"),
            emptyContent("assessment_prompt"),
            {
              type: "assessment_choices_group",
              content: [
                {
                  type: "selectable_choice",
                  attrs: { id: "a" },
                  content: [
                    {
                      type: "selectable_choice_body",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "A" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            emptyAssessmentActions(),
          ],
        },
      ],
    });

    selectText(editor, "A");
    expect(insertIconAtSelection(editor, "university")).toBe(true);

    const json = editor.getJSON() as JSONContent;
    const root = json.content?.[0] as JSONContent | undefined;
    const choicesGroup = root?.content?.[3] as JSONContent | undefined;
    const choice = choicesGroup?.content?.[0] as JSONContent | undefined;
    const body = choice?.content?.[0] as JSONContent | undefined;
    const paragraph = body?.content?.[0] as JSONContent | undefined;
    expect(paragraph?.content?.[0]).toMatchObject({
      type: "inlineIcon",
      attrs: {
        size: "sm",
        value: { kind: "catalog", name: "university" },
      },
    });
    editor.destroy();
  });

  it("inserts inline icons inside a dropdown choice", () => {
    const editor = makeAssessmentEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "dropdown",
          content: [
            emptyContent("assessment_title"),
            emptyContent("assessment_instructions"),
            emptyContent("assessment_prompt"),
            {
              type: "dropdown_choices_group",
              content: [
                {
                  type: "dropdown_choice",
                  attrs: { id: "a", isCorrect: true },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent("A"),
                    },
                  ],
                },
              ],
            },
            emptyAssessmentActions(),
          ],
        },
      ],
    });

    selectText(editor, "A");
    expect(insertIconAtSelection(editor, "graduation-cap")).toBe(true);

    const json = editor.getJSON() as JSONContent;
    const root = json.content?.[0] as JSONContent | undefined;
    const choicesGroup = root?.content?.[3] as JSONContent | undefined;
    const choice = choicesGroup?.content?.[0] as JSONContent | undefined;
    const label = choice?.content?.[0] as JSONContent | undefined;
    const paragraph = label?.content?.[0] as JSONContent | undefined;
    expect(paragraph?.content?.[0]).toMatchObject({
      type: "inlineIcon",
      attrs: {
        size: "sm",
        value: { kind: "catalog", name: "graduation-cap" },
      },
    });
    editor.destroy();
  });

  it("does not replace across header/footer slots", () => {
    const editor = makeHeaderFooterEditor();
    setHeaderFooterContent(editor);
    selectAcrossHeaderFooterSlots(editor);

    expect(insertIconAtSelection(editor, "university")).toBe(false);
    expect(headerFooterSlotPositions(editor)).toEqual(["left", "center", "right"]);
    expect(JSON.stringify(editor.getJSON())).not.toContain("inlineIcon");

    editor.destroy();
  });

  it("updates the selected inline icon size", () => {
    const editor = makeAssessmentEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "mcq",
          content: [
            emptyContent("assessment_title"),
            emptyContent("assessment_instructions"),
            emptyContent("assessment_prompt"),
            {
              type: "assessment_choices_group",
              content: [
                {
                  type: "selectable_choice",
                  attrs: { id: "a" },
                  content: [
                    {
                      type: "selectable_choice_body",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "A" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            emptyAssessmentActions(),
          ],
        },
      ],
    });

    selectText(editor, "A");
    expect(insertIconAtSelection(editor, "university")).toBe(true);

    const target = selectedInlineIcon(editor);
    expect(target).not.toBeNull();
    expect(target ? setInlineIconSizeInEditor(editor, target, "lg") : false).toBe(true);

    const json = editor.getJSON() as JSONContent;
    const root = json.content?.[0] as JSONContent | undefined;
    const choicesGroup = root?.content?.[3] as JSONContent | undefined;
    const choice = choicesGroup?.content?.[0] as JSONContent | undefined;
    const body = choice?.content?.[0] as JSONContent | undefined;
    const paragraph = body?.content?.[0] as JSONContent | undefined;
    expect(paragraph?.content?.[0]).toMatchObject({
      type: "inlineIcon",
      attrs: {
        size: "lg",
        value: { kind: "catalog", name: "university" },
      },
    });
    expect(selectedInlineIcon(editor)?.size).toBe("lg");
    editor.destroy();
  });
});
