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

import { matchingBlockDefinition } from "./matching-definition";
import {
  answerMatchesFromReveal,
  describeMatchingItemAccessibilityState,
  describeMatchingTargetAccessibilityState,
  getMatchingConnectorPath,
} from "./matching-fields";
import { MatchingAuthoringExtension } from "./matching-authoring-extension";
import { MatchingRuntimeExtension } from "./matching-runtime-extension";

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
      createRuntimeBlockFrameAttributesExtension([matchingBlockDefinition.nodeType]),
      BoundedRegionTestNode,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      editable ? AssessmentActionsGroupNode : AssessmentActionsGroupRuntimeNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      editable ? MatchingAuthoringExtension : MatchingRuntimeExtension,
    ],
  });
}

function createDisposableMatchingEditor(content: JSONContent) {
  return createDisposableEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([matchingBlockDefinition.nodeType]),
      BoundedRegionTestNode,
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      MatchingAuthoringExtension,
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

function fieldContent(text = ""): JSONContent[] {
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

function matchingDoc(attrs: Record<string, unknown> = {}) {
  return {
    type: "doc",
    content: [
      {
        type: "matching",
        attrs: {
          id: "matching-1",
          assessment: {
            correctPairs: [
              { itemId: "i1", targetId: "t1" },
              { itemId: "i2", targetId: "t2" },
            ],
            feedbackByItemId: { i1: richFeedback("Good term match") },
            summaryFeedback: null,
          },
          settings: {
            feedbackMode: "on_submit",
            isGraded: true,
            showAnswer: false,
            legend: "Match terms",
            points: 4,
            maxAttempts: 2,
          },
          ...attrs,
        },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "matching_pairs_group",
            content: [
              {
                type: "matching_pair",
                attrs: { itemId: "i1", targetId: "t1" },
                content: [
                  { type: "matching_item", content: fieldContent("Term 1") },
                  {
                    type: "matching_target",
                    content: fieldContent("Target 1"),
                  },
                ],
              },
              {
                type: "matching_pair",
                attrs: { itemId: "i2", targetId: "t2" },
                content: [
                  { type: "matching_item", content: fieldContent("Term 2") },
                  {
                    type: "matching_target",
                    content: fieldContent("Target 2"),
                  },
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

function matchingBlock(attrs: Record<string, unknown> = {}): JSONContent {
  const block = matchingDoc(attrs).content?.[0];
  if (!block) throw new Error("Expected matching block fixture");
  return block;
}

function matchingRuntimeDoc(attrs: Record<string, unknown> = {}): JSONContent {
  const baseContent = matchingDoc().content?.[0]?.content ?? [];
  return {
    type: "doc",
    content: [
      {
        type: "matching",
        attrs: {
          id: "matching-1",
          assessment: {
            correctPairs: [
              { itemId: "i1", targetId: "t1" },
              { itemId: "i2", targetId: "t2" },
            ],
            feedbackByItemId: { i1: richFeedback("Good term match") },
            summaryFeedback: null,
          },
          settings: {
            feedbackMode: "on_submit",
            isGraded: true,
            showAnswer: true,
            legend: "Match terms",
            points: 1,
            maxAttempts: null,
          },
          ...attrs,
        },
        content: baseContent,
      },
    ],
  };
}

function describedText(selector: string): string | null {
  const element = document.body.querySelector(selector);
  const describedBy = element?.getAttribute("aria-describedby");
  return describedBy ? (document.getElementById(describedBy)?.textContent ?? null) : null;
}

describe("composite matching node", () => {
  it("declares bounded fill placement", () => {
    expect(matchingBlockDefinition.boundedPlacement).toBe("fill");
  });

  it("describes matching runtime accessibility states", () => {
    expect(
      describeMatchingItemAccessibilityState({
        interactionLocked: false,
        matched: false,
        selected: true,
      }),
    ).toBe("Selected item");

    expect(
      describeMatchingTargetAccessibilityState({
        activeDrop: false,
        correct: false,
        hasFeedback: false,
        matchedItemIndex: 1,
        revealed: false,
        submitted: true,
      }),
    ).toBe("Matched with item 1. Submitted match, incorrect");

    expect(
      describeMatchingTargetAccessibilityState({
        activeDrop: false,
        correct: true,
        hasFeedback: true,
        matchedItemIndex: 1,
        revealed: true,
        submitted: true,
      }),
    ).toBe("Matched with item 1. Revealed correct match. Feedback available");
  });

  it("registers only the outer matching block in the insert catalog", () => {
    const nodeTypes = builtInInsertCatalog.actions.map((item) => item.nodeType);

    expect(nodeTypes).toContain("matching");
    expect(nodeTypes).not.toContain("matching_pairs_group");
    expect(nodeTypes).not.toContain("matching_pair");
    expect(nodeTypes).not.toContain("matching_item");
    expect(nodeTypes).not.toContain("matching_target");
  });

  it("persists author feedback for the selected matching item", async () => {
    const editor = makeEditor();
    const user = userEvent.setup();
    editor.commands.setContent(matchingDoc());

    renderAssessmentEditor(editor);

    const pair = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-node="matching-pair"][data-item-id="i2"]',
      );
      expect(element).toBeInstanceOf(HTMLElement);
      return element as HTMLElement;
    });
    await user.click(within(pair).getByRole("button", { name: "Add feedback" }));
    const feedbackEditor = await screen.findByLabelText("Feedback editor");
    expect(feedbackEditor.getAttribute("data-attr-rich-text-field")).toBe("matching:i2:feedback");

    fireEvent.paste(feedbackEditor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Review the second match." : ""),
      },
    });

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs?.["assessment"]).toMatchObject({
        feedbackByItemId: { i2: richFeedback("Review the second match.") },
      });
    });

    editor.destroy();
  });

  it("reorders authored pairs through a ProseMirror transaction", () => {
    const editor = makeEditor();
    editor.commands.setContent(matchingDoc());

    let secondPairPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "matching_pair" && node.attrs["itemId"] === "i2") {
        secondPairPos = pos;
      }
    });

    expect(moveSiblingNode(editor, secondPairPos!, "up")).toBe(true);
    const blockJson = editor.getJSON().content?.[0] as JSONContent | undefined;
    const group = blockJson?.content?.[3] as JSONContent | undefined;
    expect(group?.content?.map((pair) => pair.attrs?.["itemId"])).toEqual(["i2", "i1"]);

    editor.destroy();
  });

  it("deletes the requested matching pair from a disposable editor fixture", async () => {
    const fixture = createDisposableMatchingEditor({
      type: "doc",
      content: [
        matchingDoc().content?.[0] as JSONContent,
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep after matching" }],
        },
      ],
    });

    renderAssessmentEditor(fixture.editor);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Delete matching pair 2",
      }),
    );

    await waitFor(() => {
      expect(screen.queryByText("Term 2")).toBeNull();
    });

    const matching = fixture.json().content?.[0] as JSONContent | undefined;
    const group = matching?.content?.[3] as JSONContent | undefined;
    const pairIds = group?.content?.map((pair) => [
      pair.attrs?.["itemId"],
      pair.attrs?.["targetId"],
    ]);

    expect(fixture.topLevelNodeTypes()).toEqual(["matching", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after matching");
    expect(fixture.editor.state.doc.textContent).toContain("Term 1");
    expect(fixture.editor.state.doc.textContent).toContain("Target 1");
    expect(pairIds).toEqual([["i1", "t1"]]);

    fixture.destroy();
  });

  it("exposes contained movement anchors and handles in editable mode only", async () => {
    const editableEditor = makeEditor(true);
    editableEditor.commands.setContent(matchingDoc());
    const editableView = renderAssessmentEditor(editableEditor);

    await waitFor(() => {
      expect(document.body.querySelector("[data-contained-movement-target]")).toBeInstanceOf(
        HTMLElement,
      );
      expect(document.body.querySelector("[data-contained-movement-handle]")).toBeInstanceOf(
        HTMLElement,
      );
    });
    expect(document.body.querySelector('button[aria-label="Move matching pair up"]')).toBeNull();
    expect(document.body.querySelector('button[aria-label="Move matching pair down"]')).toBeNull();
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

  it("marks bounded authoring matching pairs as the internal scroll lane", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-authoring" },
          content: [matchingBlock({ id: "block-matching-bounded-authoring" })],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-matching-bounded-authoring"]`,
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element?.getAttribute("data-bounded-placement")).toBe("fill");
      return element;
    });
    const shell = frame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const pairs = frame?.querySelector<HTMLElement>('[data-slot="matching-pairs-group"]');
    const scrollLane = pairs?.querySelector<HTMLElement>("[data-assessment-bounded-scroll]");
    const hint = pairs?.querySelector<HTMLElement>("[data-assessment-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(pairs).toBeInstanceOf(HTMLElement);
    expect(pairs?.getAttribute("data-assessment-bounded-scroll-frame")).toBe("");
    expect(pairs?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-assessment-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(scrollLane?.textContent).toContain("Term 1");
    expect(scrollLane?.textContent).toContain("Target 1");
    expect(scrollLane?.textContent).toContain("Add pair");
    expect(shell?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);

    editor.destroy();
  });

  it("marks bounded runtime matching pairs as one scroll lane while preserving matching controls", async () => {
    const editor = makeEditor(false);
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

    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-runtime" },
          content: [matchingBlock({ id: "block-matching-bounded-runtime" })],
        },
      ],
    });

    renderRuntimeEditor(editor, assessmentPort);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-runtime-frame="block"][data-id="block-matching-bounded-runtime"]',
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element?.getAttribute("data-bounded-placement")).toBe("fill");
      return element;
    });
    const shell = frame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const pairs = frame?.querySelector<HTMLElement>('[data-slot="matching-pairs-group"]');
    const scrollLane = pairs?.querySelector<HTMLElement>("[data-assessment-bounded-scroll]");
    const hint = pairs?.querySelector<HTMLElement>("[data-assessment-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(pairs).toBeInstanceOf(HTMLElement);
    expect(pairs?.getAttribute("data-assessment-bounded-scroll-frame")).toBe("");
    expect(pairs?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-assessment-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(scrollLane?.querySelectorAll("[data-matching-draggable-item]")).toHaveLength(2);
    expect(scrollLane?.querySelectorAll("[data-matching-drop-target]")).toHaveLength(2);
    expect(scrollLane?.querySelector(".sc-matching-runtime-canvas")).toBeInstanceOf(HTMLElement);
    expect(shell?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-assessment-bounded-scroll")).toBe(false);

    editor.destroy();
  });

  it("keeps runtime matching as item-to-target drag, not contained reordering", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(matchingDoc());
    const view = renderAssessmentEditor(editor);

    await waitFor(() => {
      expect(document.body.querySelectorAll("[data-matching-draggable-item]")).toHaveLength(2);
      expect(document.body.querySelectorAll("[data-matching-drop-target]")).toHaveLength(2);
    });

    const item = document.body.querySelector("[data-matching-draggable-item]");
    expect(item?.hasAttribute("draggable")).toBe(false);
    expect(document.body.querySelector("[data-contained-movement-target]")).toBeNull();
    expect(document.body.querySelector("[data-contained-movement-handle]")).toBeNull();
    expect(document.body.querySelector('button[aria-label="Move matching pair up"]')).toBeNull();

    view.unmount();
    editor.destroy();
  });

  it("round-trips a full composite tree across attrs and pair field nodes", () => {
    const editor = makeEditor();
    editor.commands.setContent(matchingDoc());

    const json = editor.getJSON();
    const matching = json.content?.[0] as JSONContent | undefined;
    expect(matching?.attrs?.["quick"]).toBeUndefined();
    expect(matching?.attrs).not.toHaveProperty("data");
    expect(matching?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: false,
      legend: "Match terms",
      points: 4,
      maxAttempts: 2,
    });
    expect(matching?.attrs?.["assessment"]).toMatchObject({
      correctPairs: [
        { itemId: "i1", targetId: "t1" },
        { itemId: "i2", targetId: "t2" },
      ],
      feedbackByItemId: { i1: richFeedback("Good term match") },
    });
    expect(matching?.content?.length).toBe(5);
    const children = matching?.content as JSONContent[] | undefined;
    const group = children?.[3];
    expect(group?.type).toBe("matching_pairs_group");
    expect(children?.[4]?.type).toBe("assessment_actions_group");
    const pairs = group?.content as JSONContent[] | undefined;
    expect(pairs?.map((pair) => [pair.attrs?.["itemId"], pair.attrs?.["targetId"]])).toEqual([
      ["i1", "t1"],
      ["i2", "t2"],
    ]);
    expect(pairs?.[0]?.content?.[0]?.type).toBe("matching_item");
    expect(pairs?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("Term 1");
    expect(pairs?.[0]?.content?.[1]?.type).toBe("matching_target");
    expect(pairs?.[0]?.content?.[1]?.content?.[0]?.content?.[0]?.text).toBe("Target 1");
    editor.destroy();
  });

  it("parses defaults when attrs are absent", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "matching",
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "matching_pairs_group",
              content: [
                {
                  type: "matching_pair",
                  attrs: { itemId: "i1", targetId: "t1" },
                  content: [
                    { type: "matching_item", content: fieldContent() },
                    { type: "matching_target", content: fieldContent() },
                  ],
                },
              ],
            },
            assessmentActions(),
          ],
        },
      ],
    });
    const matching = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(matching?.attrs?.["quick"]).toBeUndefined();
    expect(matching?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    editor.destroy();
  });

  it("lets shared assessment children resolve their matching ancestor", () => {
    const editor = makeEditor();
    editor.commands.setContent(matchingDoc());

    let itemPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "matching_item") itemPos = pos;
    });

    expect(findAncestorAssessmentId(editor, itemPos, ["matching"])).toBe("matching-1");
    editor.destroy();
  });

  it("describes selected and matched runtime item state", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:matching-1";
    editor.commands.setContent(matchingRuntimeDoc());
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

    fireEvent.click(screen.getByRole("button", { name: "Select matching item 1" }));

    await waitFor(() => {
      expect(describedText('[data-item-id="i1"][data-matching-draggable-item]')).toBe(
        "Selected item",
      );
      expect(describedText('[data-target-id="t2"][data-matching-drop-target]')).toBe(
        "Ready to match selected item",
      );
    });

    fireEvent.click(
      document.body.querySelector('[data-target-id="t2"][data-matching-drop-target]')!,
    );

    await waitFor(() => {
      expect(describedText('[data-item-id="i1"][data-matching-draggable-item]')).toBe(
        "Matched item",
      );
      expect(describedText('[data-target-id="t2"][data-matching-drop-target]')).toBe(
        "Matched with item 1",
      );
    });
    const matchedSource = document.body.querySelector(
      '[data-item-id="i1"][data-matching-draggable-item]',
    );
    expect(matchedSource?.getAttribute("aria-disabled")).toBe("true");
    expect(matchedSource?.getAttribute("tabindex")).toBe("-1");

    editor.destroy();
  });

  it("describes submitted matching correctness", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:matching-1";
    editor.commands.setContent(matchingRuntimeDoc());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              i1: { correct: false, expected: "t1", given: "t2" },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "match",
          correctPairs: [
            { itemId: "i1", targetId: "t1" },
            { itemId: "i2", targetId: "t2" },
          ],
          feedbackByItemId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "matches", {
      i1: "t2",
    });

    await waitFor(() => {
      expect(describedText('[data-target-id="t2"][data-matching-drop-target]')).toBe(
        "Matched with item 1",
      );
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(describedText('[data-target-id="t2"][data-matching-drop-target]')).toBe(
        "Matched with item 1. Submitted match, incorrect",
      );
    });

    editor.destroy();
  });

  it("describes revealed matching correct pair from the port payload", async () => {
    const editor = makeEditor(false);
    const problemId = "artifact:artifact-1/block:matching-1";
    editor.commands.setContent(matchingRuntimeDoc());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              i1: { correct: false, expected: "t1", given: "t2" },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "match",
          correctPairs: [
            { itemId: "i1", targetId: "t1" },
            { itemId: "i2", targetId: "t2" },
          ],
          feedbackByItemId: {
            i1: richFeedback("Good term match"),
          },
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "matches", {
      i1: "t2",
    });

    await waitFor(() => {
      expect(describedText('[data-target-id="t2"][data-matching-drop-target]')).toBe(
        "Matched with item 1",
      );
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Show answer")).toBeInstanceOf(HTMLButtonElement);
    });
    fireEvent.click(screen.getByText("Show answer"));

    await waitFor(() => {
      expect(document.body.querySelector('[data-target-id="t1"]')?.textContent).toContain("Term 1");
      expect(describedText('[data-target-id="t1"][data-matching-drop-target]')).toBe(
        "Matched with item 1. Revealed correct match. Feedback available",
      );
    });

    editor.destroy();
  });
});

describe("matching reveal parsing", () => {
  it("draws matching connectors as cubic bezier paths", () => {
    expect(
      getMatchingConnectorPath({
        startX: 10,
        startY: 20,
        endX: 110,
        endY: 80,
      }),
    ).toBe("M 10 20 C 40 20, 80 80, 110 80");
  });

  it("reads revealed matches from the canonical match assessment schema", () => {
    expect(
      answerMatchesFromReveal({
        kind: "match",
        correctPairs: [
          { itemId: "i1", targetId: "t1" },
          { itemId: "i2", targetId: "t2" },
        ],
        feedbackByItemId: { i2: richFeedback("Good") },
      }),
    ).toEqual({ i1: "t1", i2: "t2" });
  });

  it("does not accept legacy reveal match shapes", () => {
    expect(
      answerMatchesFromReveal({
        i1: { correctMatch: "t1" },
      }),
    ).toEqual({});
  });
});
