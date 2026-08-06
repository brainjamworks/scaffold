// @vitest-environment happy-dom

import { Editor, Node as TiptapNode, type JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

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
import { findAncestorAssessmentBlockId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import { sequencingBlockDefinition } from "./sequencing-definition";
import { SequencingAuthoringExtension } from "./sequencing-authoring-extension";
import { SequencingRuntimeExtension } from "./sequencing-runtime-extension";
import { addSequencingItem, deleteSequencingItem } from "./commands";
import { projectSequencingInteraction, projectSequencingLearnerNode } from "./assessment";
import {
  describeSequencingItemAccessibilityState,
  getSequencingDisplayOrder,
  getSequencingReorderedOrder,
  reconcileSequencingOrder,
  revealedSequenceAssessment,
  revealedSequenceOrder,
  resolveAuthorizedSequenceOrder,
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

function makeEditor(editable = true, undoRedo = false) {
  return new Editor({
    editable,
    extensions: [
      StarterKit.configure({ undoRedo: undoRedo ? {} : false, paragraph: false }),
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
    createElement(CourseThemeProvider, {
      theme: createDefaultPersistedCourseTheme(),
      appearance: "light",
      children: createAssessmentRuntimeTestRoot({
        assessment: assessmentPort,
        children: createElement(EditorContent, { editor }),
        onStore: captureAssessmentStore,
      }),
    }),
  );
}

let assessmentStore: AssessmentStoreApi | null = null;
function captureAssessmentStore(store: AssessmentStoreApi | null) {
  assessmentStore = store;
}
function renderAssessmentEditor(editor: Editor) {
  return render(
    createElement(CourseThemeProvider, {
      theme: createDefaultPersistedCourseTheme(),
      appearance: "light",
      children: createAssessmentRuntimeTestRoot({
        children: createElement(EditorContent, { editor }),
        onStore: captureAssessmentStore,
      }),
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
  const item = sequencingItemAt(index);
  const describedBy = item.getAttribute("aria-describedby");
  return describedBy ? (document.getElementById(describedBy)?.textContent ?? null) : null;
}

function sequencingItemAt(index: number): HTMLElement {
  const item = within(screen.getByRole("list", { name: "Order the steps" })).getAllByRole(
    "listitem",
  )[index - 1];
  if (!item) throw new Error(`Missing sequencing list item ${index}`);
  return item;
}

function sequencingSnapshot(editor: Editor) {
  const sequencing = editor.getJSON().content?.[0];
  const group = sequencing?.content?.find((child) => child.type === "sequencing_items_group") as
    | JSONContent
    | undefined;
  const assessment = sequencing?.attrs?.["assessment"] as
    | { correctOrder?: string[]; feedbackByItemId?: Record<string, unknown> }
    | undefined;
  return {
    itemIds: group?.content?.map((item) => String(item.attrs?.["id"] ?? "")) ?? [],
    correctOrder: assessment?.correctOrder ?? [],
    feedbackIds: Object.keys(assessment?.feedbackByItemId ?? {}),
  };
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

  it("reorders document and private order in one undoable ProseMirror transaction", () => {
    const editor = makeEditor(true, true);
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "sequencing",
          attrs: {
            assessment: {
              correctOrder: ["a", "b", "c"],
              feedbackByItemId: { b: richFeedback("Keep with Beta") },
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
    editor.view.dispatch(closeHistory(editor.state.tr));

    let itemBPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "sequencing_item" && node.attrs["id"] === "b") {
        itemBPos = pos;
      }
    });

    let transactionCount = 0;
    editor.on("transaction", () => {
      transactionCount += 1;
    });

    expect(moveSiblingNode(editor, itemBPos!, "up")).toBe(true);
    expect(transactionCount).toBe(1);
    expect(sequencingSnapshot(editor)).toMatchObject({
      itemIds: ["b", "a", "c"],
      correctOrder: ["b", "a", "c"],
      feedbackIds: ["b"],
    });

    expect(editor.commands.undo()).toBe(true);
    expect(sequencingSnapshot(editor)).toMatchObject({
      itemIds: ["a", "b", "c"],
      correctOrder: ["a", "b", "c"],
      feedbackIds: ["b"],
    });
    expect(editor.commands.redo()).toBe(true);
    expect(sequencingSnapshot(editor)).toMatchObject({
      itemIds: ["b", "a", "c"],
      correctOrder: ["b", "a", "c"],
      feedbackIds: ["b"],
    });

    editor.destroy();
  });

  it("adds document and private order in one undoable ProseMirror transaction", () => {
    const editor = makeEditor(true, true);
    editor.commands.setContent(sequencingRuntimeDoc());
    editor.view.dispatch(closeHistory(editor.state.tr));
    let groupPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "sequencing_items_group") groupPos = pos;
    });
    let transactionCount = 0;
    editor.on("transaction", () => {
      transactionCount += 1;
    });

    expect(addSequencingItem(editor, groupPos)).toBe(true);
    const added = sequencingSnapshot(editor);
    expect(transactionCount).toBe(1);
    expect(added.itemIds).toHaveLength(4);
    expect(added.correctOrder).toEqual(added.itemIds);
    expect(new Set(added.itemIds).size).toBe(4);

    expect(editor.commands.undo()).toBe(true);
    expect(sequencingSnapshot(editor).itemIds).toEqual(["a", "b", "c"]);
    expect(editor.commands.redo()).toBe(true);
    expect(sequencingSnapshot(editor)).toMatchObject({
      itemIds: added.itemIds,
      correctOrder: added.itemIds,
    });
    editor.destroy();
  });

  it("deletes document order and keyed feedback in one undoable transaction", () => {
    const editor = makeEditor(true, true);
    editor.commands.setContent(sequencingRuntimeDoc());
    editor.view.dispatch(closeHistory(editor.state.tr));
    let itemBPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "sequencing_item" && node.attrs["id"] === "b") itemBPos = pos;
    });
    let transactionCount = 0;
    editor.on("transaction", () => {
      transactionCount += 1;
    });

    expect(deleteSequencingItem(editor, itemBPos)).toBe(true);
    expect(transactionCount).toBe(1);
    expect(sequencingSnapshot(editor)).toEqual({
      itemIds: ["a", "c"],
      correctOrder: ["a", "c"],
      feedbackIds: [],
    });

    expect(editor.commands.undo()).toBe(true);
    expect(sequencingSnapshot(editor)).toEqual({
      itemIds: ["a", "b", "c"],
      correctOrder: ["a", "b", "c"],
      feedbackIds: ["b"],
    });
    expect(editor.commands.redo()).toBe(true);
    expect(sequencingSnapshot(editor).itemIds).toEqual(["a", "c"]);
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
              feedbackByItemId: { b: richFeedback("Remove with Beta") },
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
    expect(sequencing?.attrs?.["assessment"]).toMatchObject({
      correctOrder: ["a", "c"],
      feedbackByItemId: {},
    });

    fixture.destroy();
  });

  it("keeps deletion unavailable at the two-item minimum", async () => {
    const editor = makeEditor();
    const document = sequencingRuntimeDoc();
    const group = document.content?.[0]?.content?.[3];
    const block = document.content?.[0];
    group?.content?.splice(2, 1);
    if (block?.attrs) {
      block.attrs["assessment"] = {
        correctOrder: ["a", "b"],
        feedbackByItemId: {},
        summaryFeedback: null,
      };
    }
    editor.commands.setContent(document);

    renderAssessmentEditor(editor);

    expect(await screen.findByRole("button", { name: "Delete sequencing item 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete sequencing item 2" })).toBeDisabled();
    editor.destroy();
  });

  it("composes authoring rows and controls as named Course-owned list UI", async () => {
    const editor = makeEditor();
    editor.commands.setContent(sequencingRuntimeDoc());
    renderAssessmentEditor(editor);

    const list = await screen.findByRole("list", { name: "Order the steps" });
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(
      within(list)
        .getAllByRole("listitem")
        .every((item) => !item.hasAttribute("aria-label")),
    ).toBe(true);
    const movement = within(list).getByRole("button", {
      name: "Reorder ‘Alpha’, position 1 of 3",
    });
    expect(movement).toHaveClass("sc-course-assessment-choice__authoring-action");
    expect(movement.className).not.toContain("sc-app-");
    expect(
      within(list)
        .getAllByRole("button", { name: "Add feedback" })
        .every((button) =>
          button.classList.contains("sc-course-assessment-choice__authoring-action"),
        ),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Add item" })).toHaveClass(
      "sc-course-assessment-choice-add",
    );
    editor.destroy();
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
    const scrollLane = items?.querySelector<HTMLElement>("[data-bounded-scroll]");
    const hint = items?.querySelector<HTMLElement>("[data-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(items).toBeInstanceOf(HTMLElement);
    expect(items?.getAttribute("data-bounded-scroll-frame")).toBe("");
    expect(items?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(scrollLane?.textContent).toContain("Alpha");
    expect(scrollLane?.textContent).toContain("Add item");
    expect(shell?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-bounded-scroll")).toBe(false);

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
    const scrollLane = items?.querySelector<HTMLElement>("[data-bounded-scroll]");
    const hint = items?.querySelector<HTMLElement>("[data-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(items).toBeInstanceOf(HTMLElement);
    expect(items?.getAttribute("data-bounded-scroll-frame")).toBe("");
    expect(items?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(shell?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-bounded-scroll")).toBe(false);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "order", ["c", "a", "b"]);

    await waitFor(() => {
      expect(sequencingItemAt(1).textContent).toContain("Gamma");
      expect(scrollLane?.querySelector(".sc-course-sequencing__list")?.textContent).toContain(
        "Gamma",
      );
      expect(sequencingItemDescription(1)).toBe("Position 1 of 3. Reorderable");
    });

    editor.destroy();
  });

  it("uses projected DOM order as the initial learner order and names the native ordered list", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:seq-1";
    editor.commands.setContent(sequencingRuntimeDoc());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: false, score: 0, items: {} },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);
    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    const list = await screen.findByRole("list", { name: "Order the steps" });
    expect(list.tagName).toBe("OL");
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      expect.stringContaining("Alpha"),
      expect.stringContaining("Beta"),
      expect.stringContaining("Gamma"),
    ]);
    expect(
      within(list).getByRole("button", {
        name: "Reorder ‘Alpha’, position 1 of 3",
      }),
    ).toBeInstanceOf(HTMLButtonElement);
    editor.destroy();
  });

  it("uses the assessment prompt to name the learner list when legend is blank", async () => {
    const editor = makeEditor(false);
    const document = sequencingRuntimeDoc();
    const block = document.content?.[0];
    const prompt = block?.content?.[2];
    if (!block?.attrs || !prompt) throw new Error("Missing Sequencing naming fixture");
    block.attrs["settings"] = {
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      legend: "   ",
      points: 1,
      maxAttempts: null,
    };
    prompt.content = itemContent("Arrange these process steps");
    editor.commands.setContent(document);
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: false, score: 0, items: {} },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);
    const list = await screen.findByRole("list", { name: "Arrange these process steps" });
    expect(list.getAttribute("aria-labelledby")).toBe("sc-assessment-prompt-seq-1");
    editor.destroy();
  });

  it("checks immediate Sequencing exactly once for a completed keyboard reorder, never init", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:seq-1";
    const document = sequencingRuntimeDoc();
    const block = document.content?.[0];
    if (!block?.attrs) throw new Error("Missing Sequencing immediate fixture");
    block.attrs["settings"] = {
      feedbackMode: "immediate",
      isGraded: true,
      showAnswer: true,
      legend: "Order the steps",
      points: 1,
      maxAttempts: null,
    };
    editor.commands.setContent(document);
    const check = vi.fn(async (args) =>
      assessmentProblemOutcome(
        {
          ...canonicalAssessmentResult,
          isCorrect: false,
          score: 0,
          items: {
            a: { correct: false, expected: 1, given: 2 },
            b: { correct: false, expected: 2, given: 1 },
            c: { correct: true, expected: 3, given: 3 },
          },
        },
        { response: args.response },
      ),
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      check,
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: false, score: 0, items: {} },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);
    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
      expect(screen.getByRole("list", { name: "Order the steps" })).toBeInstanceOf(
        HTMLOListElement,
      );
      expect(assessmentStore?.getState().durable.problems[problemId]?.response).toEqual({
        kind: "sequence",
        orderedItemIds: ["a", "b", "c"],
      });
    });
    expect(check).not.toHaveBeenCalled();

    const handle = screen.getByRole("button", {
      name: "Reorder ‘Alpha’, position 1 of 3",
    });
    screen.getAllByRole("listitem").forEach((item, index) => {
      vi.spyOn(item, "getBoundingClientRect").mockReturnValue({
        bottom: (index + 1) * 60,
        height: 48,
        left: 0,
        right: 320,
        top: index * 60,
        width: 320,
        x: 0,
        y: index * 60,
        toJSON: () => ({}),
      });
    });
    handle.focus();
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    await waitFor(() => {
      expect(handle.getAttribute("aria-pressed")).toBe("true");
    });
    fireEvent.keyDown(handle, { key: "ArrowDown", code: "ArrowDown" });
    await screen.findByText("‘Alpha’ moved to position 2 of 3.");
    fireEvent.keyDown(handle, { key: " ", code: "Space" });

    await waitFor(() => {
      expect(check).toHaveBeenCalledTimes(1);
    });
    editor.destroy();
  });

  it("retains handle focus after an on-submit keyboard reorder", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(sequencingRuntimeDoc());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: false, score: 0, items: {} },
          { response: args.response },
        ),
    };
    renderRuntimeEditor(editor, assessmentPort);
    const problemId = "artifact:artifact-1/block:seq-1";
    const handle = await waitFor(() => {
      expect(assessmentStore?.getState().durable.problems[problemId]?.response).toEqual({
        kind: "sequence",
        orderedItemIds: ["a", "b", "c"],
      });
      return screen.getByRole("button", {
        name: "Reorder ‘Alpha’, position 1 of 3",
      });
    });
    screen.getAllByRole("listitem").forEach((item, index) => {
      vi.spyOn(item, "getBoundingClientRect").mockReturnValue({
        bottom: (index + 1) * 60,
        height: 48,
        left: 0,
        right: 320,
        top: index * 60,
        width: 320,
        x: 0,
        y: index * 60,
        toJSON: () => ({}),
      });
    });
    handle.focus();
    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    await waitFor(() => {
      expect(handle.getAttribute("aria-pressed")).toBe("true");
    });
    fireEvent.keyDown(handle, { key: "ArrowDown", code: "ArrowDown" });
    await screen.findByText("‘Alpha’ moved to position 2 of 3.");
    fireEvent.keyDown(handle, { key: " ", code: "Space" });

    await waitFor(() => {
      expect(handle.getAttribute("aria-label")).toBe("Reorder ‘Alpha’, position 2 of 3");
    });
    expect(globalThis.document.activeElement).toBe(handle);
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

    expect(findAncestorAssessmentBlockId(editor, hintsGroupPos, ["sequencing"])).toBe("seq-1");
    expect(findAncestorAssessmentBlockId(editor, summaryFeedbackPos, ["sequencing"])).toBe("seq-1");
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
      expect(sequencingItemAt(1).textContent).toContain("Gamma");
      expect(sequencingItemDescription(1)).toBe("Position 1 of 3. Reorderable");
    });
    const firstItem = sequencingItemAt(1);
    expect(firstItem.className).toContain("sc-course-sequencing__item");
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
      expect(sequencingItemAt(1).textContent).toContain("Gamma");
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
      expect(screen.getByRole("button", { name: "Show correct answer" })).toBeInstanceOf(
        HTMLButtonElement,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Show correct answer" }));

    await waitFor(() => {
      expect(screen.getByText("Correct order shown")).toBeVisible();
      expect(sequencingItemAt(1).textContent).toContain("Alpha");
      expect(sequencingItemAt(2).textContent).toContain("Beta");
      expect(sequencingItemDescription(2)).toBe(
        "Position 2 of 3. Revealed correct position. Feedback available",
      );
    });
    expect(assessmentStore?.getState().durable.problems[problemId]?.response).toEqual({
      kind: "sequence",
      orderedItemIds: ["c", "a", "b"],
    });

    editor.destroy();
  });
});

describe("sequencing display order", () => {
  it("projects the public runtime interaction after private answer state is redacted", () => {
    const authored = sequencingRuntimeDoc().content?.[0];
    if (!authored) throw new Error("Missing Sequencing projection fixture");
    const learner = projectSequencingLearnerNode(authored);

    expect(learner.attrs).not.toHaveProperty("assessment");
    expect(projectSequencingInteraction(learner)).toEqual({
      kind: "sequence",
      items: expect.arrayContaining([
        { id: "a", label: "Alpha" },
        { id: "b", label: "Beta" },
        { id: "c", label: "Gamma" },
      ]),
    });
  });

  it("initializes from the projected DOM order without another shuffle", () => {
    expect(reconcileSequencingOrder([], ["projected-c", "projected-a", "projected-b"])).toEqual([
      "projected-c",
      "projected-a",
      "projected-b",
    ]);
  });

  it("preserves surviving response ids and appends missing ids in projected order", () => {
    expect(
      reconcileSequencingOrder(
        ["deleted", "projected-b", "projected-a"],
        ["projected-c", "projected-a", "projected-b", "projected-d"],
      ),
    ).toEqual(["projected-b", "projected-a", "projected-c", "projected-d"]);
  });

  it("rejects duplicate response or projected identities during reconciliation", () => {
    expect(() => reconcileSequencingOrder(["a", "a"], ["a", "b"])).toThrow(
      "Sequence response item ids must be unique",
    );
    expect(() => reconcileSequencingOrder(["a"], ["a", "a"])).toThrow(
      "Projected sequence item ids must be nonblank and unique",
    );
    expect(() => reconcileSequencingOrder(["a"], ["a", " "])).toThrow(
      "Projected sequence item ids must be nonblank and unique",
    );
  });

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

  it("does not accept duplicate revealed ids as a complete answer order", () => {
    expect(
      getSequencingDisplayOrder({
        isEditable: false,
        answerKeyVisible: true,
        docOrderIds: ["c", "a", "b"],
        answerOrderIds: ["a", "a", "c"],
        responseOrder: ["c", "a", "b"],
      }),
    ).toEqual(["c", "a", "b"]);
  });

  it("prefers a valid authorized reveal and otherwise reconstructs a complete result order", () => {
    expect(
      resolveAuthorizedSequenceOrder({
        answerKeyVisible: true,
        currentItemIds: ["c", "a", "b"],
        revealedOrderIds: ["a", "b", "c"],
        resultItems: {
          a: { expected: 2 },
          b: { expected: 1 },
          c: { expected: 3 },
        },
      }),
    ).toEqual(["a", "b", "c"]);

    expect(
      resolveAuthorizedSequenceOrder({
        answerKeyVisible: true,
        currentItemIds: ["c", "a", "b"],
        revealedOrderIds: ["a", "a", "c"],
        resultItems: {
          a: { expected: 0 },
          b: { expected: 1 },
          c: { expected: 2 },
        },
      }),
    ).toEqual(["a", "b", "c"]);
  });

  it("does not reconstruct answer order from unauthorized or incomplete result positions", () => {
    const resultItems = {
      a: { expected: 0 },
      b: { expected: 0 },
      c: { expected: 2 },
    };
    expect(
      resolveAuthorizedSequenceOrder({
        answerKeyVisible: false,
        currentItemIds: ["a", "b", "c"],
        revealedOrderIds: ["a", "b", "c"],
        resultItems,
      }),
    ).toEqual([]);
    expect(
      resolveAuthorizedSequenceOrder({
        answerKeyVisible: true,
        currentItemIds: ["a", "b", "c"],
        revealedOrderIds: [],
        resultItems,
      }),
    ).toEqual([]);
    expect(
      resolveAuthorizedSequenceOrder({
        answerKeyVisible: true,
        currentItemIds: ["a", "b", "c"],
        revealedOrderIds: [],
        resultItems: { a: { expected: 0 }, b: { expected: 1 } },
      }),
    ).toEqual([]);
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
