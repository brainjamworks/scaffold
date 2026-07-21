// @vitest-environment happy-dom

import { Editor, Node as TiptapNode, type JSONContent } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  setAssessmentResponseField,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import type { AssessmentPort } from "@/host/ports";
import { moveSiblingNode } from "@/editor/prosemirror/move-sibling/move-sibling-node";
import { AUTHORING_FRAME_ATTR } from "@/editor/interactions/dom/authoring-frame";
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

import { sequencingBlockDefinition } from "./sequencing-definition";
import { SequencingAuthoringExtension } from "./sequencing-authoring-extension";
import { SequencingRuntimeExtension } from "./sequencing-runtime-extension";
import {
  describeSequencingItemAccessibilityState,
  getSequencingDisplayOrder,
  getSequencingReorderedOrder,
  revealedSequenceAssessment,
  revealedSequenceOrder,
} from "./sequencing-fields";

const canonicalAssessmentResult = { maxScore: 1 as const, feedback: null, items: {} };

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
      createRuntimeBlockFrameAttributesExtension([sequencingBlockDefinition.nodeType]),
      BoundedRegionTestNode,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      editable ? AssessmentActionsGroupNode : AssessmentActionsGroupRuntimeNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      editable ? SequencingAuthoringExtension : SequencingRuntimeExtension,
    ],
  });
}

function createDisposableSequencingEditor(content: JSONContent) {
  return createDisposableEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([sequencingBlockDefinition.nodeType]),
      BoundedRegionTestNode,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      SequencingAuthoringExtension,
    ],
    content,
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

beforeEach(() => {
  assessmentStore = null;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

function itemContent(text = ""): JSONContent[] {
  return [
    {
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ];
}

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

function sequencingRuntimeDoc(attrs: Record<string, unknown> = {}): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "sequencing",
        attrs: {
          id: "seq-1",
          assessment: {
            correctOrder: ["a", "b", "c"],
            feedbackByItemId: {
              b: richFeedback("Second step."),
            },
          },
          settings: {
            feedbackMode: "on_submit",
            isGraded: true,
            showAnswer: true,
            legend: "Order the steps",
            points: 1,
            maxAttempts: null,
          },
          ...attrs,
        },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "sequencing_items_group",
            content: [
              {
                type: "sequencing_item",
                attrs: { id: "a" },
                content: itemContent("Alpha"),
              },
              {
                type: "sequencing_item",
                attrs: { id: "b" },
                content: itemContent("Beta"),
              },
              {
                type: "sequencing_item",
                attrs: { id: "c" },
                content: itemContent("Gamma"),
              },
            ],
          },
          assessmentActions(),
        ],
      },
    ],
  };
}

function sequencingBlock(attrs: Record<string, unknown> = {}): JSONContent {
  const block = sequencingRuntimeDoc(attrs).content?.[0];
  if (!block) throw new Error("Expected sequencing block fixture");
  return block;
}

function sequencingItemDescription(index: number): string | null {
  const item = screen.getByRole("listitem", {
    name: `Sequencing item ${index}`,
  });
  const describedBy = item.getAttribute("aria-describedby");
  return describedBy ? (document.getElementById(describedBy)?.textContent ?? null) : null;
}

describe("composite sequencing node", () => {
  it("declares bounded fill placement", () => {
    expect(sequencingBlockDefinition.boundedPlacement).toBe("fill");
  });

  it("describes sequencing runtime accessibility states", () => {
    expect(
      describeSequencingItemAccessibilityState({
        canReorder: true,
        correct: null,
        hasFeedback: false,
        position: 1,
        revealed: false,
        submitted: false,
        total: 3,
      }),
    ).toBe("Position 1 of 3. Reorderable");

    expect(
      describeSequencingItemAccessibilityState({
        canReorder: false,
        correct: false,
        hasFeedback: false,
        position: 1,
        revealed: false,
        submitted: true,
        total: 3,
      }),
    ).toBe("Position 1 of 3. Submitted position, incorrect");

    expect(
      describeSequencingItemAccessibilityState({
        canReorder: false,
        correct: true,
        hasFeedback: true,
        position: 2,
        revealed: true,
        submitted: true,
        total: 3,
      }),
    ).toBe("Position 2 of 3. Revealed correct position. Feedback available");
  });

  it("registers only the outer sequencing block in the insert catalog", () => {
    const nodeTypes = builtInInsertCatalog.actions.map((item) => item.nodeType);

    expect(nodeTypes).toContain("sequencing");
    expect(nodeTypes).not.toContain("sequencing_items_group");
    expect(nodeTypes).not.toContain("sequencing_item");
  });

  it("persists author feedback for the selected sequencing item", async () => {
    const editor = makeEditor();
    const user = userEvent.setup();
    editor.commands.setContent(sequencingRuntimeDoc());

    renderAssessmentEditor(editor);

    const item = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-node="sequencing-item"][data-item-id="a"]',
      );
      expect(element).toBeInstanceOf(HTMLElement);
      return element as HTMLElement;
    });
    await user.click(within(item).getByRole("button", { name: "Add feedback" }));
    const feedbackEditor = await screen.findByLabelText("Feedback editor");
    expect(feedbackEditor.getAttribute("data-attr-rich-text-field")).toBe("sequencing:a:feedback");

    fireEvent.paste(feedbackEditor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Start with Alpha." : ""),
      },
    });

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs?.["assessment"]).toMatchObject({
        feedbackByItemId: { a: richFeedback("Start with Alpha.") },
      });
    });

    editor.destroy();
  });

  it("reorders authored items through a ProseMirror transaction", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "sequencing",
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "sequencing_items_group",
              content: [
                {
                  type: "sequencing_item",
                  attrs: { id: "a" },
                  content: itemContent("A"),
                },
                {
                  type: "sequencing_item",
                  attrs: { id: "b" },
                  content: itemContent("B"),
                },
                {
                  type: "sequencing_item",
                  attrs: { id: "c" },
                  content: itemContent("C"),
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });

    let itemBPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "sequencing_item" && node.attrs["id"] === "b") {
        itemBPos = pos;
      }
    });

    expect(moveSiblingNode(editor, itemBPos!, "up")).toBe(true);

    editor.destroy();
  });

  it("deletes the requested sequencing item from a disposable editor fixture", async () => {
    const fixture = createDisposableSequencingEditor({
      type: "doc",
      content: [
        {
          type: "sequencing",
          attrs: {
            id: "sequencing-delete-item",
            assessment: {
              correctOrder: ["a", "b", "c"],
              feedbackByItemId: {},
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
              type: "sequencing_items_group",
              content: [
                {
                  type: "sequencing_item",
                  attrs: { id: "a" },
                  content: itemContent("Alpha"),
                },
                {
                  type: "sequencing_item",
                  attrs: { id: "b" },
                  content: itemContent("Beta"),
                },
                {
                  type: "sequencing_item",
                  attrs: { id: "c" },
                  content: itemContent("Gamma"),
                },
              ],
            },
            assessmentActions(),
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep after sequencing" }],
        },
      ],
    });

    renderAssessmentEditor(fixture.editor);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete sequencing item 2",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Beta")).toBeNull();
    });

    const sequencing = fixture.json().content?.[0] as JSONContent | undefined;
    const group = sequencing?.content?.[3] as JSONContent | undefined;
    const itemIds = group?.content?.map((item) => item.attrs?.["id"]);

    expect(fixture.topLevelNodeTypes()).toEqual(["sequencing", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after sequencing");
    expect(fixture.editor.state.doc.textContent).toContain("Alpha");
    expect(fixture.editor.state.doc.textContent).toContain("Gamma");
    expect(itemIds).toEqual(["a", "c"]);

    fixture.destroy();
  });

  it("exposes contained movement anchors and handles in editable mode only", async () => {
    const editableEditor = makeEditor(true);
    editableEditor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "sequencing",
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "sequencing_items_group",
              content: [
                {
                  type: "sequencing_item",
                  attrs: { id: "a" },
                  content: itemContent("A"),
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });
    const editableView = renderAssessmentEditor(editableEditor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-contained-movement-target]")).toBeInstanceOf(
        HTMLElement,
      );
      expect(document.body.querySelector("[data-contained-movement-handle]")).toBeInstanceOf(
        HTMLElement,
      );
    });
    expect(screen.queryByLabelText("Move sequencing item up")).toBeNull();
    expect(screen.queryByLabelText("Move sequencing item down")).toBeNull();
    expect(screen.getByLabelText("Add feedback")).toBeInstanceOf(HTMLElement);
    const doc = editableEditor.getJSON();
    editableView.unmount();
    editableEditor.destroy();
    cleanup();

    const runtimeEditor = makeEditor(false);
    runtimeEditor.commands.setContent(doc);
    const runtimeView = renderAssessmentEditor(runtimeEditor);

    expect(document.body.querySelector("[data-contained-movement-target]")).toBeNull();
    expect(document.body.querySelector("[data-contained-movement-handle]")).toBeNull();
    runtimeView.unmount();
    runtimeEditor.destroy();
  });

  it("marks bounded authoring sequencing items as the internal scroll lane", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-authoring" },
          content: [sequencingBlock({ id: "block-sequencing-bounded-authoring" })],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-sequencing-bounded-authoring"]`,
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element?.getAttribute("data-bounded-placement")).toBe("fill");
      return element;
    });
    const shell = frame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const items = frame?.querySelector<HTMLElement>('[data-slot="sequencing-items-group"]');
    const scrollLane = items?.querySelector<HTMLElement>("[data-assessment-bounded-scroll]");
    const hint = items?.querySelector<HTMLElement>("[data-assessment-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(items).toBeInstanceOf(HTMLElement);
    expect(items?.getAttribute("data-assessment-bounded-scroll-frame")).toBe("");
    expect(items?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-assessment-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(scrollLane?.textContent).toContain("Alpha");
    expect(scrollLane?.textContent).toContain("Add item");
    expect(shell?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);

    editor.destroy();
  });

  it("marks bounded runtime sequencing items as the internal scroll lane while preserving order", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:block-sequencing-bounded-runtime";
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-runtime" },
          content: [sequencingBlock({ id: "block-sequencing-bounded-runtime" })],
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
            score: 0,
            items: {},
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-runtime-frame="block"][data-id="block-sequencing-bounded-runtime"]',
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element?.getAttribute("data-bounded-placement")).toBe("fill");
      return element;
    });
    const shell = frame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const items = frame?.querySelector<HTMLElement>('[data-slot="sequencing-items-group"]');
    const scrollLane = items?.querySelector<HTMLElement>("[data-assessment-bounded-scroll]");
    const hint = items?.querySelector<HTMLElement>("[data-assessment-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(items).toBeInstanceOf(HTMLElement);
    expect(items?.getAttribute("data-assessment-bounded-scroll-frame")).toBe("");
    expect(items?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-assessment-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(shell?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "order", ["c", "a", "b"]);

    await waitFor(() => {
      expect(screen.getByRole("listitem", { name: "Sequencing item 1" }).textContent).toContain(
        "Gamma",
      );
      expect(scrollLane?.querySelector(".sc-sequencing-runtime-list")?.textContent).toContain(
        "Gamma",
      );
      expect(sequencingItemDescription(1)).toBe("Position 1 of 3. Reorderable");
    });

    editor.destroy();
  });

  it("round-trips a full composite tree across settings attrs", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "sequencing",
          attrs: {
            assessment: {
              correctOrder: ["a", "b", "c"],
              feedbackByItemId: { b: richFeedback("Second step.") },
            },
            settings: {
              feedbackMode: "on_submit",
              isGraded: true,
              showAnswer: false,
              legend: "Order the steps",
              points: 5,
              maxAttempts: 2,
            },
          },
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
                  content: [{ type: "text", text: "Arrange" }],
                },
              ],
            },
            {
              type: "sequencing_items_group",
              content: [
                {
                  type: "sequencing_item",
                  attrs: { id: "a" },
                  content: itemContent("A"),
                },
                {
                  type: "sequencing_item",
                  attrs: { id: "b" },
                  content: itemContent("B"),
                },
                {
                  type: "sequencing_item",
                  attrs: { id: "c" },
                  content: itemContent("C"),
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });
    const json = editor.getJSON();
    const seq = json.content?.[0] as JSONContent | undefined;
    expect(seq?.attrs?.["quick"]).toBeUndefined();
    expect(seq?.attrs).not.toHaveProperty("data");
    expect(seq?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: false,
      legend: "Order the steps",
      points: 5,
      maxAttempts: 2,
    });
    expect(seq?.attrs?.["assessment"]).toMatchObject({
      correctOrder: ["a", "b", "c"],
      feedbackByItemId: { b: richFeedback("Second step.") },
    });
    expect(seq?.content?.length).toBe(5);
    const children = seq?.content as JSONContent[] | undefined;
    const group = children?.[3];
    expect(group?.type).toBe("sequencing_items_group");
    expect(children?.[4]?.type).toBe("assessment_actions_group");
    expect(group?.content?.map((i) => i.attrs?.["id"])).toEqual(["a", "b", "c"]);
    expect(group?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("A");
    editor.destroy();
  });

  it("parses defaults when attrs are absent", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "sequencing",
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "sequencing_items_group",
              content: [
                {
                  type: "sequencing_item",
                  attrs: { id: "only" },
                  content: itemContent(),
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });
    const seq = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(seq?.attrs?.["quick"]).toBeUndefined();
    expect(seq?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    editor.destroy();
  });

  it("lets shared assessment children resolve their sequencing ancestor", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "sequencing",
          attrs: { id: "seq-1" },
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "sequencing_items_group",
              content: [
                {
                  type: "sequencing_item",
                  attrs: { id: "only" },
                  content: itemContent(),
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });

    let hintsGroupPos: number | undefined;
    let summaryFeedbackPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "assessment_hints_group") hintsGroupPos = pos;
      if (node.type.name === "assessment_summary_feedback") summaryFeedbackPos = pos;
    });

    expect(findAncestorAssessmentId(editor, hintsGroupPos, ["sequencing"])).toBe("seq-1");
    expect(findAncestorAssessmentId(editor, summaryFeedbackPos, ["sequencing"])).toBe("seq-1");
    editor.destroy();
  });

  it("exposes sequencing item position and reorderable state before submission", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:seq-1";
    editor.commands.setContent(sequencingRuntimeDoc());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {},
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "order", ["c", "a", "b"]);

    await waitFor(() => {
      expect(screen.getByRole("listitem", { name: "Sequencing item 1" }).textContent).toContain(
        "Gamma",
      );
      expect(sequencingItemDescription(1)).toBe("Position 1 of 3. Reorderable");
    });
    const firstItem = screen.getByRole("listitem", {
      name: "Sequencing item 1",
    });
    expect(firstItem.className).toContain("sc-sequencing-item--runtime");
    const runtimeHandle = document.body.querySelector("[data-runtime-sequencing-handle]");
    expect(runtimeHandle).not.toBeNull();

    editor.destroy();
  });

  it("describes submitted sequencing position correctness", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:seq-1";
    editor.commands.setContent(sequencingRuntimeDoc());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              c: { correct: false, expected: 3, given: 1 },
              a: { correct: false, expected: 1, given: 2 },
              b: { correct: false, expected: 2, given: 3 },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "sequence",
          correctOrder: ["a", "b", "c"],
          feedbackByItemId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "order", ["c", "a", "b"]);
    await waitFor(() => {
      expect(sequencingItemDescription(1)).toBe("Position 1 of 3. Reorderable");
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByRole("listitem", { name: "Sequencing item 1" }).textContent).toContain(
        "Gamma",
      );
      expect(sequencingItemDescription(1)).toBe("Position 1 of 3. Submitted position, incorrect");
    });

    editor.destroy();
  });

  it("describes revealed sequencing correct order from the port payload", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:seq-1";
    editor.commands.setContent(sequencingRuntimeDoc());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              c: { correct: false, expected: 3, given: 1 },
              a: { correct: false, expected: 1, given: 2 },
              b: { correct: false, expected: 2, given: 3 },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "sequence",
          correctOrder: ["a", "b", "c"],
          feedbackByItemId: {
            b: richFeedback("Second step."),
          },
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "order", ["c", "a", "b"]);
    await waitFor(() => {
      expect(sequencingItemDescription(1)).toBe("Position 1 of 3. Reorderable");
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Show answer")).toBeInstanceOf(HTMLButtonElement);
    });
    fireEvent.click(screen.getByText("Show answer"));

    await waitFor(() => {
      expect(screen.getByRole("listitem", { name: "Sequencing item 1" }).textContent).toContain(
        "Alpha",
      );
      expect(screen.getByRole("listitem", { name: "Sequencing item 2" }).textContent).toContain(
        "Beta",
      );
      expect(sequencingItemDescription(2)).toBe(
        "Position 2 of 3. Revealed correct position. Feedback available",
      );
    });

    editor.destroy();
  });
});

describe("sequencing display order", () => {
  it("reads revealed order from the canonical sequence assessment schema", () => {
    expect(
      revealedSequenceOrder({
        kind: "sequence",
        correctOrder: ["a", "b", "c"],
      }),
    ).toEqual(["a", "b", "c"]);
  });

  it("reads revealed item feedback from the canonical sequence assessment schema", () => {
    expect(
      revealedSequenceAssessment({
        kind: "sequence",
        correctOrder: ["a", "b", "c"],
        feedbackByItemId: { b: richFeedback("Second step.") },
      }),
    ).toEqual({
      correctOrder: ["a", "b", "c"],
      feedbackByItemId: { b: richFeedback("Second step.") },
    });
  });

  it("does not accept legacy reveal order shapes", () => {
    expect(revealedSequenceOrder({ order: ["a", "b", "c"] })).toEqual([]);
  });

  it("uses response order in runtime when it matches the document item set", () => {
    expect(
      getSequencingDisplayOrder({
        isEditable: false,
        answerKeyVisible: false,
        docOrderIds: ["a", "b", "c"],
        responseOrder: ["c", "a", "b"],
      }),
    ).toEqual(["c", "a", "b"]);
  });

  it("falls back to document order for stale runtime responses", () => {
    expect(
      getSequencingDisplayOrder({
        isEditable: false,
        answerKeyVisible: false,
        docOrderIds: ["a", "b", "c"],
        responseOrder: ["c", "a"],
      }),
    ).toEqual(["a", "b", "c"]);
  });

  it("uses revealed answer order when the answer is revealed", () => {
    expect(
      getSequencingDisplayOrder({
        isEditable: false,
        answerKeyVisible: true,
        docOrderIds: ["c", "a", "b"],
        answerOrderIds: ["a", "b", "c"],
        responseOrder: ["c", "a", "b"],
      }),
    ).toEqual(["a", "b", "c"]);
  });

  it("moves a dragged runtime item before the drop target", () => {
    expect(
      getSequencingReorderedOrder({
        order: ["a", "b", "c", "d"],
        sourceId: "d",
        targetId: "b",
        placement: "before",
      }),
    ).toEqual(["a", "d", "b", "c"]);
  });

  it("moves a dragged runtime item after the drop target", () => {
    expect(
      getSequencingReorderedOrder({
        order: ["a", "b", "c", "d"],
        sourceId: "a",
        targetId: "c",
        placement: "after",
      }),
    ).toEqual(["b", "c", "a", "d"]);
  });
});
