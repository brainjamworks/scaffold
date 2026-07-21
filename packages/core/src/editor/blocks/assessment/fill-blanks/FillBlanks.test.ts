// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { Content, JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import type { AssessmentPort } from "@/host/ports";

import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentActionsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group-runtime";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import type { RichTextBubbleMenuProps } from "@/editor/shell/bubbles/rich-text/RichTextBubbleMenu";
import { FillBlanksPrivateAssessmentSchema } from "@scaffold/contracts";
import { toTiptapRichTextDocument, type ScaffoldRichTextDocument } from "@/schemas/rich-text";

import { describeFillBlankAccessibilityState } from "./fill-blank-runtime";
import { applyFillBlankToEditor } from "./commands";
import { FillBlanksAuthoringExtension } from "./fill-blanks-authoring-extension";
import { fillBlanksBlockDefinition } from "./fill-blanks-definition";
import { FillBlanksRuntimeExtension } from "./fill-blanks-runtime-extension";

const canonicalAssessmentResult = { maxScore: 1 as const, feedback: null, items: {} };

const fillBlankBubbleMenuMock = vi.hoisted(() => ({
  props: [] as RichTextBubbleMenuProps[],
}));

vi.mock("@/editor/shell/bubbles/rich-text/RichTextBubbleMenu", async () => {
  const React = await import("react");
  const { createPortal } = await import("react-dom");

  return {
    RichTextBubbleMenu(props: RichTextBubbleMenuProps) {
      fillBlankBubbleMenuMock.props.push(props);
      const appendTarget = props.appendTo?.();
      return appendTarget
        ? createPortal(
            React.createElement("div", {
              "aria-label": "Text formatting",
              "data-testid": "fill-blank-rich-text-bubble-menu",
              role: "toolbar",
            }),
            appendTarget,
          )
        : null;
    },
  };
});

const richFeedback = (text: string) => ({
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  },
});

function assessmentActions(): JSONContent {
  return {
    type: "assessment_actions_group",
    content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
  };
}

function makeEditor({
  content,
  runtime = false,
  undoRedo = false,
}: { content?: Content; runtime?: boolean; undoRedo?: boolean } = {}) {
  return new Editor({
    ...(content ? { content } : {}),
    editable: !runtime,
    extensions: [
      StarterKit.configure({ undoRedo: undoRedo ? {} : false, paragraph: false }),
      ExtendedParagraph,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      runtime ? AssessmentActionsGroupRuntimeNode : AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      ...(runtime ? [] : [createScaffoldInteractionOwnerExtension(builtInBlockRegistry)]),
      runtime ? FillBlanksRuntimeExtension : FillBlanksAuthoringExtension,
    ],
  });
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

function fillBlanksDoc({
  acceptedAnswers = ["0°C", "0 degrees Celsius"],
  placeholder = "temperature",
}: { acceptedAnswers?: string[]; placeholder?: string } = {}) {
  return {
    type: "doc",
    content: [
      {
        type: "fill_blanks",
        attrs: {
          id: "fill-1",
          assessment: {
            blanksById: {
              b1: {
                acceptedAnswers,
                feedback: richFeedback("Use the Celsius freezing point."),
                caseSensitive: false,
                trimWhitespace: true,
              },
            },
            summaryFeedback: null,
          },
          settings: {
            feedbackMode: "on_submit",
            isGraded: true,
            showAnswer: false,
            legend: "Complete the sentence",
            points: 3,
            maxAttempts: 2,
          },
        },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "fill_blanks_body",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "Water freezes at " },
                  {
                    type: "fill_blank",
                    attrs: {
                      id: "b1",
                      placeholder,
                    },
                  },
                  { type: "text", text: "." },
                ],
              },
            ],
          },
          assessmentActions(),
        ],
      },
    ],
  };
}

function runtimeFillBlanksDoc({
  answer,
  feedback,
  showAnswer = true,
}: {
  answer: string;
  feedback: string;
  showAnswer?: boolean;
}) {
  return {
    type: "doc",
    content: [
      {
        type: "fill_blanks",
        attrs: {
          id: "fill-1",
          assessment: {
            blanksById: {
              "blank-1": {
                acceptedAnswers: [answer],
                feedback: feedback ? richFeedback(feedback) : null,
                caseSensitive: false,
                trimWhitespace: true,
              },
            },
            summaryFeedback: null,
          },
          settings: {
            feedbackMode: "on_submit",
            isGraded: true,
            showAnswer,
            legend: "Complete the sentence",
            points: 1,
            maxAttempts: null,
          },
        },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "fill_blanks_body",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "The city is " },
                  {
                    type: "fill_blank",
                    attrs: {
                      id: "blank-1",
                      placeholder: "city",
                    },
                  },
                  { type: "text", text: "." },
                ],
              },
            ],
          },
          assessmentActions(),
        ],
      },
    ],
  };
}

function blankDescription(label = "city"): string | null {
  const input = screen.getByLabelText(label);
  const describedBy = input.getAttribute("aria-describedby");
  return describedBy ? (document.getElementById(describedBy)?.textContent ?? null) : null;
}

async function openBlankFeedbackSheet(editor: Editor, blankName: string | RegExp = /0°C/) {
  renderAssessmentEditor(editor);
  fireEvent.mouseDown(await screen.findByRole("button", { name: blankName }));
  const sheet = await screen.findByRole("dialog", { name: "Edit blank" });
  fireEvent.click(within(sheet).getByRole("button", { name: "Feedback" }));
  await within(sheet).findByLabelText("Shown after submitting");
  return sheet;
}

async function latestNestedFeedbackEditor(): Promise<Editor> {
  await waitFor(() => {
    expect(fillBlankBubbleMenuMock.props.at(-1)?.editor).toBeDefined();
  });
  const editor = fillBlankBubbleMenuMock.props.at(-1)?.editor;
  if (!editor) throw new Error("Missing nested fill-blank feedback editor");
  return editor;
}

function readBlankFeedbackDocument(
  editor: Editor,
  blankId: string,
): ScaffoldRichTextDocument | null {
  let document: ScaffoldRichTextDocument | null = null;

  editor.state.doc.descendants((node) => {
    if (node.type.name !== "fill_blanks") return true;
    const assessment = FillBlanksPrivateAssessmentSchema.parse(node.attrs["assessment"] ?? {});
    document = toTiptapRichTextDocument(assessment.blanksById[blankId]?.feedback?.document);
    return false;
  });

  return document;
}

function setBlankFeedback(editor: Editor, blankId: string, text: string) {
  let updated = false;

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "fill_blanks") return true;
    const assessment = FillBlanksPrivateAssessmentSchema.parse(node.attrs["assessment"] ?? {});
    const blankAssessment = assessment.blanksById[blankId];
    if (!blankAssessment) throw new Error(`Missing assessment for blank ${blankId}`);

    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        assessment: {
          ...assessment,
          blanksById: {
            ...assessment.blanksById,
            [blankId]: {
              ...blankAssessment,
              feedback: richFeedback(text),
            },
          },
        },
      }),
    );
    updated = true;
    return false;
  });

  if (!updated) throw new Error("Missing fill_blanks assessment node");
}

beforeEach(() => {
  assessmentStore = null;
});

afterEach(() => {
  cleanup();
  fillBlankBubbleMenuMock.props.length = 0;
  document.body.innerHTML = "";
});

describe("composite fill_blanks node", () => {
  it("declares bounded fill placement", () => {
    expect(fillBlanksBlockDefinition.boundedPlacement).toBe("fill");
  });

  it("keeps authored prose and inline blanks in one shared bounded scroll lane", async () => {
    const editor = makeEditor();
    editor.commands.setContent(fillBlanksDoc());
    renderAssessmentEditor(editor);

    const shell = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>("[data-assessment-shell]");
      expect(element).toBeInstanceOf(HTMLElement);
      return element;
    });
    const body = shell?.querySelector<HTMLElement>('[data-slot="fill-blanks-body"]');
    const scrollLane = body?.querySelector<HTMLElement>("[data-assessment-bounded-scroll]");
    const hint = body?.querySelector<HTMLElement>("[data-assessment-bounded-scroll-hint]");

    expect(body?.getAttribute("data-assessment-bounded-scroll-frame")).toBe("");
    expect(body?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(shell?.querySelectorAll("[data-assessment-bounded-scroll]")).toHaveLength(1);
    expect(scrollLane?.textContent).toContain("Water freezes at");
    expect(scrollLane?.querySelector('[data-node="fill-blank"]')).toBeInstanceOf(HTMLElement);
    expect(scrollLane?.querySelector('[data-slot="assessment-title"]')).toBeNull();
    expect(scrollLane?.querySelector('[data-slot="assessment-instructions"]')).toBeNull();
    expect(scrollLane?.querySelector('[data-slot="assessment-prompt"]')).toBeNull();
    expect(scrollLane?.querySelector('[data-slot="assessment-actions-group"]')).toBeNull();
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(shell?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);

    editor.destroy();
  });

  it("describes fill blank runtime accessibility states", () => {
    expect(
      describeFillBlankAccessibilityState({
        hasFeedback: false,
        revealed: false,
        state: null,
        submitted: false,
        value: "London",
      }),
    ).toBe("Entered answer");

    expect(
      describeFillBlankAccessibilityState({
        hasFeedback: false,
        revealed: false,
        state: "incorrect",
        submitted: true,
        value: "London",
      }),
    ).toBe("Submitted answer, incorrect");

    expect(
      describeFillBlankAccessibilityState({
        hasFeedback: true,
        revealed: true,
        state: "correct",
        submitted: true,
        value: "Paris",
      }),
    ).toBe("Revealed answer, correct. Feedback available");
  });

  it("round-trips attrs and inline blanks", () => {
    const editor = makeEditor();
    editor.commands.setContent(fillBlanksDoc());

    const json = editor.getJSON();
    const block = json.content?.[0] as JSONContent | undefined;
    expect(block?.attrs?.["quick"]).toBeUndefined();
    expect(block?.attrs).not.toHaveProperty("data");
    expect(block?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: false,
      legend: "Complete the sentence",
      points: 3,
      maxAttempts: 2,
    });
    expect(block?.content?.length).toBe(5);
    const children = block?.content as JSONContent[] | undefined;
    const body = children?.[3];
    expect(body?.type).toBe("fill_blanks_body");
    expect(children?.[4]?.type).toBe("assessment_actions_group");
    const paragraph = (body?.content as JSONContent[] | undefined)?.[0];
    const inline = paragraph?.content as JSONContent[] | undefined;
    expect(inline?.map((part) => part.type)).toEqual(["text", "fill_blank", "text"]);
    expect(inline?.[1]?.attrs).toMatchObject({
      id: "b1",
      placeholder: "temperature",
    });
    expect(block?.attrs?.["assessment"]).toMatchObject({
      blanksById: {
        b1: {
          acceptedAnswers: ["0°C", "0 degrees Celsius"],
          feedback: richFeedback("Use the Celsius freezing point."),
        },
      },
    });
    editor.destroy();
  });

  it("parses defaults when attrs are absent", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "fill_blanks",
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "fill_blanks_body",
              content: [{ type: "paragraph" }],
            },
            assessmentActions(),
          ],
        },
      ],
    });
    const block = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(block?.attrs?.["quick"]).toBeUndefined();
    expect(block?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    editor.destroy();
  });

  it("does not serialize accepted answers or matching rules into HTML", () => {
    const editor = makeEditor({ runtime: true });
    editor.commands.setContent(fillBlanksDoc());

    const html = editor.getHTML();
    expect(html).toContain('data-node="fill-blank"');
    expect(html).toContain('data-blank-id="b1"');
    expect(html).toContain('data-placeholder="temperature"');
    expect(html).toContain('data-assessment-bounded-scroll-frame=""');
    expect(html).toContain('data-assessment-bounded-scroll=""');
    expect(html).toContain('data-assessment-bounded-scroll-hint=""');
    expect(html).toContain("Scroll for more ↓");
    expect(html).not.toContain("data-answers");
    expect(html).not.toContain("data-feedback");
    expect(html).not.toContain("data-case-sensitive");
    expect(html).not.toContain("data-trim-whitespace");
    expect(html).not.toContain("0°C");
    expect(html).not.toContain("0 degrees Celsius");
    expect(html).not.toContain("Use the Celsius freezing point.");

    editor.destroy();
  });

  it("lets shared assessment children resolve their fill_blanks ancestor", () => {
    const editor = makeEditor({ runtime: true });
    editor.commands.setContent(fillBlanksDoc());

    let blankPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "fill_blank") blankPos = pos;
    });

    expect(findAncestorAssessmentId(editor, blankPos, ["fill_blanks"])).toBe("fill-1");
    editor.destroy();
  });

  it("does not disclose accepted answers or authored feedback after wrong submit before reveal", async () => {
    const editor = makeEditor({ runtime: true });
    editor.commands.setContent(
      runtimeFillBlanksDoc({
        answer: "Paris",
        feedback: "Capital city",
      }),
    );
    const problemId = "artifact:artifact-1/block:fill-1";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              "blank-1": { correct: false, expected: "Paris", given: "London" },
            },
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    fireEvent.change(screen.getByLabelText("city"), {
      target: { value: "London" },
    });

    await waitFor(() => {
      expect(blankDescription()).toBe("Entered answer");
      expect((screen.getByText("Submit") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("London")).toBeInstanceOf(HTMLInputElement);
      expect(blankDescription()).toBe("Submitted answer, incorrect");
      expect(screen.queryByDisplayValue("Paris")).toBeNull();
      expect(screen.queryByRole("button", { name: "Show feedback" })).toBeNull();
    });

    editor.destroy();
  });

  it("reveals accepted blank answers and feedback from port payload", async () => {
    const editor = makeEditor({ runtime: true });
    editor.commands.setContent(
      runtimeFillBlanksDoc({
        answer: "Berlin",
        feedback: "Authored feedback",
      }),
    );
    const problemId = "artifact:artifact-1/block:fill-1";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              "blank-1": { correct: false, expected: "Paris", given: "London" },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "fill-blanks",
          blanks: [
            {
              blankId: "blank-1",
              acceptedAnswers: ["Paris"],
              caseSensitive: false,
              trimWhitespace: true,
            },
          ],
          feedbackByBlankId: {
            "blank-1": richFeedback("Capital city"),
          },
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    fireEvent.change(screen.getByLabelText("city"), {
      target: { value: "London" },
    });

    await waitFor(() => {
      expect(blankDescription()).toBe("Entered answer");
      expect((screen.getByText("Submit") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Show answer")).toBeInstanceOf(HTMLButtonElement);
    });
    fireEvent.click(screen.getByText("Show answer"));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Paris")).toBeInstanceOf(HTMLInputElement);
      expect(blankDescription()).toBe("Revealed answer, correct. Feedback available");
      expect(screen.queryByDisplayValue("Berlin")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "Show feedback" }));

    await waitFor(() => {
      const dialog = screen.getByRole("dialog", { name: "Feedback" });
      expect(
        within(dialog).getByRole("heading", { name: "Feedback", level: 2 }),
      ).toBeInTheDocument();
      expect(within(dialog).getByText("Capital city")).toBeInstanceOf(HTMLElement);
      expect(screen.queryByText("Authored feedback")).toBeNull();
    });

    editor.destroy();
  });

  it("turns selected text into an inline blank with the selection as its answer", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "fill_blanks",
          attrs: { id: "fill-1" },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "fill_blanks_body",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "The answer is Paris." }],
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });

    let from = -1;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text?.includes("Paris")) return;
      from = pos + node.text.indexOf("Paris");
    });
    expect(from).toBeGreaterThan(0);
    const to = from + "Paris".length;
    editor.commands.setTextSelection({ from, to });

    expect(applyFillBlankToEditor(editor)).toBe(true);
    const block = editor.getJSON().content?.[0] as JSONContent | undefined;
    const body = block?.content?.[3] as JSONContent | undefined;
    const paragraph = body?.content?.[0] as JSONContent | undefined;
    const inline = paragraph?.content as JSONContent[] | undefined;
    expect(inline?.map((part) => part.type)).toEqual(["text", "fill_blank", "text"]);
    const blankId = inline?.[1]?.attrs?.["id"] as string | undefined;
    expect(block?.attrs?.["assessment"]?.blanksById?.[blankId ?? ""]?.acceptedAnswers).toEqual([
      "Paris",
    ]);
    expect(inline?.[1]?.attrs?.["placeholder"]).toBe("");
    editor.destroy();
  });

  it("does not create a blank outside the fill blanks body", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "fill_blanks",
          attrs: { id: "fill-1" },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            {
              type: "assessment_prompt",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Do not blank this prompt." }],
                },
              ],
            },
            {
              type: "fill_blanks_body",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "The answer is Paris." }],
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });

    let from = -1;
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text?.includes("prompt")) return;
      from = pos + node.text.indexOf("prompt");
    });
    expect(from).toBeGreaterThan(0);
    editor.commands.setTextSelection({ from, to: from + "prompt".length });

    expect(applyFillBlankToEditor(editor)).toBe(false);
    const block = editor.getJSON().content?.[0] as JSONContent | undefined;
    const prompt = block?.content?.[2] as JSONContent | undefined;
    const paragraph = prompt?.content?.[0] as JSONContent | undefined;

    expect(paragraph?.content).toEqual([{ type: "text", text: "Do not blank this prompt." }]);
    editor.destroy();
  });

  it("does not open blank settings from selection alone", async () => {
    const editor = makeEditor();
    editor.commands.setContent(fillBlanksDoc());
    renderAssessmentEditor(editor);

    let blankPos: number | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (blankPos !== null) return false;
      if (node.type.name !== "fill_blank") return true;
      blankPos = pos;
      return false;
    });

    expect(blankPos).not.toBeNull();
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, blankPos ?? 0)),
    );

    await waitFor(() => {
      expect(screen.queryByText("Edit blank")).toBeNull();
    });

    editor.destroy();
  });

  it("syncs an external feedback update into the mounted Sheet field without echoing a write", async () => {
    const editor = makeEditor();
    editor.commands.setContent(fillBlanksDoc());
    const sheet = await openBlankFeedbackSheet(editor);
    const feedbackEditor = await within(sheet).findByLabelText("Shown after submitting");
    let transactionCount = 0;
    editor.on("transaction", () => {
      transactionCount += 1;
    });

    setBlankFeedback(editor, "b1", "Externally synchronized feedback");

    await waitFor(() => {
      expect(within(sheet).getByLabelText("Shown after submitting")).toBe(feedbackEditor);
      expect(feedbackEditor.textContent).toBe("Externally synchronized feedback");
    });
    expect(transactionCount).toBe(1);

    editor.destroy();
  });

  it("writes Sheet feedback edits through the outer fill_blanks assessment attr", async () => {
    const editor = makeEditor();
    editor.commands.setContent(fillBlanksDoc());
    await openBlankFeedbackSheet(editor);
    const nestedEditor = await latestNestedFeedbackEditor();

    nestedEditor.chain().selectAll().insertContent("Revised feedback").run();

    await waitFor(() => {
      expect(readBlankFeedbackDocument(editor, "b1")).toMatchObject(
        richFeedback("Revised feedback").document,
      );
    });

    editor.destroy();
  });

  it("routes Sheet feedback keyboard undo and redo through the outer editor", async () => {
    const editor = makeEditor({ content: fillBlanksDoc(), undoRedo: true });
    await openBlankFeedbackSheet(editor);
    const nestedEditor = await latestNestedFeedbackEditor();

    nestedEditor.chain().selectAll().insertContent("Revised feedback").run();
    await waitFor(() => {
      expect(readBlankFeedbackDocument(editor, "b1")).toMatchObject(
        richFeedback("Revised feedback").document,
      );
    });

    fireEvent.keyDown(nestedEditor.view.dom, { ctrlKey: true, key: "z" });
    await waitFor(() => {
      expect(readBlankFeedbackDocument(editor, "b1")).toMatchObject(
        richFeedback("Use the Celsius freezing point.").document,
      );
    });

    fireEvent.keyDown(nestedEditor.view.dom, { ctrlKey: true, key: "z", shiftKey: true });
    await waitFor(() => {
      expect(readBlankFeedbackDocument(editor, "b1")).toMatchObject(
        richFeedback("Revised feedback").document,
      );
    });

    editor.destroy();
  });

  it("keeps feedback formatting chrome and focus ownership inside the Sheet", async () => {
    const editor = makeEditor();
    editor.commands.setContent(fillBlanksDoc());
    const sheet = await openBlankFeedbackSheet(editor);
    const nestedEditor = await latestNestedFeedbackEditor();
    const formattingToolbar = screen.getByRole("toolbar", { name: "Text formatting" });

    expect(sheet.contains(formattingToolbar)).toBe(true);
    expect(fillBlankBubbleMenuMock.props.at(-1)?.appendTo?.()).toBe(sheet);
    expect(nestedEditor.isFocused).toBe(false);

    editor.destroy();
  });

  it("destroys the nested feedback editor when the Sheet closes", async () => {
    const editor = makeEditor();
    editor.commands.setContent(fillBlanksDoc());
    const sheet = await openBlankFeedbackSheet(editor);
    const nestedEditor = await latestNestedFeedbackEditor();

    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit blank" })).toBeNull();
      expect(nestedEditor.isDestroyed).toBe(true);
    });

    editor.destroy();
  });

  it("keeps conversion-to-text cleanup keyed to the converted blank", async () => {
    const editor = makeEditor();
    editor.commands.setContent(fillBlanksDoc());
    const sheet = await openBlankFeedbackSheet(editor);

    fireEvent.click(within(sheet).getByRole("button", { name: "Convert to text" }));

    await waitFor(() => {
      expect(editor.state.doc.textContent).toContain("Water freezes at 0°C.");
      expect(
        editor.getJSON().content?.[0]?.attrs?.["assessment"]?.blanksById?.["b1"],
      ).toBeUndefined();
    });
    let hasBlank = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "fill_blank") hasBlank = true;
    });
    expect(hasBlank).toBe(false);

    editor.destroy();
  });

  it("removes keyed feedback when conversion deletes an empty blank", async () => {
    const editor = makeEditor();
    editor.commands.setContent(fillBlanksDoc({ acceptedAnswers: [""], placeholder: "" }));
    const sheet = await openBlankFeedbackSheet(editor, "Blank");

    fireEvent.click(within(sheet).getByRole("button", { name: "Convert to text" }));

    await waitFor(() => {
      expect(
        editor.getJSON().content?.[0]?.attrs?.["assessment"]?.blanksById?.["b1"],
      ).toBeUndefined();
    });
    let hasBlank = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "fill_blank") hasBlank = true;
    });
    expect(hasBlank).toBe(false);
    expect(editor.state.doc.textContent).toContain("Water freezes at .");

    editor.destroy();
  });

  it("registers settings shortcuts separately from blank creation authoring controls", () => {
    const definition = builtInBlockRegistry.getByNodeType("fill_blanks");
    const quickMenuControls = definition?.quickMenu?.controls ?? [];

    expect(quickMenuControls).toMatchObject([
      { kind: "select", name: "feedbackMode" },
      { kind: "boolean", name: "isGraded" },
      { kind: "boolean", name: "showAnswer" },
    ]);

    const editor = makeEditor();
    try {
      const action = definition?.authoringControls?.controls({
        editor,
        nodeType: "fill_blanks",
        pos: 0,
      })[0];

      expect(action?.kind).toBe("action");
      if (!action || action.kind !== "action") {
        throw new Error("create blank authoring action missing");
      }
      expect(action.run).toBeTypeOf("function");
      expect(action).toMatchObject({
        kind: "action",
        id: "fill-blanks:create-blank",
        label: "Create blank",
        presentation: "icon-only",
      });
    } finally {
      editor.destroy();
    }
  });
});
