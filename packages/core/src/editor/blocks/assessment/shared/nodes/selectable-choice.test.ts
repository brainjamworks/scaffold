// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { closeHistory } from "@tiptap/pm/history";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { AssessmentPort } from "@/host/ports";
import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";

import { AssessmentActionsGroupNode } from "./assessment-actions-group";
import { AssessmentActionsGroupRuntimeNode } from "./assessment-actions-group-runtime";
import { AssessmentChoicesGroupNode } from "./assessment-choices-group";
import { AssessmentChoicesGroupRuntimeNode } from "./assessment-choices-group-runtime";
import { AssessmentHintNode } from "./assessment-hint";
import { AssessmentHintRuntimeNode } from "./assessment-hint-runtime";
import { AssessmentHintsGroupNode } from "./assessment-hints-group";
import { AssessmentHintsGroupRuntimeNode } from "./assessment-hints-group-runtime";
import { AssessmentInstructionsNode } from "./assessment-instructions";
import { AssessmentPromptNode } from "./assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "./assessment-summary-feedback";
import { AssessmentSummaryFeedbackRuntimeNode } from "./assessment-summary-feedback-runtime";
import { AssessmentTitleNode } from "./assessment-title";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { SelectableChoiceBodyNode, toggleChoiceCorrect } from "./selectable-choice";
import { SelectableChoiceAuthoringNode } from "./selectable-choice-authoring";
import {
  resolveAssessmentChoiceScrollTop,
  SelectableChoiceRuntimeNode,
} from "./selectable-choice-runtime";

import "@/editor/blocks/assessment/mcq/mcq-definition";
import "@/editor/blocks/assessment/multiselect/multiselect-definition";
import { McqAuthoringExtension } from "@/editor/blocks/assessment/mcq/mcq-authoring-extension";
import { McqRuntimeExtension } from "@/editor/blocks/assessment/mcq/mcq-runtime-extension";
import { MultiselectAuthoringExtension } from "@/editor/blocks/assessment/multiselect/multiselect-authoring-extension";
import { MultiselectRuntimeExtension } from "@/editor/blocks/assessment/multiselect/multiselect-runtime-extension";

const canonicalAssessmentResult = { maxScore: 1 as const, feedback: null, items: {} };

function makeEditor(
  choices: Array<{ id: string; isCorrect: boolean; text?: string }>,
  editable = true,
  blockType: "mcq" | "multiselect" = "mcq",
  settings: Partial<{
    feedbackMode: "immediate" | "on_submit";
    isGraded: boolean;
    showAnswer: boolean;
    points: number;
    maxAttempts: number | null;
    maxSelect: number | null;
    legend: string;
  }> = {},
  includeHistory = false,
) {
  const assessment =
    blockType === "mcq"
      ? {
          correctOptionId: choices.find((choice) => choice.isCorrect)?.id ?? null,
          feedbackByOptionId: {},
          summaryFeedback: null,
        }
      : {
          correctOptionIds: choices.filter((choice) => choice.isCorrect).map((choice) => choice.id),
          feedbackByOptionId: {},
          summaryFeedback: null,
        };
  const editor = new Editor({
    editable,
    extensions: [
      StarterKit.configure({ undoRedo: includeHistory ? {} : false, paragraph: false }),
      ExtendedParagraph,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      editable ? AssessmentHintNode : AssessmentHintRuntimeNode,
      editable ? AssessmentChoicesGroupNode : AssessmentChoicesGroupRuntimeNode,
      editable ? AssessmentActionsGroupNode : AssessmentActionsGroupRuntimeNode,
      editable ? AssessmentHintsGroupNode : AssessmentHintsGroupRuntimeNode,
      editable ? AssessmentSummaryFeedbackNode : AssessmentSummaryFeedbackRuntimeNode,
      SelectableChoiceBodyNode,
      editable ? SelectableChoiceAuthoringNode : SelectableChoiceRuntimeNode,
      editable ? McqAuthoringExtension : McqRuntimeExtension,
      editable ? MultiselectAuthoringExtension : MultiselectRuntimeExtension,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: blockType,
          attrs: {
            id: `${blockType}-1`,
            assessment,
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: true,
              points: 1,
              maxAttempts: null,
              legend: "",
              ...settings,
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
              content: choices.map((c) => ({
                type: "selectable_choice",
                attrs: { id: c.id },
                content: [
                  {
                    type: "selectable_choice_body",
                    content: [
                      c.text
                        ? {
                            type: "paragraph",
                            content: [{ type: "text", text: c.text }],
                          }
                        : { type: "paragraph" },
                    ],
                  },
                ],
              })),
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
    },
  });
  return editor;
}

function mcqBlock(
  id: string,
  choices: Array<{ id: string; isCorrect: boolean; text?: string }>,
): JSONContent {
  return {
    type: "mcq",
    attrs: {
      id,
      assessment: {
        correctOptionId: choices.find((choice) => choice.isCorrect)?.id ?? null,
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 1,
        maxAttempts: null,
        legend: "",
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
        content: choices.map((choice) => ({
          type: "selectable_choice",
          attrs: { id: choice.id },
          content: [
            {
              type: "selectable_choice_body",
              content: [
                choice.text
                  ? {
                      type: "paragraph",
                      content: [{ type: "text", text: choice.text }],
                    }
                  : { type: "paragraph" },
              ],
            },
          ],
        })),
      },
      {
        type: "assessment_actions_group",
        content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
      },
    ],
  };
}

function renderRuntimeEditor(editor: Editor, assessmentPort: AssessmentPort) {
  render(
    createAssessmentRuntimeTestRoot({
      assessment: assessmentPort,
      children: createElement(EditorContent, { editor }),
      onStore: captureAssessmentStore,
    }),
  );
}

let assessmentStore: AssessmentStoreApi | null = null;
function captureAssessmentStore(store: AssessmentStoreApi | null) {
  assessmentStore = store;
}

function renderAssessmentEditor(editor: Editor) {
  return render(
    createAssessmentRuntimeTestRoot({
      children: createElement(EditorContent, { editor }),
      onStore: captureAssessmentStore,
    }),
  );
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

function selectVisibleText(element: HTMLElement, text: string): void {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let textNode: Text | null = null;
  let startOffset = -1;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!(node instanceof Text)) continue;
    const offset = node.data.indexOf(text);
    if (offset === -1) continue;
    textNode = node;
    startOffset = offset;
    break;
  }

  if (!textNode) throw new Error(`Text not found: ${text}`);

  const range = document.createRange();
  range.setStart(textNode, startOffset);
  range.setEnd(textNode, startOffset + text.length);
  element.focus();
  fireEvent.focus(element);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  fireEvent.mouseUp(element);
}

beforeEach(() => {
  assessmentStore = null;
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
  document.body.innerHTML = "";
});

function getChoices(editor: Editor): Array<{ id: string; isCorrect: boolean }> {
  const block = editor.getJSON().content?.[0] as JSONContent | undefined;
  const assessment = block?.attrs?.["assessment"] as
    | { correctOptionId?: string | null; correctOptionIds?: string[] }
    | undefined;
  const group = (block?.content ?? []).find((n) => n.type === "assessment_choices_group") as
    | JSONContent
    | undefined;
  return ((group?.content ?? []) as JSONContent[]).map((c) => ({
    id: String(c.attrs?.["id"] ?? ""),
    isCorrect:
      assessment?.correctOptionId === c.attrs?.["id"] ||
      Boolean(assessment?.correctOptionIds?.includes(String(c.attrs?.["id"] ?? ""))),
  }));
}

function choiceIdsByBlockId(editor: Editor, blockId: string): string[] {
  const block = (editor.getJSON().content ?? []).find((node) => node.attrs?.["id"] === blockId) as
    | JSONContent
    | undefined;
  const group = (block?.content ?? []).find((node) => node.type === "assessment_choices_group") as
    | JSONContent
    | undefined;
  return ((group?.content ?? []) as JSONContent[]).map((choice) =>
    String(choice.attrs?.["id"] ?? ""),
  );
}

function topLevelNodeCount(editor: Editor, typeName: string): number {
  return (editor.getJSON().content ?? []).filter((node) => node.type === typeName).length;
}

function choicePosByIndex(editor: Editor, idx: number): number {
  let found: number | null = null;
  let seen = 0;
  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== "selectable_choice") return undefined;
    if (seen === idx) {
      found = pos;
      return false;
    }
    seen += 1;
    return false;
  });
  if (found === null) throw new Error(`no selectable_choice at index ${idx}`);
  return found;
}

describe("runtime selectable choice bounded scrolling", () => {
  it("resolves the scroll position needed to reveal a runtime choice", () => {
    expect(
      resolveAssessmentChoiceScrollTop({
        currentScrollTop: 0,
        laneBottom: 100,
        laneTop: 0,
        targetBottom: 184,
        targetTop: 140,
      }),
    ).toBe(92);

    expect(
      resolveAssessmentChoiceScrollTop({
        currentScrollTop: 120,
        laneBottom: 220,
        laneTop: 120,
        targetBottom: 104,
        targetTop: 60,
      }),
    ).toBe(52);

    expect(
      resolveAssessmentChoiceScrollTop({
        currentScrollTop: 24,
        laneBottom: 100,
        laneTop: 0,
        targetBottom: 84,
        targetTop: 16,
      }),
    ).toBe(24);

    expect(
      resolveAssessmentChoiceScrollTop({
        currentScrollTop: 0,
        laneBottom: 100,
        laneTop: 0,
        targetBottom: 220,
        targetTop: 120,
      }),
    ).toBe(112);
  });

  it("scrolls submitted and revealed MCQ choices into the bounded runtime lane", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
      ],
      false,
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              a: { correct: false, expected: false, given: true },
              b: { correct: false, expected: true, given: false },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: { kind: "single-select", correctOptionId: "b", feedbackByOptionId: {} },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, "artifact:artifact-1/block:mcq-1")).toBe(
        true,
      );
    });

    document
      .querySelector<HTMLElement>('.sc-assessment-node-view[data-node="mcq"]')
      ?.setAttribute("data-bounded-placement", "fill");
    const lane = document.querySelector<HTMLElement>("[data-assessment-bounded-scroll]");
    expect(lane).toBeInstanceOf(HTMLElement);

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function clientHeight(this: HTMLElement) {
        if (this.hasAttribute("data-assessment-bounded-scroll")) return 100;
        return this === document.documentElement || this === document.body ? 768 : 32;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLElement) {
        if (this.hasAttribute("data-assessment-bounded-scroll")) return 300;
        return this.clientHeight;
      },
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: Element) {
        const element = this as HTMLElement;
        if (element.hasAttribute("data-assessment-bounded-scroll")) {
          return DOMRect.fromRect({ height: 100, width: 400, x: 0, y: 0 });
        }

        const choiceId = element.getAttribute("data-choice-id");
        if (choiceId === "a") {
          return DOMRect.fromRect({ height: 44, width: 400, x: 0, y: 140 });
        }
        if (choiceId === "b") {
          return DOMRect.fromRect({ height: 44, width: 400, x: 0, y: 220 });
        }

        return DOMRect.fromRect({ height: 32, width: 96, x: 48, y: 48 });
      },
    );

    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(lane?.scrollTop).toBe(92);
    });

    lane!.scrollTop = 0;
    fireEvent.click(screen.getByRole("button", { name: "Show correct answer" }));

    await waitFor(() => {
      expect(lane?.scrollTop).toBe(172);
    });

    editor.destroy();
  });

  it("scrolls the full multiselect submitted and revealed choice set in the bounded runtime lane", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: false, text: "Beta" },
        { id: "c", isCorrect: true, text: "Gamma" },
        { id: "d", isCorrect: true, text: "Delta" },
      ],
      false,
      "multiselect",
      { maxSelect: 2 },
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              b: { correct: false, expected: false, given: true },
              c: { correct: true, expected: true, given: true },
              d: { correct: false, expected: true, given: false },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "multi-select",
          correctOptionIds: ["c", "d"],
          feedbackByOptionId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(
        hasAssessmentRegistration(assessmentStore, "artifact:artifact-1/block:multiselect-1"),
      ).toBe(true);
    });

    document
      .querySelector<HTMLElement>('.sc-assessment-node-view[data-node="multiselect"]')
      ?.setAttribute("data-bounded-placement", "fill");
    const lane = document.querySelector<HTMLElement>("[data-assessment-bounded-scroll]");
    expect(lane).toBeInstanceOf(HTMLElement);

    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(
      function clientHeight(this: HTMLElement) {
        if (this.hasAttribute("data-assessment-bounded-scroll")) return 140;
        return this === document.documentElement || this === document.body ? 768 : 32;
      },
    );
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(
      function scrollHeight(this: HTMLElement) {
        if (this.hasAttribute("data-assessment-bounded-scroll")) return 400;
        return this.clientHeight;
      },
    );
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: Element) {
        const element = this as HTMLElement;
        if (element.hasAttribute("data-assessment-bounded-scroll")) {
          return DOMRect.fromRect({ height: 140, width: 400, x: 0, y: 0 });
        }

        const choiceId = element.getAttribute("data-choice-id");
        if (choiceId === "a") {
          return DOMRect.fromRect({ height: 44, width: 400, x: 0, y: 40 });
        }
        if (choiceId === "b") {
          return DOMRect.fromRect({ height: 44, width: 400, x: 0, y: 160 });
        }
        if (choiceId === "c") {
          return DOMRect.fromRect({ height: 44, width: 400, x: 0, y: 208 });
        }
        if (choiceId === "d") {
          return DOMRect.fromRect({ height: 44, width: 400, x: 0, y: 256 });
        }

        return DOMRect.fromRect({ height: 32, width: 96, x: 48, y: 48 });
      },
    );

    fireEvent.click(screen.getByText("Beta"));
    fireEvent.click(screen.getByText("Gamma"));
    fireEvent.click(screen.getByText("Delta"));

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: "Beta",
          checked: true,
          description: /selected answer/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", {
          name: "Gamma",
          checked: true,
          description: /selected answer/i,
        }),
      ).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Delta", checked: false })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(lane?.scrollTop).toBe(120);
    });

    expect(
      screen.getByRole("checkbox", {
        name: "Beta",
        checked: true,
        description: /submitted answer, incorrect/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "Gamma",
        checked: true,
        description: /submitted answer, correct/i,
      }),
    ).toBeInTheDocument();

    lane!.scrollTop = 0;
    fireEvent.click(screen.getByRole("button", { name: "Show correct answer" }));

    await waitFor(() => {
      expect(lane?.scrollTop).toBe(168);
    });
    expect(
      screen.getByRole("checkbox", {
        name: "Delta",
        checked: false,
        description: /correct answer/i,
      }),
    ).toBeInTheDocument();

    editor.destroy();
  });
});

describe("toggleChoiceCorrect — radio mode (MCQ)", () => {
  it("keeps selectable choices as internal assessment children", () => {
    const editor = makeEditor([{ id: "a", isCorrect: true }]);
    const spec = editor.schema.nodes["selectable_choice"]?.spec;

    expect(spec?.selectable).toBe(false);
    expect(spec?.draggable).toBe(false);

    editor.destroy();
  });

  it("exposes contained movement anchors and handles in editable mode only", async () => {
    const editableEditor = makeEditor([{ id: "a", isCorrect: true }], true);
    const editableView = renderAssessmentEditor(editableEditor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-contained-movement-target]")).toBeInstanceOf(
        HTMLElement,
      );
      expect(document.body.querySelector("[data-contained-movement-handle]")).toBeInstanceOf(
        HTMLElement,
      );
    });
    expect(
      document.body
        .querySelector("[data-contained-movement-handle]")
        ?.getAttribute("contenteditable"),
    ).toBe("false");
    editableView.unmount();
    editableEditor.destroy();
    cleanup();

    const runtimeEditor = makeEditor([{ id: "a", isCorrect: true }], false);
    const runtimeView = renderAssessmentEditor(runtimeEditor);

    expect(document.body.querySelector("[data-contained-movement-target]")).toBeNull();
    expect(document.body.querySelector("[data-contained-movement-handle]")).toBeNull();
    runtimeView.unmount();
    runtimeEditor.destroy();
  });

  it("renders the author per-choice feedback popover in editable mode", async () => {
    const editor = makeEditor([{ id: "a", isCorrect: true, text: "Alpha" }], true);

    renderAssessmentEditor(editor);

    const addFeedback = await screen.findByRole("button", {
      name: "Add feedback",
    });
    fireEvent.click(addFeedback);

    await waitFor(() => {
      expect(Boolean(screen.queryByLabelText("Feedback editor"))).toBe(true);
    });
    expect(Boolean(screen.queryByText("Shown to learners after they answer."))).toBe(true);
    expect(Boolean(screen.queryByRole("button", { name: "Done" }))).toBe(false);
    expect(Boolean(screen.queryByRole("button", { name: "Remove" }))).toBe(false);

    editor.destroy();
  });

  it("persists author per-choice feedback through attr-backed rich text", async () => {
    const editor = makeEditor([{ id: "a", isCorrect: true, text: "Alpha" }], true);

    renderAssessmentEditor(editor);

    fireEvent.click(await screen.findByRole("button", { name: "Add feedback" }));
    const feedbackEditor = await screen.findByLabelText("Feedback editor");

    expect(feedbackEditor.getAttribute("data-attr-rich-text-field")).toBe("assessment:a:feedback");
    expect(feedbackEditor.getAttribute("data-inline-editor-field")).toBeNull();

    fireEvent.paste(feedbackEditor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Try the prime answer." : ""),
      },
    });

    await waitFor(() => {
      const block = editor.getJSON().content?.[0] as JSONContent | undefined;
      expect(block?.attrs?.["assessment"]).toMatchObject({
        feedbackByOptionId: {
          a: richFeedback("Try the prime answer."),
        },
      });
    });

    editor.destroy();
  });

  it("routes author per-choice feedback undo and redo through outer history", async () => {
    const editor = makeEditor([{ id: "a", isCorrect: true, text: "Alpha" }], true, "mcq", {}, true);
    const user = userEvent.setup();

    renderAssessmentEditor(editor);

    await user.click(await screen.findByRole("button", { name: "Add feedback" }));
    const feedbackEditor = await screen.findByLabelText("Feedback editor");
    fireEvent.paste(feedbackEditor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Prime feedback." : ""),
      },
    });

    await waitFor(() => {
      const block = editor.getJSON().content?.[0] as JSONContent | undefined;
      expect(block?.attrs?.["assessment"]).toMatchObject({
        feedbackByOptionId: { a: richFeedback("Prime feedback.") },
      });
    });

    editor.view.dispatch(closeHistory(editor.state.tr));
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: "paragraph",
      content: [{ type: "text", text: "Outer document edit" }],
    });
    expect(editor.getText()).toContain("Outer document edit");

    fireEvent.keyDown(feedbackEditor, { key: "z", metaKey: true });

    await waitFor(() => {
      expect(editor.getText()).not.toContain("Outer document edit");
    });
    expect(editor.getJSON().content?.[0]?.attrs?.["assessment"]).toMatchObject({
      feedbackByOptionId: { a: richFeedback("Prime feedback.") },
    });

    fireEvent.keyDown(feedbackEditor, { key: "z", metaKey: true });

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs?.["assessment"]).toMatchObject({
        feedbackByOptionId: {},
      });
    });

    fireEvent.keyDown(feedbackEditor, { key: "z", metaKey: true, shiftKey: true });

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs?.["assessment"]).toMatchObject({
        feedbackByOptionId: { a: richFeedback("Prime feedback.") },
      });
    });

    fireEvent.keyDown(feedbackEditor, { key: "z", metaKey: true, shiftKey: true });

    await waitFor(() => {
      expect(editor.getText()).toContain("Outer document edit");
    });

    editor.destroy();
  });

  it("shows the shared rich text bubble when an author selects feedback text", async () => {
    const editor = makeEditor([{ id: "a", isCorrect: true, text: "Alpha" }], true);
    const user = userEvent.setup();

    renderAssessmentEditor(editor);

    await user.click(await screen.findByRole("button", { name: "Add feedback" }));
    const feedbackEditor = await screen.findByLabelText("Feedback editor");
    fireEvent.paste(feedbackEditor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Prime feedback." : ""),
      },
    });
    selectVisibleText(feedbackEditor, "Prime");

    const dialog = await screen.findByRole("dialog", { name: "Feedback" });
    expect(
      await within(dialog).findByRole("toolbar", { name: "Text formatting" }),
    ).toBeInTheDocument();

    editor.destroy();
  });

  it("does not add a learner missing-response reason to the author preview submit button", async () => {
    const editor = makeEditor([{ id: "a", isCorrect: true, text: "Alpha" }], true);

    renderAssessmentEditor(editor);

    const submit = await screen.findByRole("button", { name: "Submit" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    expect(
      screen.queryByRole("button", {
        name: "Submit",
        description: /choose an answer before submitting/i,
      }),
    ).toBeNull();

    editor.destroy();
  });

  it("adds choices to the live choices group after the mounted NodeView shifts", async () => {
    const editor = makeEditor([{ id: "a", isCorrect: true, text: "Alpha" }], true);

    renderAssessmentEditor(editor);

    await screen.findByRole("button", { name: "Add choice" });

    editor.commands.insertContentAt(
      0,
      mcqBlock("mcq-before", [{ id: "before", isCorrect: true, text: "Before" }]),
    );

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "Add choice" })).toHaveLength(2);
    });

    const originalBlock = document.body.querySelector<HTMLElement>(
      '[data-node="mcq"][data-id="mcq-1"]',
    );
    if (!originalBlock) throw new Error("expected shifted original MCQ block");

    fireEvent.click(within(originalBlock).getByRole("button", { name: "Add choice" }));

    await waitFor(() => {
      expect(choiceIdsByBlockId(editor, "mcq-1")).toHaveLength(2);
    });
    expect(choiceIdsByBlockId(editor, "mcq-before")).toHaveLength(1);
    expect(topLevelNodeCount(editor, "mcq")).toBe(2);

    editor.destroy();
  });

  it("marking an unchecked choice clears every sibling in one transaction", () => {
    const editor = makeEditor([
      { id: "a", isCorrect: true },
      { id: "b", isCorrect: false },
      { id: "c", isCorrect: false },
    ]);

    const changed = toggleChoiceCorrect(editor, choicePosByIndex(editor, 1));

    expect(changed).toBe(true);
    expect(getChoices(editor)).toEqual([
      { id: "a", isCorrect: false },
      { id: "b", isCorrect: true },
      { id: "c", isCorrect: false },
    ]);
    editor.destroy();
  });

  it("ignores stale choice positions outside the current document", () => {
    const editor = makeEditor([{ id: "a", isCorrect: true }]);

    expect(toggleChoiceCorrect(editor, editor.state.doc.content.size + 1)).toBe(false);

    editor.destroy();
  });

  it("clicking the currently-correct choice is a no-op (at-least-one invariant)", () => {
    const editor = makeEditor([
      { id: "a", isCorrect: true },
      { id: "b", isCorrect: false },
    ]);

    const changed = toggleChoiceCorrect(editor, choicePosByIndex(editor, 0));

    expect(changed).toBe(false);
    expect(getChoices(editor)).toEqual([
      { id: "a", isCorrect: true },
      { id: "b", isCorrect: false },
    ]);
    editor.destroy();
  });

  it("exposes selected, submitted, and revealed answer state through radio semantics", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
      ],
      false,
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              a: {
                correct: false,
                expected: false,
                given: true,
                feedback: richFeedback("Review Alpha."),
              },
              b: { correct: false, expected: true, given: false },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: { kind: "single-select", correctOptionId: "b", feedbackByOptionId: {} },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, "artifact:artifact-1/block:mcq-1")).toBe(
        true,
      );
    });

    fireEvent.click(screen.getByText("Alpha"));
    expect(screen.queryByRole("button", { name: "Show correct answer" })).toBeNull();

    await waitFor(() => {
      expect(
        screen.getByRole("radio", {
          name: "Alpha",
          checked: true,
          description: /selected answer/i,
        }),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Show feedback for Alpha" })).toBeNull();

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(
        screen.getByRole("radio", {
          name: "Alpha",
          checked: true,
          description: /submitted answer, incorrect.*feedback available/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("radio", {
          name: "Beta",
          description: /correct answer/i,
        }),
      ).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Show correct answer" })).toBeInTheDocument();
    expect(
      screen
        .getByRole("button", { name: "Show correct answer" })
        .closest('[data-slot="assessment-controls"]'),
    ).toBeInstanceOf(HTMLElement);

    const feedbackButton = screen.getByRole("button", {
      name: "Show feedback for Alpha",
    });
    fireEvent.click(feedbackButton);

    await waitFor(() => {
      const dialog = screen.getByRole("dialog", { name: "Feedback" });
      expect(
        within(dialog).getByRole("heading", { name: "Feedback", level: 2 }),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("Review Alpha.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Show correct answer" }));

    await waitFor(() => {
      expect(
        screen.getByRole("radio", {
          name: "Beta",
          checked: false,
          description: /correct answer/i,
        }),
      ).toBeInTheDocument();
      const revealedButton = screen.getByRole("button", {
        name: "Correct answer revealed",
      });
      expect((revealedButton as HTMLButtonElement).disabled).toBe(true);
    });

    editor.destroy();
  });

  it("opens runtime summary feedback from a show feedback action", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
      ],
      false,
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            feedback: richFeedback("Review the concept before trying again."),
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, "artifact:artifact-1/block:mcq-1")).toBe(
        true,
      );
    });

    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Show feedback" })).toBeInTheDocument();
    });
    expect(screen.queryByText("Review the concept before trying again.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show feedback" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Feedback" })).toBeInTheDocument();
      expect(screen.getByText("Review the concept before trying again.")).toBeInTheDocument();
    });

    editor.destroy();
  });

  it("explains why runtime MCQ submit is disabled before a response exists", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
      ],
      false,
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Submit",
          description: /choose an answer before submitting/i,
        }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Alpha"));

    await waitFor(() => {
      const submit = screen.getByRole("button", { name: "Submit" });
      expect((submit as HTMLButtonElement).disabled).toBe(false);
      expect(
        screen.queryByRole("button", {
          name: "Submit",
          description: /choose an answer before submitting/i,
        }),
      ).toBeNull();
    });

    editor.destroy();
  });

  it("announces MCQ submission result and attempt count", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
      ],
      false,
      "mcq",
      { maxAttempts: 3 },
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              a: { correct: false, expected: false, given: true },
              b: { correct: false, expected: true, given: false },
            },
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, "artifact:artifact-1/block:mcq-1")).toBe(
        true,
      );
    });

    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(
        screen.getByRole("status", {
          name: "1 of 3 attempts used.",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("Answer submitted. Incorrect.")).toBeInTheDocument();
    });

    editor.destroy();
  });

  it("exposes a named required runtime MCQ choice group", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
      ],
      false,
      "mcq",
      {
        legend: "Choose one option",
      },
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      const group = screen.getByRole("group", { name: "Choose one option" });
      expect(group.getAttribute("aria-required")).toBe("true");
    });

    editor.destroy();
  });

  it("keeps every authored runtime MCQ choice group required", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
      ],
      false,
      "mcq",
      {
        legend: "Choose a response",
      },
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      const group = screen.getByRole("group", { name: "Choose a response" });
      expect(group.getAttribute("aria-required")).toBe("true");
    });

    editor.destroy();
  });
});

describe("toggleChoiceCorrect — checkbox mode (Multiselect)", () => {
  it("exposes selected, submitted, and revealed answer state through checkbox semantics", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
        { id: "c", isCorrect: true, text: "Gamma" },
      ],
      false,
      "multiselect",
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              a: { correct: false, expected: false, given: true },
              b: { correct: true, expected: true, given: true },
              c: { correct: false, expected: true, given: false },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "multi-select",
          correctOptionIds: ["b", "c"],
          feedbackByOptionId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(
        hasAssessmentRegistration(assessmentStore, "artifact:artifact-1/block:multiselect-1"),
      ).toBe(true);
    });

    fireEvent.click(screen.getByText("Alpha"));
    fireEvent.click(screen.getByText("Beta"));
    expect(screen.queryByRole("button", { name: "Show correct answer" })).toBeNull();

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: "Alpha",
          checked: true,
          description: /selected answer/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", {
          name: "Beta",
          checked: true,
          description: /selected answer/i,
        }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: "Alpha",
          checked: true,
          description: /submitted answer, incorrect/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", {
          name: "Beta",
          checked: true,
          description: /submitted answer, correct/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("checkbox", {
          name: "Gamma",
          description: /correct answer/i,
        }),
      ).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Show correct answer" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show correct answer" }));

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: "Gamma",
          checked: false,
          description: /correct answer/i,
        }),
      ).toBeInTheDocument();
      const revealedButton = screen.getByRole("button", {
        name: "Correct answer revealed",
      });
      expect((revealedButton as HTMLButtonElement).disabled).toBe(true);
    });

    editor.destroy();
  });

  it("explains why runtime Multiselect submit is disabled before a response exists", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
      ],
      false,
      "multiselect",
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "Submit",
          description: /choose at least one answer before submitting/i,
        }),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Alpha"));

    await waitFor(() => {
      const submit = screen.getByRole("button", { name: "Submit" });
      expect((submit as HTMLButtonElement).disabled).toBe(false);
      expect(
        screen.queryByRole("button", {
          name: "Submit",
          description: /choose at least one answer before submitting/i,
        }),
      ).toBeNull();
    });

    editor.destroy();
  });

  it("exposes a named required runtime Multiselect choice group when configured", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
      ],
      false,
      "multiselect",
      {
        legend: "Choose all that apply",
      },
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: 1 },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      const group = screen.getByRole("group", {
        name: "Choose all that apply",
      });
      expect(group.getAttribute("aria-required")).toBe("true");
    });

    editor.destroy();
  });

  it("announces final attempt state after a terminal Multiselect submission", async () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: false, text: "Alpha" },
        { id: "b", isCorrect: true, text: "Beta" },
      ],
      false,
      "multiselect",
      { maxAttempts: 1 },
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: true,
            score: 1,
            items: {
              b: { correct: true, expected: true, given: true },
            },
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(
        hasAssessmentRegistration(assessmentStore, "artifact:artifact-1/block:multiselect-1"),
      ).toBe(true);
    });

    fireEvent.click(screen.getByText("Beta"));
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(
        screen.getByRole("status", {
          name: "Final attempt used.",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("Answer submitted. Correct.")).toBeInTheDocument();
    });

    editor.destroy();
  });

  it("marking an unchecked choice adds it without disturbing siblings", () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: true },
        { id: "b", isCorrect: false },
        { id: "c", isCorrect: false },
      ],
      true,
      "multiselect",
    );

    const changed = toggleChoiceCorrect(editor, choicePosByIndex(editor, 2));

    expect(changed).toBe(true);
    expect(getChoices(editor)).toEqual([
      { id: "a", isCorrect: true },
      { id: "b", isCorrect: false },
      { id: "c", isCorrect: true },
    ]);
    editor.destroy();
  });

  it("unchecking a correct choice when others are correct succeeds", () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: true },
        { id: "b", isCorrect: true },
      ],
      true,
      "multiselect",
    );

    const changed = toggleChoiceCorrect(editor, choicePosByIndex(editor, 0));

    expect(changed).toBe(true);
    expect(getChoices(editor)).toEqual([
      { id: "a", isCorrect: false },
      { id: "b", isCorrect: true },
    ]);
    editor.destroy();
  });

  it("unchecking the last correct choice is a no-op (at-least-one invariant)", () => {
    const editor = makeEditor(
      [
        { id: "a", isCorrect: true },
        { id: "b", isCorrect: false },
      ],
      true,
      "multiselect",
    );

    const changed = toggleChoiceCorrect(editor, choicePosByIndex(editor, 0));

    expect(changed).toBe(false);
    expect(getChoices(editor)).toEqual([
      { id: "a", isCorrect: true },
      { id: "b", isCorrect: false },
    ]);
    editor.destroy();
  });
});
