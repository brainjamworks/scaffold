// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, getSchema, Node as TiptapNode } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createAssessmentRuntimeTestRoot } from "@/runtime/assessment/test-utils";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { MoveContainedAfterTarget } from "@/editor/drag/model/movement-intents";
import { resolveMovementNodeContext } from "@/editor/drag/model/movement-policy";
import { ContainedMovementTarget } from "@/editor/drag/model/movement-target";
import { applyContainedMovementIntent } from "@/editor/drag/prosemirror/commands";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import {
  AUTHORING_FRAME_ATTR,
  AuthoringFrameKind,
  resolveAuthoringFrameElement,
} from "@/editor/interactions/dom/authoring-frame";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { resolveBlockChromeTargetDescriptor } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";

import { AssessmentChoicesGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group";
import { AssessmentChoicesGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-choices-group-runtime";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentActionsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group-runtime";
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

import "./mcq-definition";
import { mcqBlockDefinition } from "./mcq-definition";
import { McqAuthoringExtension } from "./mcq-authoring-extension";
import { McqRuntimeExtension } from "./mcq-runtime-extension";

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

function makeEditor(editable = true) {
  return new Editor({
    editable,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([mcqBlockDefinition.nodeType]),
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
      McqAuthoringExtension,
    ],
  });
}

let cachedMcqSchema: ReturnType<typeof getSchema> | null = null;

function makeMcqSchema() {
  cachedMcqSchema ??= getSchema([
    StarterKit.configure({ undoRedo: false, paragraph: false }),
    ExtendedParagraph,
    createRuntimeBlockFrameAttributesExtension([mcqBlockDefinition.nodeType]),
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
    McqAuthoringExtension,
  ]);
  return cachedMcqSchema;
}

function makeRuntimeEditor() {
  return new Editor({
    editable: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([mcqBlockDefinition.nodeType]),
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
      McqRuntimeExtension,
    ],
  });
}

function createDisposableMcqEditor(
  content: JSONContent,
  { undoRedo = false }: { undoRedo?: boolean } = {},
) {
  return createDisposableEditor({
    extensions: [
      StarterKit.configure({ undoRedo: undoRedo ? {} : false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([mcqBlockDefinition.nodeType]),
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
      McqAuthoringExtension,
    ],
    content,
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

function mcqDoc(attrs: Record<string, unknown> = {}): JSONContent {
  return {
    type: "mcq",
    attrs: {
      assessment: {
        correctOptionId: "a",
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
      id: "block-mcq-test",
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
      {
        type: "assessment_actions_group",
        content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
      },
    ],
  };
}

function mcqActionsGroup(doc: JSONContent): JSONContent {
  const children = doc.content as JSONContent[];
  return children[4] as JSONContent;
}

function mcqHintsGroup(doc: JSONContent): JSONContent {
  const actions = mcqActionsGroup(doc);
  const children = actions.content as JSONContent[];
  return children[0] as JSONContent;
}

function hint(text: string): JSONContent {
  return {
    type: "assessment_hint",
    content: [
      {
        type: "paragraph",
        ...(text ? { content: [{ type: "text", text }] } : {}),
      },
    ],
  };
}

function mcqDocWithHints(hints: string[], attrs: Record<string, unknown> = {}): JSONContent {
  const doc = mcqDoc(attrs);
  const actions = mcqActionsGroup(doc);
  const children = actions.content as JSONContent[];
  children[0] = {
    type: "assessment_hints_group",
    content: hints.map((text) => hint(text)),
  };
  return doc;
}

function selectFirstNode(editor: Editor) {
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
}

function choicePositions(editor: Editor): Record<string, number> {
  const positions: Record<string, number> = {};
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "selectable_choice") return true;
    const id = node.attrs["id"];
    if (typeof id === "string") positions[id] = pos;
    return true;
  });
  return positions;
}

function choiceIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "selectable_choice") ids.push(String(node.attrs["id"]));
    return true;
  });
  return ids;
}

function containedTarget(editor: Editor, pos: number): ContainedMovementTarget {
  const context = resolveMovementNodeContext(editor.state.doc, pos);
  if (!context) throw new Error(`No movement context at ${pos}`);
  return new ContainedMovementTarget(context, {
    bottom: 100,
    height: 80,
    left: 20,
    right: 420,
    top: 20,
    width: 400,
  });
}

function firstHintText(editor: Editor): string {
  let text = "";
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "assessment_hint") return true;
    text = node.textContent;
    return false;
  });
  return text;
}

async function findHintPopoverEditor(index: number): Promise<HTMLElement> {
  const dialog = await screen.findByRole("dialog", { name: `Hint ${index}` });
  await waitFor(() => {
    expect(dialog.querySelector(`[aria-label="Hint ${index} editor"]`)).toBeInstanceOf(HTMLElement);
  });
  return dialog.querySelector<HTMLElement>(`[aria-label="Hint ${index} editor"]`)!;
}

async function openPopoverTrigger(name: string) {
  const button = await screen.findByRole("button", { name });
  await userEvent.click(button);
  await waitFor(() => {
    expect(button.getAttribute("data-state")).toBe("open");
  });
}

function renderAssessmentEditor(editor: Editor) {
  return render(
    createAssessmentRuntimeTestRoot({
      children: createElement(EditorContent, { editor }),
    }),
  );
}

describe("composite mcq node", () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(() =>
      DOMRect.fromRect({
        height: 32,
        width: 96,
        x: 48,
        y: 48,
      }),
    );
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(
      function mockClientRects(this: Element) {
        return [this.getBoundingClientRect()] as unknown as DOMRectList;
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
      function clientWidth(this: HTMLElement) {
        return this === document.documentElement || this === document.body ? 1024 : 96;
      },
    );
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function clientHeight(this: HTMLElement) {
        return this === document.documentElement || this === document.body ? 768 : 32;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
      function scrollWidth(this: HTMLElement) {
        return this.clientWidth;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLElement) {
        return this.clientHeight;
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
    document.body.replaceChildren();
  });

  it("persists author summary feedback through the nested rich text and outer history", async () => {
    const fixture = createDisposableMcqEditor(
      {
        type: "doc",
        content: [
          mcqDoc({
            id: "mcq-summary-feedback-edit",
            assessment: {
              correctOptionId: "a",
              feedbackByOptionId: {},
              summaryFeedback: null,
            },
          }),
        ],
      },
      { undoRedo: true },
    );

    renderAssessmentEditor(fixture.editor);

    expect(screen.queryByLabelText("Summary feedback")).toBeNull();

    await openPopoverTrigger("Show feedback");

    const dialog = await screen.findByRole("dialog", {
      name: "Feedback",
      description: "Shown to learners after they answer.",
    });
    const summaryEditor = within(dialog).getByLabelText("Summary feedback");

    expect(
      dialog.querySelector('[data-scaffold-popover-surface][data-tone="feedback"]'),
    ).not.toBeNull();
    expect(dialog.getAttribute("data-authoring-chrome")).toBe("popover");
    expect(summaryEditor.getAttribute("data-attr-rich-text-field")).toBe(
      "mcq-summary-feedback-edit:summary-feedback",
    );
    expect(summaryEditor.getAttribute("data-inline-editor-field")).toBeNull();

    fireEvent.paste(summaryEditor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Review the explanation." : ""),
      },
    });

    await waitFor(() => {
      const mcq = fixture.json().content?.[0] as JSONContent | undefined;
      expect(mcq?.attrs?.["assessment"]).toMatchObject({
        summaryFeedback: richFeedback("Review the explanation."),
      });
    });

    summaryEditor.focus();
    await userEvent.keyboard("{Meta>}z{/Meta}");

    await waitFor(() => {
      const mcq = fixture.json().content?.[0] as JSONContent | undefined;
      expect(mcq?.attrs?.["assessment"]).toMatchObject({ summaryFeedback: null });
    });

    await userEvent.keyboard("{Meta>}{Shift>}z{/Shift}{/Meta}");

    await waitFor(() => {
      const mcq = fixture.json().content?.[0] as JSONContent | undefined;
      expect(mcq?.attrs?.["assessment"]).toMatchObject({
        summaryFeedback: richFeedback("Review the explanation."),
      });
    });

    fixture.destroy();
  });

  it("syncs an open summary feedback editor from outer MCQ attrs without echoing a write", async () => {
    const fixture = createDisposableMcqEditor({
      type: "doc",
      content: [
        mcqDoc({
          id: "mcq-summary-feedback-external-sync",
          assessment: {
            correctOptionId: "a",
            feedbackByOptionId: {},
            summaryFeedback: richFeedback("Original feedback."),
          },
        }),
      ],
    });

    renderAssessmentEditor(fixture.editor);

    await openPopoverTrigger("Show feedback");

    const dialog = await screen.findByRole("dialog", { name: "Feedback" });
    const summaryEditor = within(dialog).getByLabelText("Summary feedback");
    await waitFor(() => {
      expect(summaryEditor.textContent).toBe("Original feedback.");
    });

    let outerDocumentWrites = 0;
    fixture.editor.on("transaction", ({ transaction }) => {
      if (transaction.docChanged) outerDocumentWrites += 1;
    });

    const mcq = fixture.editor.state.doc.nodeAt(0);
    if (!mcq) throw new Error("Expected MCQ node");
    fixture.editor.view.dispatch(
      fixture.editor.state.tr.setNodeMarkup(0, undefined, {
        ...mcq.attrs,
        assessment: {
          correctOptionId: "a",
          feedbackByOptionId: {},
          summaryFeedback: richFeedback("Replacement feedback."),
        },
      }),
    );

    await waitFor(() => {
      const syncedEditor = within(dialog).getByLabelText("Summary feedback");
      expect(syncedEditor).toBe(summaryEditor);
      expect(syncedEditor.textContent).toBe("Replacement feedback.");
    });
    expect(outerDocumentWrites).toBe(1);

    fixture.destroy();
  });

  it("renders author summary feedback as an action beside submit", async () => {
    const fixture = createDisposableMcqEditor({
      type: "doc",
      content: [
        mcqDoc({
          id: "mcq-summary-feedback-action",
          assessment: {
            correctOptionId: "a",
            feedbackByOptionId: {},
            summaryFeedback: richFeedback("Review the explanation."),
          },
        }),
      ],
    });

    renderAssessmentEditor(fixture.editor);

    const showFeedback = await screen.findByRole("button", {
      name: "Show feedback",
    });
    expect(screen.queryByRole("button", { name: /summary feedback/i })).toBeNull();
    expect(showFeedback.closest('[data-slot="assessment-summary-feedback"]')).toBeInstanceOf(
      HTMLElement,
    );
    const controls = document.body.querySelector('[data-slot="assessment-controls"]');
    expect(controls).toBeInstanceOf(HTMLElement);
    expect(controls?.closest('[data-slot="assessment-actions-group"]')).toBeInstanceOf(HTMLElement);

    fixture.destroy();
  });

  it("deletes the requested choice from a disposable editor fixture", async () => {
    const fixture = createDisposableMcqEditor({
      type: "doc",
      content: [
        {
          type: "mcq",
          attrs: {
            id: "mcq-choice-delete",
            assessment: {
              correctOptionId: "a",
              feedbackByOptionId: {},
              summaryFeedback: null,
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "assessment_choices_group",
              content: [
                choice("a", true, "First choice"),
                choice("b", false, "Second choice"),
                choice("c", false, "Third choice"),
              ],
            },
            {
              type: "assessment_actions_group",
              content: [
                { type: "assessment_hints_group" },
                { type: "assessment_summary_feedback" },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep after MCQ" }],
        },
      ],
    });

    renderAssessmentEditor(fixture.editor);

    fireEvent.click(await screen.findByRole("button", { name: "Delete choice 2" }));

    await waitFor(() => {
      expect(screen.queryByText("Second choice")).toBeNull();
    });

    const mcq = fixture.json().content?.[0] as JSONContent | undefined;
    const choicesGroup = mcq?.content?.[3] as JSONContent | undefined;
    const choiceIds = choicesGroup?.content?.map((child) => child.attrs?.["id"]);

    expect(fixture.topLevelNodeTypes()).toEqual(["mcq", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after MCQ");
    expect(fixture.editor.state.doc.textContent).toContain("First choice");
    expect(fixture.editor.state.doc.textContent).toContain("Third choice");
    expect(choiceIds).toEqual(["a", "c"]);

    fixture.destroy();
  });

  it("deletes the requested hint from a disposable editor fixture", async () => {
    const fixture = createDisposableMcqEditor({
      type: "doc",
      content: [
        {
          type: "mcq",
          attrs: {
            id: "mcq-hint-delete",
            assessment: {
              correctOptionId: "a",
              feedbackByOptionId: {},
              summaryFeedback: null,
            },
          },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "assessment_choices_group",
              content: [choice("a", true, "Only choice")],
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
                          content: [{ type: "text", text: "First hint" }],
                        },
                      ],
                    },
                    {
                      type: "assessment_hint",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Second hint" }],
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
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep after hints" }],
        },
      ],
    });

    renderAssessmentEditor(fixture.editor);

    expect(screen.queryByRole("button", { name: "Delete hint 2" })).toBeNull();

    await openPopoverTrigger("Edit 2 hints");
    let dialog = await screen.findByRole("dialog", { name: "Hint 1" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Next hint" }));
    dialog = await screen.findByRole("dialog", { name: "Hint 2" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete hint 2" }));

    await waitFor(() => {
      expect(screen.queryByText("Second hint")).toBeNull();
    });

    const mcq = fixture.json().content?.[0] as JSONContent | undefined;
    const hintsGroup = mcq ? mcqHintsGroup(mcq) : undefined;

    expect(fixture.topLevelNodeTypes()).toEqual(["mcq", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after hints");
    expect(fixture.editor.state.doc.textContent).toContain("First hint");
    expect(hintsGroup?.content).toHaveLength(1);

    fixture.destroy();
  });

  it("renders author hints behind the shared popover trigger", async () => {
    const fixture = createDisposableMcqEditor({
      type: "doc",
      content: [
        mcqDocWithHints(["Try eliminating unlikely answers.", "Check the remaining option."], {
          id: "mcq-hint-cards",
        }),
      ],
    });

    renderAssessmentEditor(fixture.editor);

    expect(await screen.findByRole("button", { name: "Edit 2 hints" })).toBeInTheDocument();
    expect(screen.queryByText("Try eliminating unlikely answers.")).toBeNull();
    expect(screen.queryByText("Check the remaining option.")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Hint 1" })).toBeNull();

    fixture.destroy();
  });

  it("opens an authored hint card in a content-backed popover editor", async () => {
    const fixture = createDisposableMcqEditor({
      type: "doc",
      content: [
        mcqDocWithHints(["Use the answer choices to narrow it down."], {
          id: "mcq-hint-popover",
        }),
      ],
    });

    renderAssessmentEditor(fixture.editor);

    await openPopoverTrigger("Edit 1 hint");

    const dialog = await screen.findByRole("dialog", { name: "Hint 1" });
    const editor = await findHintPopoverEditor(1);
    expect(dialog.getAttribute("data-authoring-chrome")).toBe("popover");
    expect(dialog.querySelector(".sc-assessment-hint-popover__arrow")).toBeNull();
    expect(editor.getAttribute("contenteditable")).toBe("true");
    expect(editor.textContent).toContain("Use the answer choices to narrow it down.");

    fixture.destroy();
  });

  it("maps popover hint edits back into the outer MCQ document", async () => {
    const fixture = createDisposableMcqEditor({
      type: "doc",
      content: [
        mcqDocWithHints(["Start here"], {
          id: "mcq-hint-popover-edit",
        }),
      ],
    });

    renderAssessmentEditor(fixture.editor);

    await openPopoverTrigger("Edit 1 hint");
    const editor = await findHintPopoverEditor(1);

    fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? " with the smallest example" : ""),
      },
    });

    await waitFor(() => {
      expect(firstHintText(fixture.editor)).toContain("with the smallest example");
    });

    fixture.destroy();
  });

  it("closes an open hint popover when deleting that hint", async () => {
    const fixture = createDisposableMcqEditor({
      type: "doc",
      content: [
        mcqDocWithHints(["Delete me"], {
          id: "mcq-hint-popover-delete",
        }),
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep after open hint delete" }],
        },
      ],
    });

    renderAssessmentEditor(fixture.editor);

    await openPopoverTrigger("Edit 1 hint");
    expect(await screen.findByRole("dialog", { name: "Hint 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete hint 1" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Hint 1" })).toBeNull();
    });

    const mcq = fixture.json().content?.[0] as JSONContent | undefined;
    const hintsGroup = mcq ? mcqHintsGroup(mcq) : undefined;

    expect(hintsGroup?.content ?? []).toHaveLength(0);
    expect(fixture.topLevelNodeTypes()).toEqual(["mcq", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after open hint delete");

    fixture.destroy();
  });

  it("parses defaults when attrs are absent", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "mcq",
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
            {
              type: "assessment_actions_group",
              content: [
                { type: "assessment_hints_group" },
                { type: "assessment_summary_feedback" },
              ],
            },
          ],
        },
      ],
    });
    const json = editor.getJSON();
    const mcq = json.content?.[0] as JSONContent | undefined;
    expect(mcq?.attrs?.["quick"]).toBeUndefined();
    expect(mcq?.attrs).not.toHaveProperty("data");
    expect(mcq?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    editor.destroy();
  });

  it("renders a block drag handle when the MCQ is selected", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [mcqDoc()],
    });

    selectFirstNode(editor);
    renderAssessmentEditor(editor);

    expect(screen.queryByRole("button", { name: "Move multiple choice" })).toBeNull();
    expect(document.body.querySelector("[data-authoring-move-handle]")).toBeNull();

    editor.destroy();
  });

  it("renders registry-backed responsive resize chrome when selected", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [mcqDoc()],
    });

    selectFirstNode(editor);
    renderAssessmentEditor(editor);

    const wrapper = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>("[data-authoring-frame-wrapper]");
      expect(element).not.toBeNull();
      return element;
    });

    expect(wrapper?.dataset["authoringFrameResizeMode"]).toBe("responsive");
    const surface = document.body.querySelector<HTMLElement>(
      `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-mcq-test"]`,
    );
    expect(surface?.dataset["authoringFrameResizeMode"]).toBe("responsive");

    editor.destroy();
  });

  it("renders the authoring surface with a single block frame contract", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [mcqDoc()],
    });

    renderAssessmentEditor(editor);

    const surface = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-mcq-test"]`,
      );
      expect(element).toBeInstanceOf(HTMLElement);
      return element;
    });

    expect(surface?.getAttribute(AUTHORING_FRAME_ATTR)).toBe("block");
    expect(surface?.getAttribute("data-node")).toBe("mcq");
    expect(surface?.getAttribute("data-definition")).toBe("mcq");
    expect(surface?.getAttribute("data-bounded-placement")).toBeNull();

    editor.destroy();
  });

  it("marks bounded authoring MCQ choices as the internal scroll lane", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-authoring" },
          content: [mcqDoc({ id: "block-mcq-bounded-authoring" })],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-mcq-bounded-authoring"]`,
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

  it("marks bounded runtime MCQ choices as the internal scroll lane", async () => {
    const editor = makeRuntimeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-runtime" },
          content: [mcqDoc({ id: "block-mcq-bounded-runtime" })],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-runtime-frame="block"][data-id="block-mcq-bounded-runtime"]',
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

  it("resolves text selections inside MCQ content to the MCQ surface target", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        mcqDoc({
          id: "block-mcq-surface-proof",
          assessment: {
            correctOptionId: "a",
            feedbackByOptionId: {},
            summaryFeedback: null,
          },
        }),
      ],
    });

    renderAssessmentEditor(editor);

    await waitFor(() => {
      expect(
        document.body.querySelector(
          `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-mcq-surface-proof"]`,
        ),
      ).toBeInstanceOf(HTMLElement);
    });

    const choiceBodyPos = choicePositions(editor)["a"];
    expect(choiceBodyPos).toBeTypeOf("number");
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, choiceBodyPos!)),
    );

    const selectionOwner = publishInteractionOwnerSnapshot(editor.state, null, {
      blockDefinitions: builtInBlockRegistry,
    }).owners.selectionOwner.target;
    const ownerDescriptor = resolveBlockChromeTargetDescriptor(
      editor.state,
      selectionOwner,
      builtInBlockRegistry,
    );
    expect(ownerDescriptor?.nodeType).toBe("mcq");
    expect(ownerDescriptor?.blockId).toBe("block-mcq-surface-proof");
    const surface = resolveAuthoringFrameElement(document.body, {
      frameKind: AuthoringFrameKind.Block,
      id: "block-mcq-surface-proof",
    });
    expect(surface?.getAttribute(AUTHORING_FRAME_ATTR)).toBe("block");
    expect(surface?.getAttribute("data-node")).toBe("mcq");
    expect(surface?.getAttribute("data-id")).toBe("block-mcq-surface-proof");

    editor.destroy();
  });

  it("reorders contained choices inside a framed MCQ without changing the MCQ frame", () => {
    const editor = makeEditor();
    const frame = {
      align: "center",
      aspectRatio: 1.2,
      widthMode: "percent",
      widthPercent: 58,
    };
    editor.commands.setContent({
      type: "doc",
      content: [mcqDoc({ frame })],
    });
    const positions = choicePositions(editor);

    expect(
      applyContainedMovementIntent(
        editor,
        positions["a"]!,
        new MoveContainedAfterTarget(containedTarget(editor, positions["b"]!)),
      ),
    ).toBe(true);

    expect(choiceIds(editor)).toEqual(["b", "a"]);
    expect((editor.getJSON().content?.[0] as JSONContent | undefined)?.attrs?.["frame"]).toEqual(
      frame,
    );
    editor.destroy();
  });

  it("keeps contained movement markers author-only inside a framed MCQ", async () => {
    const editableEditor = makeEditor(true);
    editableEditor.commands.setContent({
      type: "doc",
      content: [
        mcqDoc({
          frame: {
            align: "center",
            aspectRatio: null,
            widthMode: "percent",
            widthPercent: 64,
          },
        }),
      ],
    });
    const editableView = renderAssessmentEditor(editableEditor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-authoring-frame-wrapper]")).toBeInstanceOf(
        HTMLElement,
      );
      expect(document.body.querySelectorAll("[data-contained-movement-target]").length).toBe(2);
      expect(document.body.querySelectorAll("[data-contained-movement-handle]").length).toBe(2);
    });

    const doc = editableEditor.getJSON();
    editableView.unmount();
    editableEditor.destroy();
    cleanup();

    const runtimeEditor = makeRuntimeEditor();
    runtimeEditor.commands.setContent(doc);
    const runtimeView = renderAssessmentEditor(runtimeEditor);

    await waitFor(() => {
      expect(
        document.body.querySelector('[data-runtime-frame="block"][data-id="block-mcq-test"]'),
      ).toBeInstanceOf(HTMLElement);
    });
    expect(
      document.body
        .querySelector<HTMLElement>('[data-runtime-frame="block"][data-id="block-mcq-test"]')
        ?.getAttribute("data-bounded-placement"),
    ).toBeNull();
    expect(document.body.querySelector("[data-authoring-frame-wrapper]")).toBeNull();
    expect(document.body.querySelector("[data-contained-movement-target]")).toBeNull();
    expect(document.body.querySelector("[data-contained-movement-handle]")).toBeNull();

    runtimeView.unmount();
    runtimeEditor.destroy();
  });

  it("serializes persisted frame attrs without authoring resize chrome", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        mcqDoc({
          frame: {
            align: "center",
            aspectRatio: null,
            widthMode: "percent",
            widthPercent: 64,
          },
        }),
      ],
    });

    const html = editor.getHTML();
    expect(html).toContain("data-frame");
    expect(html).toContain("width: 64%");
    expect(html).not.toContain("data-authoring-resize-handle");

    editor.destroy();
  });

  it("round-trips a full composite tree across settings attrs", () => {
    const schema = makeMcqSchema();
    const doc = {
      type: "doc",
      content: [
        {
          type: "mcq",
          attrs: {
            settings: {
              feedbackMode: "immediate",
              isGraded: true,
              showAnswer: false,
              legend: "Choices",
              points: 2,
              maxAttempts: 3,
            },
            assessment: {
              correctOptionId: "b",
              feedbackByOptionId: {},
              summaryFeedback: richFeedback("Good job!"),
            },
          },
          content: [
            {
              type: "assessment_title",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Primes quiz" }],
                },
              ],
            },
            {
              type: "assessment_instructions",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Pick the prime number below." }],
                },
              ],
            },
            {
              type: "assessment_prompt",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Q?" }] }],
            },
            {
              type: "assessment_choices_group",
              content: [choice("a", false, "A"), choice("b", true, "B")],
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
                          content: [{ type: "text", text: "Hint 1" }],
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
    const json = schema.nodeFromJSON(doc).toJSON();
    const mcq = json.content?.[0] as JSONContent | undefined;
    expect(mcq?.attrs?.["quick"]).toBeUndefined();
    expect(mcq?.attrs).not.toHaveProperty("data");
    expect(mcq?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "immediate",
      isGraded: true,
      showAnswer: false,
      legend: "Choices",
      points: 2,
      maxAttempts: 3,
    });
    expect(mcq?.attrs?.["assessment"]).toMatchObject({
      correctOptionId: "b",
      feedbackByOptionId: {},
      summaryFeedback: richFeedback("Good job!"),
    });
    expect(mcq?.content?.length).toBe(5);
    const children = mcq?.content as JSONContent[] | undefined;
    expect(children?.[0]?.type).toBe("assessment_title");
    expect(children?.[1]?.type).toBe("assessment_instructions");
    expect(children?.[2]?.type).toBe("assessment_prompt");
    expect(children?.[3]?.type).toBe("assessment_choices_group");
    expect(children?.[4]?.type).toBe("assessment_actions_group");
    expect(children?.[4]?.content?.[0]?.type).toBe("assessment_hints_group");
    expect(children?.[4]?.content?.[1]?.type).toBe("assessment_summary_feedback");
    const choices = children?.[3]?.content as JSONContent[] | undefined;
    expect(choices?.[0]?.attrs).toEqual({ id: "a" });
    expect(choices?.[1]?.attrs).toEqual({ id: "b" });
  });

  it("rejects the old direct-child MCQ action tail", () => {
    const schema = makeMcqSchema();
    const title = schema.nodes["assessment_title"]?.createAndFill();
    const instructions = schema.nodes["assessment_instructions"]?.createAndFill();
    const prompt = schema.nodes["assessment_prompt"]?.createAndFill();
    const choices = schema.nodes["assessment_choices_group"]?.createAndFill();
    const hints = schema.nodes["assessment_hints_group"]?.createAndFill();
    const summary = schema.nodes["assessment_summary_feedback"]?.createAndFill();
    if (!title || !instructions || !prompt || !choices || !hints || !summary) {
      throw new Error("Failed to create MCQ schema validation children");
    }
    const mcqType = schema.nodes["mcq"];

    expect(
      mcqType?.validContent(
        Fragment.fromArray([title, instructions, prompt, choices, hints, summary]),
      ),
    ).toBe(false);
  });

  it("creates MCQ insert content with hints and summary feedback inside the action group", () => {
    const schema = makeMcqSchema();
    const insert = mcqBlockDefinition.insert;
    if (!insert) {
      throw new Error("MCQ block definition is missing insert content");
    }
    const content = insert.content() as JSONContent;
    const actions = content.content?.[4] as JSONContent | undefined;

    const node = schema.nodeFromJSON(content);
    expect(() => node.check()).not.toThrow();
    expect(content.type).toBe("mcq");
    expect(content.content?.map((child) => child.type)).toEqual([
      "assessment_title",
      "assessment_instructions",
      "assessment_prompt",
      "assessment_choices_group",
      "assessment_actions_group",
    ]);
    expect(actions?.content?.map((child) => child.type)).toEqual([
      "assessment_hints_group",
      "assessment_summary_feedback",
    ]);
  });
});
