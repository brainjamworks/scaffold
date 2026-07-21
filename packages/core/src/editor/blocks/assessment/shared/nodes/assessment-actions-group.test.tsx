// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";
import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  setAssessmentResponseField,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import type { NestedRichTextBubbleMenuHostProps } from "@/editor/rich-text/authoring/nested-overlay/NestedRichTextBubbleMenuHost";
import type { AssessmentPort } from "@/host/ports";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

import { AssessmentActionsGroupNode } from "./assessment-actions-group";
import { AssessmentActionsGroupRuntimeNode } from "./assessment-actions-group-runtime";
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
import { SelectableChoiceBodyNode } from "./selectable-choice";
import { SelectableChoiceRuntimeNode } from "./selectable-choice-runtime";
import { McqRuntimeExtension } from "../../mcq/mcq-runtime-extension";

const canonicalAssessmentResult = { maxScore: 1 as const, feedback: null, items: {} };

const nestedRichTextBubbleMenuHostMock = vi.hoisted(() => ({
  props: [] as NestedRichTextBubbleMenuHostProps[],
}));

vi.mock("@/editor/rich-text/authoring/nested-overlay/NestedRichTextBubbleMenuHost", async () => {
  const React = await import("react");

  return {
    NestedRichTextBubbleMenuHost(props: NestedRichTextBubbleMenuHostProps) {
      nestedRichTextBubbleMenuHostMock.props.push(props);

      return React.createElement("div", {
        "data-plugin-key": props.pluginKey ?? "",
        "data-testid": "nested-rich-text-bubble-menu-host",
      });
    },
  };
});

const TestAssessmentHostNode = Node.create({
  name: "test_assessment_host",
  group: "block",
  content: "assessment_actions_group",

  parseHTML() {
    return [{ tag: "div[data-test-assessment-host]" }];
  },

  renderHTML() {
    return ["div", { "data-test-assessment-host": "" }, 0];
  },
});

const editors: Editor[] = [];

beforeEach(() => {
  assessmentStore = null;
});

afterEach(() => {
  cleanup();
  nestedRichTextBubbleMenuHostMock.props.length = 0;
  for (const editor of editors.splice(0)) {
    editor.destroy();
  }
});

describe("assessment_actions_group", () => {
  it("accepts hints and summary feedback as its complete child structure", () => {
    const editor = makeStructuralEditor();
    editor.commands.setContent(validActionsGroupDocument());

    expect(editor.schema.nodes["assessment_actions_group"]).toMatchObject({
      name: "assessment_actions_group",
    });
    expect(editor.getJSON().content?.[0]).toMatchObject(validActionsGroupHost());
    expect(editor.getHTML()).toContain('data-slot="assessment-actions-group"');
  });

  it("parses the stable marker into the structural group node", () => {
    const editor = makeStructuralEditor();
    editor.commands.setContent(`
      <div data-test-assessment-host>
        <div data-slot="assessment-actions-group">
          <div data-slot="assessment-hints-group"></div>
          <div data-slot="assessment-summary-feedback"></div>
        </div>
      </div>
    `);

    expect(editor.getJSON().content?.[0]).toMatchObject(validActionsGroupHost());
  });

  it("rejects incomplete group content", () => {
    const editor = makeStructuralEditor();
    const incomplete = {
      type: "doc",
      content: [
        {
          type: "test_assessment_host",
          content: [
            {
              type: "assessment_actions_group",
              content: [{ type: "assessment_hints_group" }],
            },
          ],
        },
      ],
    };

    expect(() => editor.schema.nodeFromJSON(incomplete).check()).toThrow();
  });

  it("includes the authoring group node in course document composition", () => {
    const editor = new Editor({
      extensions: createCourseDocumentAuthoringExtensions({ editable: true }),
    });
    editors.push(editor);

    expect(editor.schema.nodes["assessment_actions_group"]).toBeDefined();
  });

  it("includes the runtime group node in course document composition", () => {
    const editor = new Editor({
      extensions: createCourseDocumentRuntimeExtensions(),
    });
    editors.push(editor);

    expect(editor.schema.nodes["assessment_actions_group"]).toBeDefined();
  });

  it("renders the authoring submit preview inside the action group controls slot", async () => {
    const editor = makeStructuralEditor();
    editor.commands.setContent(validActionsGroupDocument());

    renderAssessmentEditor(editor);

    await waitFor(() => {
      expect(actionGroupControls()).toBeInstanceOf(HTMLElement);
    });

    const submit = within(actionGroupControls()).getByRole("button", {
      name: "Submit",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("renders authoring hint and summary children inside the action group", async () => {
    const editor = makeStructuralEditor();
    editor.commands.setContent(validActionsGroupDocument());

    renderAssessmentEditor(editor);

    await waitFor(() => {
      const group = actionGroup();
      expect(within(group).getByRole("button", { name: "Add hint" })).toBeInstanceOf(
        HTMLButtonElement,
      );
      expect(within(group).getByRole("button", { name: "Show feedback" })).toBeInstanceOf(
        HTMLButtonElement,
      );
    });

    const group = actionGroup();
    expect(group.querySelector('[data-slot="assessment-hints-group"]')).toBeInstanceOf(HTMLElement);
    expect(group.querySelector('[data-slot="assessment-summary-feedback"]')).toBeInstanceOf(
      HTMLElement,
    );
    expectNoAssessmentActionPortalMarkers();
  });

  it("edits authoring hint content through the shared nested rich text editor host", async () => {
    const user = userEvent.setup();
    const editor = makeStructuralEditor();
    editor.commands.setContent(validActionsGroupDocumentWithHint("Draft hint"));

    renderAssessmentEditor(editor);

    await waitFor(() => {
      expect(within(actionGroup()).getByRole("button", { name: "Edit 1 hint" })).toBeInstanceOf(
        HTMLButtonElement,
      );
    });

    await user.click(within(actionGroup()).getByRole("button", { name: "Edit 1 hint" }));

    await waitFor(() => {
      const props = nestedRichTextBubbleMenuHostMock.props.at(-1);
      expect(props?.editor?.getText()).toBe("Draft hint");
      expect(props?.pluginKey).toMatch(/^assessment-hints-rich-text-/);
    });

    const hostProps = nestedRichTextBubbleMenuHostMock.props.at(-1);
    const hintEditor = hostProps?.editor;
    if (!hintEditor) throw new Error("Expected active hint editor");

    const dialog = authoringHintDialog();
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Hint 1");
    const surface = dialog.querySelector("[data-scaffold-popover-surface]");
    expect(surface).toBeInstanceOf(HTMLElement);
    expect(surface?.getAttribute("data-tone")).toBe("hint");
    const addHintAction = dialog.querySelector('[data-action="add-hint"]');
    expect(addHintAction).toBeInstanceOf(HTMLButtonElement);
    expect(addHintAction?.classList.contains("sc-assessment-hint-popover__add")).toBe(true);
    const deleteHintAction = dialog.querySelector('[aria-label="Delete hint 1"]');
    expect(deleteHintAction).toBeInstanceOf(HTMLButtonElement);
    expect(deleteHintAction?.getAttribute("data-tone")).toBe("danger");

    const bubbleAppendTarget = hostProps?.appendTo?.();
    expect(bubbleAppendTarget).toBeInstanceOf(HTMLElement);
    expect(bubbleAppendTarget).toBe(surface?.querySelector('[data-slot="popover-surface-body"]'));

    const editorDom = dialog.querySelector(".sc-assessment-hint-popover__editor");
    expect(editorDom).toBeInstanceOf(HTMLElement);
    expect(editorDom?.getAttribute("aria-label")).toBe("Hint 1 editor");
    expect(editorDom?.getAttribute("data-placeholder")).toBe("Write a hint");
    expect(
      dialog
        .querySelector('[data-testid="nested-rich-text-bubble-menu-host"]')
        ?.closest('[data-slot="popover-surface-body"]'),
    ).toBe(surface?.querySelector('[data-slot="popover-surface-body"]'));

    act(() => {
      hintEditor.commands.setTextSelection("Draft hint".length + 1);
      hintEditor.commands.insertContent(" updated");
    });

    expect(firstHintText(editor)).toBe("Draft hint updated");

    expect(within(dialog).queryByRole("button", { name: "Done" })).toBeNull();
    await user.click(within(actionGroup()).getByRole("button", { name: "Hide 1 hint" }));

    await waitFor(() => {
      expect(within(document.body).queryByRole("dialog", { hidden: true })).toBeNull();
      expect(hintEditor.isDestroyed).toBe(true);
    });
  });

  it("keeps the authoring hint shell open for add and non-final delete actions", async () => {
    const user = userEvent.setup();
    const editor = makeStructuralEditor();
    editor.commands.setContent(validActionsGroupDocumentWithHints(["First hint", "Second hint"]));

    renderAssessmentEditor(editor);

    await waitFor(() => {
      expect(within(actionGroup()).getByRole("button", { name: "Edit 2 hints" })).toBeInstanceOf(
        HTMLButtonElement,
      );
    });

    await user.click(within(actionGroup()).getByRole("button", { name: "Edit 2 hints" }));

    await waitFor(() => {
      expect(authoringHintDialog().getAttribute("aria-label")).toBe("Hint 1");
    });

    const nextHintAction = authoringHintDialog().querySelector('[aria-label="Next hint"]');
    expect(nextHintAction).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(nextHintAction as HTMLButtonElement);

    await waitFor(() => {
      expect(authoringHintDialog().getAttribute("aria-label")).toBe("Hint 2");
      expect(nestedRichTextBubbleMenuHostMock.props.at(-1)?.editor?.getText()).toBe("Second hint");
    });

    const addHintAction = authoringHintDialog().querySelector('[data-action="add-hint"]');
    expect(addHintAction).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(addHintAction as HTMLButtonElement);

    await waitFor(() => {
      const dialog = authoringHintDialog();
      expect(dialog.getAttribute("aria-label")).toBe("Hint 3");
      expect(
        dialog.querySelector(
          '.sc-assessment-hint-popover__editor p[data-placeholder="Write a hint"]',
        ),
      ).toBeInstanceOf(HTMLElement);
    });

    const deleteHintAction = authoringHintDialog().querySelector('[aria-label="Delete hint 3"]');
    expect(deleteHintAction).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(deleteHintAction as HTMLButtonElement);

    await waitFor(() => {
      expect(authoringHintDialog().getAttribute("aria-label")).toBe("Hint 2");
    });
  });

  it("renders runtime submit, retry, and attempt controls from the ancestor problem store", async () => {
    const user = userEvent.setup();
    const editor = makeRuntimeMcqEditor();
    const port = incorrectRuntimePort();

    renderRuntimeEditor(editor, port);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, runtimeProblemId)).toBe(true);
    });
    await waitFor(() => {
      expect(actionGroupControls()).toBeInstanceOf(HTMLElement);
    });

    const controls = actionGroupControls();
    const initialSubmit = within(controls).getByRole("button", {
      name: "Submit",
    }) as HTMLButtonElement;
    expect(initialSubmit.disabled).toBe(true);

    act(() => {
      expect(setAssessmentResponseField(assessmentStore, runtimeProblemId, "choices", "a")).toBe(
        true,
      );
    });

    await waitFor(() => {
      const submit = within(actionGroupControls()).getByRole("button", {
        name: "Submit",
      }) as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });

    await user.click(within(actionGroupControls()).getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(
        within(actionGroupControls()).getByRole("button", {
          name: "Try again",
        }),
      ).toBeInstanceOf(HTMLButtonElement);
    });
    expect(within(actionGroupControls()).getByText("1 of 2")).toBeInstanceOf(HTMLElement);
  });

  it("renders runtime hint and summary children inside the action group without portal markers", async () => {
    const editor = makeRuntimeMcqEditor();
    const port = incorrectRuntimePort();

    renderRuntimeEditor(editor, port);

    await submitIncorrectRuntimeAnswer();

    await waitFor(() => {
      const group = actionGroup();
      expect(within(group).getByRole("button", { name: "Show feedback" })).toBeInstanceOf(
        HTMLButtonElement,
      );
    });

    const group = actionGroup();
    expect(group.querySelector('[data-slot="assessment-hints-group"]')).toBeInstanceOf(HTMLElement);
    expect(group.querySelector('[data-slot="assessment-summary-feedback"]')).toBeInstanceOf(
      HTMLElement,
    );
    expectNoAssessmentActionPortalMarkers();
  });

  it("reveals runtime hints from the nested action group structure", async () => {
    const user = userEvent.setup();
    const editor = makeRuntimeMcqEditor();
    const port = incorrectRuntimePort();

    renderRuntimeEditor(editor, port);

    await waitFor(() => {
      expect(assessmentStore?.getState().registrations[runtimeProblemId]?.config.hintsTotal).toBe(
        1,
      );
    });

    await user.click(within(actionGroup()).getByRole("button", { name: "Show a hint" }));

    await waitFor(() => {
      expect(assessmentStore?.getState().durable.problems[runtimeProblemId]?.hintsShown).toBe(1);
    });

    let dialog: HTMLElement | null = null;
    await waitFor(() => {
      dialog = document.body.querySelector('[role="dialog"][aria-label="Hint 1 of 1"]');
      expect(dialog).toBeInstanceOf(HTMLElement);
    });
    if (!dialog) throw new Error("Expected runtime hint dialog");
    expect(within(dialog).getByText("Use elimination.")).toBeInstanceOf(HTMLElement);
  });

  it("renders runtime Show answer in the action group behind the existing gate", async () => {
    const editor = makeRuntimeMcqEditor();
    const port = incorrectRuntimePort();

    renderRuntimeEditor(editor, port);

    await submitIncorrectRuntimeAnswer();

    expect(
      within(actionGroup()).getByRole("button", {
        name: "Show correct answer",
      }),
    ).toBeInstanceOf(HTMLButtonElement);
    expect(
      within(actionGroup())
        .getByRole("button", { name: "Show correct answer" })
        .closest(".sc-assessment-actions-row__chrome--show-answer"),
    ).toBeInstanceOf(HTMLElement);
  });
});

function makeStructuralEditor(runtime = false) {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      TestAssessmentHostNode,
      runtime ? AssessmentHintRuntimeNode : AssessmentHintNode,
      runtime ? AssessmentActionsGroupRuntimeNode : AssessmentActionsGroupNode,
      runtime ? AssessmentHintsGroupRuntimeNode : AssessmentHintsGroupNode,
      runtime ? AssessmentSummaryFeedbackRuntimeNode : AssessmentSummaryFeedbackNode,
    ],
  });
  editors.push(editor);
  return editor;
}

function makeRuntimeMcqEditor() {
  const editor = new Editor({
    editable: false,
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintRuntimeNode,
      AssessmentChoicesGroupRuntimeNode,
      AssessmentActionsGroupRuntimeNode,
      AssessmentHintsGroupRuntimeNode,
      AssessmentSummaryFeedbackRuntimeNode,
      SelectableChoiceBodyNode,
      SelectableChoiceRuntimeNode,
      McqRuntimeExtension,
    ],
    content: runtimeMcqDocument(),
  });
  editors.push(editor);
  return editor;
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

function incorrectRuntimePort(): AssessmentPort {
  return {
    type: "runtime",
    submit: async (args) =>
      assessmentProblemOutcome(
        {
          ...canonicalAssessmentResult,
          isCorrect: false,
          score: 0,
          maxScore: 1,
          feedback: richFeedback("Review the explanation."),
        },
        { response: args.response },
      ),
  };
}

async function submitIncorrectRuntimeAnswer() {
  const user = userEvent.setup();
  await waitFor(() => {
    expect(hasAssessmentRegistration(assessmentStore, runtimeProblemId)).toBe(true);
  });

  act(() => {
    expect(setAssessmentResponseField(assessmentStore, runtimeProblemId, "choices", "a")).toBe(
      true,
    );
  });

  await waitFor(() => {
    const submit = within(actionGroupControls()).getByRole("button", {
      name: "Submit",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
  });

  await user.click(within(actionGroupControls()).getByRole("button", { name: "Submit" }));

  await waitFor(() => {
    expect(within(actionGroupControls()).getByRole("button", { name: "Try again" })).toBeInstanceOf(
      HTMLButtonElement,
    );
  });
}

function actionGroupControls(): HTMLElement {
  const controls = document.body.querySelector(
    '[data-slot="assessment-actions-group"] [data-slot="assessment-controls"]',
  );
  if (!(controls instanceof HTMLElement)) {
    throw new Error("assessment action group controls slot not found");
  }
  return controls;
}

function actionGroup(): HTMLElement {
  const group = document.body.querySelector('[data-slot="assessment-actions-group"]');
  if (!(group instanceof HTMLElement)) {
    throw new Error("assessment action group not found");
  }
  return group;
}

function authoringHintDialog(): HTMLElement {
  return within(document.body).getByRole("dialog", { hidden: true });
}

function expectNoAssessmentActionPortalMarkers() {
  const portalAttr = `data-assessment-${"action"}-portal`;
  const sourceClass = `sc-assessment-action-${"source"}--portalled`;
  const itemClass = `sc-assessment-action-${"portal"}-item`;

  expect(document.body.querySelector(`[${portalAttr}]`)).toBeNull();
  expect(document.body.querySelector(`.${sourceClass}`)).toBeNull();
  expect(document.body.querySelector(`.${itemClass}`)).toBeNull();
}

function validActionsGroupDocument() {
  return {
    type: "doc",
    content: [validActionsGroupHost()],
  };
}

function validActionsGroupDocumentWithHint(text: string) {
  return validActionsGroupDocumentWithHints([text]);
}

function validActionsGroupDocumentWithHints(hints: string[]) {
  return {
    type: "doc",
    content: [validActionsGroupHostWithHints(hints)],
  };
}

function validActionsGroupHost() {
  return {
    type: "test_assessment_host",
    content: [
      {
        type: "assessment_actions_group",
        content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
      },
    ],
  };
}

function validActionsGroupHostWithHints(hints: string[]) {
  return {
    type: "test_assessment_host",
    content: [
      {
        type: "assessment_actions_group",
        content: [
          {
            type: "assessment_hints_group",
            content: hints.map((hint) => ({
              type: "assessment_hint",
              content: [
                {
                  type: "paragraph",
                  ...(hint.length > 0 ? { content: [{ type: "text", text: hint }] } : {}),
                },
              ],
            })),
          },
          { type: "assessment_summary_feedback" },
        ],
      },
    ],
  };
}

function firstHintText(editor: Editor): string {
  let text: string | null = null;
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "assessment_hint") return true;
    text = node.textContent;
    return false;
  });

  if (text === null) throw new Error("Missing assessment_hint");
  return text;
}

const runtimeProblemId = "artifact:artifact-1/block:mcq-action-group-runtime";

function runtimeMcqDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "mcq",
        attrs: {
          id: "mcq-action-group-runtime",
          assessment: {
            correctOptionId: "b",
            feedbackByOptionId: {},
            summaryFeedback: null,
          },
          settings: {
            feedbackMode: "on_submit",
            isGraded: true,
            showAnswer: true,
            legend: "Choose one answer",
            points: 1,
            maxAttempts: 2,
          },
        },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "assessment_choices_group",
            content: [choice("a", "Incorrect option"), choice("b", "Correct option")],
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
                        content: [{ type: "text", text: "Use elimination." }],
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

function choice(id: string, text: string): JSONContent {
  return {
    type: "selectable_choice",
    attrs: { id },
    content: [
      {
        type: "selectable_choice_body",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text }],
          },
        ],
      },
    ],
  };
}
