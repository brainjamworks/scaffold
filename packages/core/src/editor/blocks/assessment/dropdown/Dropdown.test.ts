// @vitest-environment happy-dom

import { Editor, Node as TiptapNode } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  setAssessmentResponseField,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import { AUTHORING_FRAME_ATTR } from "@/editor/interactions/dom/authoring-frame";
import type { AssessmentPort } from "@/host/ports";

import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentActionsGroupRuntimeNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group-runtime";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";

import { describeDropdownAccessibilityState, dropdownChoiceLabelContent } from "./dropdown-choice";
import { DropdownAuthoringExtension } from "./dropdown-authoring-extension";
import { DropdownRuntimeExtension } from "./dropdown-runtime-extension";
import { dropdownBlockDefinition } from "./dropdown-definition";

const canonicalAssessmentResult = { feedback: null, items: {} };

const BoundedRegionTestNode = TiptapNode.create({
  name: "region",
  group: "block",
  content: "block+",
  selectable: false,

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
      createRuntimeBlockFrameAttributesExtension([dropdownBlockDefinition.nodeType]),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      BoundedRegionTestNode,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      editable ? AssessmentActionsGroupNode : AssessmentActionsGroupRuntimeNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      editable ? DropdownAuthoringExtension : DropdownRuntimeExtension,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
    ],
  });
}

function createDisposableDropdownEditor(content: JSONContent) {
  return createDisposableEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([dropdownBlockDefinition.nodeType]),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      DropdownAuthoringExtension,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
    ],
    content,
  });
}

function renderRuntimeEditor(editor: Editor, assessmentPort: AssessmentPort) {
  render(
    createAssessmentRuntimeTestRoot({
      assessment: assessmentPort,
      children: createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })),
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
      children: createAuthoringMovementTestRoot(editor, createElement(EditorContent, { editor })),
      onStore: captureAssessmentStore,
    }),
  );
}

const emptyContent = (type: string) => ({
  type,
  content: [{ type: "paragraph" }],
});
const emptyMount = (type: string) => ({ type });
function assessmentActions(): JSONContent {
  return {
    type: "assessment_actions_group",
    content: [{ type: "assessment_hints_group" }, emptyMount("assessment_summary_feedback")],
  };
}

const richFeedback = (text: string) => ({
  kind: "rich-text" as const,
  document: {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  },
});

function dropdownBlockContent({
  id = "dropdown-1",
  showAnswer = true,
}: {
  id?: string;
  showAnswer?: boolean;
} = {}): JSONContent {
  return {
    type: "dropdown",
    attrs: {
      id,
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer,
        label: "Pick a term",
        placeholder: "Choose...",
        points: 1,
        maxAttempts: null,
      },
      assessment: {
        correctOptionId: "choice_00002",
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
    },
    content: [
      emptyContent("assessment_title"),
      emptyContent("assessment_instructions"),
      emptyContent("assessment_prompt"),
      {
        type: "dropdown_choices_group",
        content: [
          {
            type: "dropdown_choice",
            attrs: { id: "choice_00001" },
            content: [
              {
                type: "dropdown_choice_label",
                content: dropdownChoiceLabelContent("Alpha"),
              },
            ],
          },
          {
            type: "dropdown_choice",
            attrs: { id: "choice_00002" },
            content: [
              {
                type: "dropdown_choice_label",
                content: dropdownChoiceLabelContent("Beta"),
              },
            ],
          },
        ],
      },
      assessmentActions(),
    ],
  };
}

function dropdownRuntimeContent({
  showAnswer = true,
}: {
  showAnswer?: boolean;
} = {}): JSONContent {
  return {
    type: "doc",
    content: [
      dropdownBlockContent({
        id: "dropdown-1",
        showAnswer,
      }),
    ],
  };
}

function dropdownDescription(): string | null {
  const trigger = screen.getByRole("combobox", { name: "Pick a term" });
  const describedBy = trigger.getAttribute("aria-describedby");
  return describedBy ? (document.getElementById(describedBy)?.textContent ?? null) : null;
}

beforeEach(() => {
  assessmentStore = null;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("composite dropdown node", () => {
  it("describes dropdown runtime accessibility states", () => {
    expect(
      describeDropdownAccessibilityState({
        hasFeedback: false,
        selected: true,
        state: null,
        submitted: false,
      }),
    ).toBe("Selected answer");

    expect(
      describeDropdownAccessibilityState({
        hasFeedback: false,
        selected: true,
        state: "incorrect",
        submitted: true,
      }),
    ).toBe("Submitted answer, incorrect");

    expect(
      describeDropdownAccessibilityState({
        hasFeedback: true,
        selected: false,
        state: "missed",
        submitted: true,
      }),
    ).toBe("Correct answer. Feedback available");
  });

  it("marks the learner dropdown required because submitting needs a response", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(dropdownRuntimeContent());

    renderRuntimeEditor(editor, {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: true, score: { scaled: 1 } },
          { response: args.response },
        ),
    });

    await waitFor(() => {
      expect(
        screen.getByRole("combobox", { name: "Pick a term" }).getAttribute("aria-required"),
      ).toBe("true");
    });

    editor.destroy();
  });

  it("models dropdown choices as internal field-owned rows", () => {
    const editor = makeEditor();
    const choice = editor.schema.nodes["dropdown_choice"];
    const label = editor.schema.nodes["dropdown_choice_label"];

    expect(choice?.spec.content).toBe("dropdown_choice_label");
    expect(choice?.spec.selectable).toBe(false);
    expect(choice?.spec.draggable).toBe(false);
    expect(label?.spec.content).toBe("text_content+");
    expect(label?.spec.selectable).toBe(false);

    editor.destroy();
  });

  it("declares bounded fill placement for dropdown blocks", () => {
    expect(dropdownBlockDefinition.boundedPlacement).toBe("fill");
  });

  it("persists author feedback for the selected dropdown choice", async () => {
    const editor = makeEditor();
    const user = userEvent.setup();
    editor.commands.setContent({ type: "doc", content: [dropdownBlockContent()] });

    renderAssessmentEditor(editor);

    const choice = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-node="dropdown-choice"][data-id="choice_00001"]',
      );
      expect(element).toBeInstanceOf(HTMLElement);
      return element as HTMLElement;
    });
    await user.click(within(choice).getByRole("button", { name: "Add feedback" }));
    const feedbackEditor = await screen.findByLabelText("Feedback editor");
    expect(feedbackEditor.getAttribute("data-attr-rich-text-field")).toBe(
      "dropdown:choice_00001:feedback",
    );

    fireEvent.paste(feedbackEditor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Review Alpha." : ""),
      },
    });

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs?.["assessment"]).toMatchObject({
        feedbackByOptionId: { choice_00001: richFeedback("Review Alpha.") },
      });
    });

    editor.destroy();
  });

  it("marks bounded authoring dropdown choices as the internal scroll lane", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-authoring" },
          content: [dropdownBlockContent({ id: "block-dropdown-bounded-authoring" })],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-dropdown-bounded-authoring"]`,
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element?.getAttribute("data-bounded-placement")).toBe("fill");
      return element;
    });
    const shell = frame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const choices = frame?.querySelector<HTMLElement>('[data-slot="dropdown-choices-group"]');
    const scrollLane = choices?.querySelector<HTMLElement>("[data-bounded-scroll]");
    const hint = choices?.querySelector<HTMLElement>("[data-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(choices).toBeInstanceOf(HTMLElement);
    expect(choices?.getAttribute("data-bounded-scroll-frame")).toBe("");
    expect(choices?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(shell?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-bounded-scroll")).toBe(false);

    editor.destroy();
  });

  it("keeps bounded runtime dropdown on the compact learner select without a scroll lane", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-runtime" },
          content: [dropdownBlockContent({ id: "block-dropdown-bounded-runtime" })],
        },
      ],
    });
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: { scaled: 0 },
            items: {},
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-runtime-frame="block"][data-id="block-dropdown-bounded-runtime"]',
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element?.getAttribute("data-bounded-placement")).toBe("fill");
      return element;
    });
    const shell = frame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const choices = frame?.querySelector<HTMLElement>('[data-slot="dropdown-choices-group"]');
    const runtimeControl = frame?.querySelector<HTMLElement>(".sc-course-dropdown-select");
    const trigger = screen.getByRole("combobox", { name: "Pick a term" });

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(choices).toBeInstanceOf(HTMLElement);
    expect(runtimeControl).toBeInstanceOf(HTMLElement);
    expect(trigger.classList.contains("sc-course-dropdown-select__trigger")).toBe(true);
    expect(choices?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(choices?.hasAttribute("data-bounded-scroll-frame")).toBe(false);
    expect(choices?.querySelector("[data-bounded-scroll]")).toBeNull();
    expect(choices?.querySelector("[data-bounded-scroll-hint]")).toBeNull();
    expect(shell?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-bounded-scroll")).toBe(false);

    editor.destroy();
  });

  it("deletes the requested dropdown choice from a disposable editor fixture", async () => {
    const fixture = createDisposableDropdownEditor({
      type: "doc",
      content: [
        {
          type: "dropdown",
          attrs: {
            id: "dropdown-choice-delete",
            assessment: {
              correctOptionId: "choice_00001",
              feedbackByOptionId: {},
              summaryFeedback: null,
            },
          },
          content: [
            emptyContent("assessment_title"),
            emptyContent("assessment_instructions"),
            emptyContent("assessment_prompt"),
            {
              type: "dropdown_choices_group",
              content: [
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00001" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent("Alpha"),
                    },
                  ],
                },
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00002" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent("Beta"),
                    },
                  ],
                },
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00003" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent("Gamma"),
                    },
                  ],
                },
              ],
            },
            assessmentActions(),
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep after dropdown" }],
        },
      ],
    });

    renderAssessmentEditor(fixture.editor);

    fireEvent.click(await screen.findByRole("button", { name: "Delete choice 2" }));

    await waitFor(() => {
      expect(screen.queryByText("Beta")).toBeNull();
    });

    const dropdown = fixture.json().content?.[0] as JSONContent | undefined;
    const choicesGroup = dropdown?.content?.[3] as JSONContent | undefined;
    const choiceIds = choicesGroup?.content?.map((child) => child.attrs?.["id"]);

    expect(fixture.topLevelNodeTypes()).toEqual(["dropdown", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after dropdown");
    expect(fixture.editor.state.doc.textContent).toContain("Alpha");
    expect(fixture.editor.state.doc.textContent).toContain("Gamma");
    expect(choiceIds).toEqual(["choice_00001", "choice_00003"]);

    fixture.destroy();
  });

  it("round-trips a full composite tree across settings attrs", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "dropdown",
          attrs: {
            assessment: {
              correctOptionId: "choice_00002",
              feedbackByOptionId: { choice_00002: richFeedback("Correct.") },
              summaryFeedback: null,
            },
            settings: {
              feedbackMode: "immediate",
              isGraded: true,
              showAnswer: false,
              label: "Pick a term",
              placeholder: "Choose...",
              points: 2,
              maxAttempts: 3,
            },
          },
          content: [
            {
              type: "assessment_title",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Glossary" }],
                },
              ],
            },
            emptyContent("assessment_instructions"),
            {
              type: "assessment_prompt",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Q?" }] }],
            },
            {
              type: "dropdown_choices_group",
              content: [
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00001" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent("A"),
                    },
                  ],
                },
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00002" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: [
                        {
                          type: "paragraph",
                          content: [
                            {
                              type: "text",
                              text: "B",
                              marks: [{ type: "bold" }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
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
                emptyMount("assessment_summary_feedback"),
              ],
            },
          ],
        },
      ],
    });

    const json = editor.getJSON();
    const dropdown = json.content?.[0] as JSONContent | undefined;
    expect(dropdown?.attrs?.["quick"]).toBeUndefined();
    expect(dropdown?.attrs).not.toHaveProperty("data");
    expect(dropdown?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "immediate",
      isGraded: true,
      showAnswer: false,
      label: "Pick a term",
      placeholder: "Choose...",
      points: 2,
      maxAttempts: 3,
    });
    expect(dropdown?.content?.length).toBe(5);
    const children = dropdown?.content as JSONContent[] | undefined;
    expect(children?.[3]?.type).toBe("dropdown_choices_group");
    expect(children?.[4]?.type).toBe("assessment_actions_group");
    const choices = children?.[3]?.content as JSONContent[] | undefined;
    expect(dropdown?.attrs?.["assessment"]).toMatchObject({
      correctOptionId: "choice_00002",
      feedbackByOptionId: { choice_00002: richFeedback("Correct.") },
    });
    expect(choices?.[0]?.attrs).toMatchObject({ id: "choice_00001" });
    expect(choices?.[1]?.attrs).toMatchObject({ id: "choice_00002" });
    expect(choices?.[1]?.attrs).not.toHaveProperty("feedback");
    const secondChoiceChildren = choices?.[1]?.content as JSONContent[] | undefined;
    expect(secondChoiceChildren?.[0]?.type).toBe("dropdown_choice_label");
    expect(secondChoiceChildren?.[0]?.content?.[0]?.content?.[0]?.marks?.[0]?.type).toBe("bold");
    expect(secondChoiceChildren?.[1]).toBeUndefined();
    editor.destroy();
  });

  it("parses defaults when attrs are absent", () => {
    const editor = makeEditor();
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
                  attrs: { id: "choice_00001" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent(),
                    },
                  ],
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });

    const json = editor.getJSON();
    const dropdown = json.content?.[0] as JSONContent | undefined;
    expect(dropdown?.attrs?.["quick"]).toBeUndefined();
    expect(dropdown?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      placeholder: "Select...",
      points: 1,
      maxAttempts: null,
    });
    editor.destroy();
  });

  it("projects dropdown choices into dropdown answer keys", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "dropdown",
          attrs: {
            assessment: {
              correctOptionId: "choice_00002",
              feedbackByOptionId: { choice_00002: richFeedback("Yes.") },
              summaryFeedback: null,
            },
          },
          content: [
            emptyContent("assessment_title"),
            emptyContent("assessment_instructions"),
            emptyContent("assessment_prompt"),
            {
              type: "dropdown_choices_group",
              content: [
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00001" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent(),
                    },
                  ],
                },
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00002" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent(),
                    },
                  ],
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });

    editor.destroy();
  });

  it("declares dropdown choice labels as text-content paragraphs", () => {
    const editor = makeEditor();
    const dropdownChoiceLabel = editor.schema.nodes["dropdown_choice_label"];
    const paragraph = editor.schema.nodes["paragraph"];
    const text = editor.schema.nodes["text"];

    expect(dropdownChoiceLabel?.spec.content).toBe("text_content+");
    expect(paragraph).toBeDefined();
    expect(text).toBeDefined();
    const afterOneParagraph = dropdownChoiceLabel?.contentMatch.matchType(paragraph!);
    // The label wraps inline content in real <p> nodes, matching the
    // selectable_choice paradigm so placeholders and Enter behavior stay local.
    expect(afterOneParagraph).not.toBeNull();
    expect(afterOneParagraph?.matchType(paragraph!)).not.toBeNull();
    expect(dropdownChoiceLabel?.contentMatch.matchType(text!)).toBeNull();
    editor.destroy();
  });

  it("keeps paragraph splits inside one dropdown choice label", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "dropdown",
          attrs: {
            assessment: {
              correctOptionId: "choice_00001",
              feedbackByOptionId: {},
              summaryFeedback: null,
            },
          },
          content: [
            emptyContent("assessment_title"),
            emptyContent("assessment_instructions"),
            emptyContent("assessment_prompt"),
            {
              type: "dropdown_choices_group",
              content: [
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00001" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Line one" }],
                        },
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Line two" }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });

    const json = editor.getJSON();
    const dropdown = json.content?.[0] as JSONContent | undefined;
    const choicesGroup = dropdown?.content?.[3] as JSONContent | undefined;
    const choices = choicesGroup?.content as JSONContent[] | undefined;
    const label = choices?.[0]?.content?.[0] as JSONContent | undefined;

    expect(choices).toHaveLength(1);
    expect(choices?.[0]?.attrs?.["id"]).toBe("choice_00001");
    expect(label?.content).toHaveLength(2);
    editor.destroy();
  });

  it("exposes the selected dropdown value before submission", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:dropdown-1";
    editor.commands.setContent(dropdownRuntimeContent());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: { scaled: 0 },
            items: {},
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
      expect(
        document.body.querySelector('[data-runtime-frame="block"][data-id="dropdown-1"]'),
      ).toBeInstanceOf(HTMLElement);
    });
    expect(document.body.querySelector("[data-authoring-frame-wrapper]")).toBeNull();

    expect(setAssessmentResponseField(assessmentStore, problemId, "choices", "choice_00001")).toBe(
      true,
    );

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Pick a term" }).textContent).toContain("Alpha");
      expect(dropdownDescription()).toBe("Selected answer");
    });

    editor.destroy();
  });

  it("describes submitted dropdown review without leaking the unrevealed correct option", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:dropdown-1";
    editor.commands.setContent(dropdownRuntimeContent());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: { scaled: 0 },
            items: {
              choice_00001: { correct: false, expected: false, given: true },
              choice_00002: { correct: false, expected: true, given: false },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "single-select",
          correctOptionId: "choice_00002",
          feedbackByOptionId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "choices", "choice_00001");
    await waitFor(() => {
      expect(dropdownDescription()).toBe("Selected answer");
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(dropdownDescription()).toBe("Submitted answer, incorrect");
      expect(Boolean(screen.queryByText("Beta"))).toBe(false);
    });

    editor.destroy();
  });

  it("describes the revealed dropdown correct value from the port payload", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:dropdown-1";
    editor.commands.setContent(dropdownRuntimeContent());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: { scaled: 0 },
            items: {
              choice_00001: { correct: false, expected: false, given: true },
              choice_00002: { correct: false, expected: true, given: false },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "single-select",
          correctOptionId: "choice_00002",
          feedbackByOptionId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "choices", "choice_00001");
    await waitFor(() => {
      expect(dropdownDescription()).toBe("Selected answer");
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(dropdownDescription()).toBe("Submitted answer, incorrect");
    });

    fireEvent.click(screen.getByText("Show answer"));

    await waitFor(() => {
      expect(
        document.body.querySelector(".sc-course-dropdown-select__correct-value")?.textContent,
      ).toContain("Beta");
      expect(screen.getByRole("combobox", { name: "Pick a term" }).textContent).toContain("Alpha");
      expect(dropdownDescription()).toBe("Submitted answer, incorrect");
    });

    editor.destroy();
  });

  it("reveals dropdown answers from port reveal payload, not authored choice attrs", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:dropdown-1";
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "dropdown",
          attrs: {
            id: "dropdown-1",
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: true,
              label: "Pick a term",
              placeholder: "Choose...",
              points: 1,
              maxAttempts: null,
            },
            assessment: {
              correctOptionId: "choice_00002",
              feedbackByOptionId: {},
              summaryFeedback: null,
            },
          },
          content: [
            emptyContent("assessment_title"),
            emptyContent("assessment_instructions"),
            emptyContent("assessment_prompt"),
            {
              type: "dropdown_choices_group",
              content: [
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00001" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Alpha" }],
                        },
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "One" }],
                        },
                      ],
                    },
                  ],
                },
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00002" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent("Beta"),
                    },
                  ],
                },
                {
                  type: "dropdown_choice",
                  attrs: { id: "choice_00003" },
                  content: [
                    {
                      type: "dropdown_choice_label",
                      content: dropdownChoiceLabelContent("Gamma"),
                    },
                  ],
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: { scaled: 0 },
            items: {
              choice_00001: { correct: false, expected: false, given: true },
              choice_00003: { correct: false, expected: true, given: false },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "single-select",
          correctOptionId: "choice_00003",
          feedbackByOptionId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "choices", "choice_00001");

    await waitFor(() => {
      expect(screen.getByText("Alpha One")).toBeInstanceOf(HTMLElement);
    });

    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Alpha One")).toBeInstanceOf(HTMLElement);
      expect(screen.queryByText("Beta")).toBeNull();
      expect(screen.queryByText("Gamma")).toBeNull();
    });

    fireEvent.click(screen.getByText("Show answer"));

    await waitFor(() => {
      expect(screen.getByText("Gamma")).toBeInstanceOf(HTMLElement);
      expect(screen.queryByText("Beta")).toBeNull();
    });

    editor.destroy();
  });
});
