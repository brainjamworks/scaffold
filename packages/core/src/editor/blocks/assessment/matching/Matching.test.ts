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
import { MovementKeyboardProvider } from "@/editor/drag/view/movement-keyboard-context";

import { matchingBlockDefinition } from "./matching-definition";
import {
  answerMatchesFromReveal,
  describeMatchingItemAccessibilityState,
  describeMatchingTargetAccessibilityState,
  getMatchingConnectorCoordinates,
  getMatchingConnectorPath,
  reconcileMatchingMatches,
  resolveAuthorizedMatchingReveal,
} from "./matching-fields";
import { MatchingAuthoringExtension } from "./matching-authoring-extension";
import { MatchingRuntimeExtension } from "./matching-runtime-extension";
import {
  addMatchingPair,
  canDeleteMatchingPair,
  deleteMatchingPair,
  moveMatchingPair,
} from "./commands";

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

function renderRuntimeEditor(
  editor: Editor,
  assessmentPort: AssessmentPort,
  initialSnapshot?: unknown,
) {
  render(
    createElement(CourseThemeProvider, {
      theme: createDefaultPersistedCourseTheme(),
      appearance: "light",
      children: createAssessmentRuntimeTestRoot({
        assessment: assessmentPort,
        children: createElement(EditorContent, { editor }),
        ...(initialSnapshot === undefined ? {} : { initialSnapshot }),
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
        children: createElement(MovementKeyboardProvider, {
          value: {
            moveContained: (sourcePos, direction) => {
              moveMatchingPair(editor, sourcePos, direction === "forward" ? "down" : "up");
            },
          },
          children: createElement(EditorContent, { editor }),
        }),
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
        matchedItemLabel: "Golden eagle",
        revealed: false,
        submitted: true,
      }),
    ).toBe("Matched with ‘Golden eagle’. Submitted match, incorrect");

    expect(
      describeMatchingTargetAccessibilityState({
        activeDrop: false,
        correct: true,
        hasFeedback: true,
        matchedItemLabel: "Golden eagle",
        revealed: true,
        submitted: true,
      }),
    ).toBe("Matched with ‘Golden eagle’. Revealed correct match. Feedback available");
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
    await user.click(within(pair).getByRole("button", { name: "Add feedback for item ‘Term 2’" }));
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

  it("restores focus to a pair's Course movement action after keyboard reordering", async () => {
    const editor = makeEditor();
    editor.commands.setContent(matchingDoc());
    renderAssessmentEditor(editor);
    const move = await screen.findByRole("button", { name: "Move matching pair 1, Term 1" });

    move.focus();
    fireEvent.keyDown(move, { key: "ArrowDown" });

    await waitFor(() => {
      expect(document.activeElement).toHaveAccessibleName("Move matching pair 2, Term 1");
    });
    editor.destroy();
  });

  it("moves authored pairs atomically with their private mapping and undo history", () => {
    const editor = makeEditor(true, true);
    editor.commands.setContent(matchingDoc());
    editor.view.dispatch(closeHistory(editor.state.tr));

    let secondPairPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "matching_pair" && node.attrs["itemId"] === "i2") {
        secondPairPos = pos;
      }
    });

    expect(moveMatchingPair(editor, secondPairPos!, "up")).toBe(true);
    const blockJson = editor.getJSON().content?.[0] as JSONContent | undefined;
    const group = blockJson?.content?.[3] as JSONContent | undefined;
    expect(group?.content?.map((pair) => pair.attrs?.["itemId"])).toEqual(["i2", "i1"]);
    expect(blockJson?.attrs?.["assessment"]).toMatchObject({
      correctPairs: [
        { itemId: "i2", targetId: "t2" },
        { itemId: "i1", targetId: "t1" },
      ],
    });

    expect(editor.commands.undo()).toBe(true);
    const restored = editor.getJSON().content?.[0] as JSONContent;
    expect(restored.content?.[3]?.content?.map((pair) => pair.attrs?.["itemId"])).toEqual([
      "i1",
      "i2",
    ]);
    expect(restored.attrs?.["assessment"]).toMatchObject({
      correctPairs: [
        { itemId: "i1", targetId: "t1" },
        { itemId: "i2", targetId: "t2" },
      ],
    });

    editor.destroy();
  });

  it("adds and deletes Matching pairs atomically while protecting the final pair", () => {
    const editor = makeEditor(true, true);
    editor.commands.setContent(
      matchingDoc({
        assessment: {
          correctPairs: [
            { itemId: "i1", targetId: "t1" },
            { itemId: "i2", targetId: "t2" },
          ],
          feedbackByItemId: {
            i1: richFeedback("First"),
            i2: richFeedback("Second"),
          },
          summaryFeedback: richFeedback("Summary"),
        },
      }),
    );
    editor.view.dispatch(closeHistory(editor.state.tr));
    let groupPos = -1;
    let secondPairPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "matching_pairs_group") groupPos = pos;
      if (node.type.name === "matching_pair" && node.attrs["itemId"] === "i2") {
        secondPairPos = pos;
      }
    });

    expect(addMatchingPair(editor, groupPos)).toBe(true);
    let matching = editor.getJSON().content?.[0] as JSONContent;
    let pairs = matching.content?.[3]?.content ?? [];
    expect(pairs).toHaveLength(3);
    expect(matching.attrs?.["assessment"]).toMatchObject({
      correctPairs: pairs.map((pair) => ({
        itemId: pair.attrs?.["itemId"],
        targetId: pair.attrs?.["targetId"],
      })),
    });
    expect(editor.commands.undo()).toBe(true);
    matching = editor.getJSON().content?.[0] as JSONContent;
    expect(matching.content?.[3]?.content).toHaveLength(2);

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "matching_pair" && node.attrs["itemId"] === "i2") {
        secondPairPos = pos;
      }
    });
    expect(deleteMatchingPair(editor, secondPairPos)).toBe(true);
    matching = editor.getJSON().content?.[0] as JSONContent;
    expect(matching.attrs?.["assessment"]).toEqual({
      correctPairs: [{ itemId: "i1", targetId: "t1" }],
      feedbackByItemId: { i1: richFeedback("First") },
      summaryFeedback: richFeedback("Summary"),
    });
    let firstPairPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "matching_pair") firstPairPos = pos;
    });
    expect(canDeleteMatchingPair(editor, firstPairPos)).toBe(false);
    expect(deleteMatchingPair(editor, firstPairPos)).toBe(false);
    expect(editor.commands.undo()).toBe(true);
    matching = editor.getJSON().content?.[0] as JSONContent;
    expect(matching.attrs?.["assessment"]).toMatchObject({
      feedbackByItemId: { i1: richFeedback("First"), i2: richFeedback("Second") },
    });
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
    const scrollLane = pairs?.querySelector<HTMLElement>("[data-bounded-scroll]");
    const hint = pairs?.querySelector<HTMLElement>("[data-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(pairs).toBeInstanceOf(HTMLElement);
    expect(pairs?.getAttribute("data-bounded-scroll-frame")).toBe("");
    expect(pairs?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(scrollLane?.textContent).toContain("Term 1");
    expect(scrollLane?.textContent).toContain("Target 1");
    expect(scrollLane?.textContent).toContain("Add pair");
    expect(shell?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-bounded-scroll")).toBe(false);

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
    const scrollLane = pairs?.querySelector<HTMLElement>("[data-bounded-scroll]");
    const hint = pairs?.querySelector<HTMLElement>("[data-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(pairs).toBeInstanceOf(HTMLElement);
    expect(pairs?.getAttribute("data-bounded-scroll-frame")).toBe("");
    expect(pairs?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(scrollLane?.getAttribute("data-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(scrollLane?.querySelectorAll("[data-matching-draggable-item]")).toHaveLength(2);
    expect(scrollLane?.querySelectorAll("[data-matching-drop-target]")).toHaveLength(2);
    expect(scrollLane?.querySelector(".sc-course-matching__canvas")).toBeInstanceOf(HTMLElement);
    expect(shell?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-bounded-scroll")).toBe(false);

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

    expect(findAncestorAssessmentBlockId(editor, itemPos, ["matching"])).toBe("matching-1");
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

    fireEvent.click(screen.getByRole("button", { name: "Select ‘Term 1’, item 1 of 2" }));

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
        "Matched with ‘Term 1’",
      );
    });
    const matchedSource = document.body.querySelector(
      '[data-item-id="i1"][data-matching-draggable-item]',
    );
    expect(
      within(matchedSource as HTMLElement).getByRole("button", {
        name: "Select ‘Term 1’, item 1 of 2",
      }),
    ).toBeDisabled();

    editor.destroy();
  });

  it("uses content-derived native Matching controls without button-role target containers", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(matchingRuntimeDoc());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: false, score: 0, items: {} },
          { response: args.response },
        ),
    };
    renderRuntimeEditor(editor, assessmentPort);
    const responseGroup = await screen.findByRole("group", { name: "Match terms" });

    expect(
      within(responseGroup).getByRole("button", { name: "Select ‘Term 1’, item 1 of 2" }),
    ).toBeInTheDocument();
    expect(within(responseGroup).getByText("0 of 2 pairs matched")).toHaveAttribute(
      "role",
      "status",
    );
    const target = within(responseGroup).getByRole("group", { name: "Target ‘Target 1’" });
    expect(target).not.toHaveAttribute("role", "button");

    fireEvent.click(
      responseGroup.querySelector('[data-item-id="i1"][data-matching-draggable-item]')!,
    );
    const place = within(target).getByRole("button", {
      name: "Match ‘Term 1’ with ‘Target 1’",
    });
    expect(place).toBeEmptyDOMElement();
    await userEvent.click(place);

    await waitFor(() => {
      expect(within(responseGroup).getByText("1 of 2 pairs matched")).toBeInTheDocument();
      expect(
        within(target).getByRole("group", { name: "Matched ‘Term 1’ with ‘Target 1’" }),
      ).toBeInTheDocument();
      expect(
        within(target).getByRole("button", { name: "Remove ‘Term 1’ from ‘Target 1’" }),
      ).toBeInTheDocument();
    });
    editor.destroy();
  });

  it("requires every matching item to have a target before enabling submit", async () => {
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

    setAssessmentResponseField(assessmentStore, problemId, "matches", {
      i1: "t1",
    });

    await waitFor(() => {
      expect(describedText('[data-target-id="t1"][data-matching-drop-target]')).toBe(
        "Matched with ‘Term 1’",
      );
      expect(
        screen.getByRole("button", {
          name: "Submit",
          description: "Complete the response before submitting.",
        }),
      ).toBeDisabled();
    });

    setAssessmentResponseField(assessmentStore, problemId, "matches", {
      i1: "t2",
      i2: "t1",
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Submit" })).toBeEnabled();
    });

    editor.destroy();
  });

  it("checks an immediate Matching mapping only when a new complete mapping is committed", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(
      matchingRuntimeDoc({
        settings: {
          feedbackMode: "immediate",
          isGraded: true,
          showAnswer: true,
          legend: "Match terms",
          points: 1,
          maxAttempts: null,
        },
      }),
    );
    const check = vi.fn(async (args) =>
      assessmentProblemOutcome(
        { ...canonicalAssessmentResult, isCorrect: false, score: 0.5, items: {} },
        {
          response: args.response,
          submitted: false,
          checkResult: {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0.5,
            items: {},
          },
          submissionResult: null,
        },
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
    await waitFor(() =>
      expect(
        hasAssessmentRegistration(assessmentStore, "artifact:artifact-1/block:matching-1"),
      ).toBe(true),
    );

    fireEvent.click(
      document.body.querySelector('[data-item-id="i1"][data-matching-draggable-item]')!,
    );
    fireEvent.click(
      document.body.querySelector('[data-target-id="t1"][data-matching-drop-target]')!,
    );
    await waitFor(() =>
      expect(
        assessmentStore?.getState().durable.problems["artifact:artifact-1/block:matching-1"],
      ).toMatchObject({ response: { kind: "match", pairs: [{ itemId: "i1", targetId: "t1" }] } }),
    );
    expect(check).not.toHaveBeenCalled();

    fireEvent.click(
      document.body.querySelector('[data-item-id="i2"][data-matching-draggable-item]')!,
    );
    fireEvent.click(
      document.body.querySelector('[data-target-id="t2"][data-matching-drop-target]')!,
    );
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));
    editor.destroy();
  });

  it("canonicalizes unlocked hydrated Matching state without checking or consuming an attempt", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(matchingRuntimeDoc());
    const problemId = "artifact:artifact-1/block:matching-1";
    const check = vi.fn();
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      check,
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: false, score: 0, items: {} },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort, {
      snapshotVersion: 2,
      artifactId: "artifact-1",
      problems: {
        "matching-1": {
          response: {
            kind: "match",
            pairs: [
              { itemId: "deleted-item", targetId: "t2" },
              { itemId: "i1", targetId: "t1" },
              { itemId: "i2", targetId: "deleted-target" },
            ],
          },
          submitted: false,
          attemptNumber: 0,
          hintsShown: 0,
          checkResult: null,
          submissionResult: null,
        },
      },
      quizzes: {},
    });

    await waitFor(() => {
      expect(assessmentStore?.getState().durable.problems[problemId]).toMatchObject({
        response: { kind: "match", pairs: [{ itemId: "i1", targetId: "t1" }] },
        attemptNumber: 0,
        submitted: false,
      });
    });
    expect(check).not.toHaveBeenCalled();
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
      i2: "t1",
    });

    await waitFor(() => {
      expect(describedText('[data-target-id="t2"][data-matching-drop-target]')).toBe(
        "Matched with ‘Term 1’",
      );
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(describedText('[data-target-id="t2"][data-matching-drop-target]')).toBe(
        "Matched with ‘Term 1’. Submitted match, incorrect",
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
      i2: "t1",
    });

    await waitFor(() => {
      expect(describedText('[data-target-id="t2"][data-matching-drop-target]')).toBe(
        "Matched with ‘Term 1’",
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Show correct answer" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Show correct answer" }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-target-id="t1"]')?.textContent).toContain("Term 1");
      expect(describedText('[data-target-id="t1"][data-matching-drop-target]')).toBe(
        "Matched with ‘Term 1’. Revealed correct match. Feedback available",
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

  it("normalises matching connector coordinates for a scaled slideshow canvas", () => {
    expect(
      getMatchingConnectorCoordinates({
        canvasHeight: 500,
        canvasWidth: 1_000,
        containerRect: { height: 250, left: 100, top: 50, width: 500 },
        itemRect: { height: 40, right: 350, top: 100 },
        targetRect: { height: 60, left: 500, top: 150 },
      }),
    ).toEqual({
      endX: 795,
      endY: 260,
      startX: 505,
      startY: 140,
    });
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

  it("reconciles Matching state to current unique item and target memberships", () => {
    expect(
      reconcileMatchingMatches(
        {
          i1: "t1",
          i2: "deleted-target",
          i3: "t1",
          deleted: "t2",
        },
        ["i1", "i2", "i3", "new-item"],
        ["t1", "t2", "t3", "t4"],
      ),
    ).toEqual({ i1: "t1" });
    expect(() => reconcileMatchingMatches({}, ["i1", "i1"], ["t1", "t2"])).toThrow(
      "Matching interaction item ids must be nonblank and unique",
    );
    expect(() => reconcileMatchingMatches({}, ["i1"], ["t1", " "])).toThrow(
      "Matching interaction target ids must be nonblank and unique",
    );
  });

  it("reconstructs only a complete host-authorized Matching review mapping", () => {
    const current = { itemIds: ["i1", "i2"], targetIds: ["t1", "t2"] };
    expect(
      resolveAuthorizedMatchingReveal({
        answerKeyVisible: true,
        answers: {
          kind: "match",
          correctPairs: [
            { itemId: "i1", targetId: "t1" },
            { itemId: "i2", targetId: "t2" },
          ],
          feedbackByItemId: { i1: richFeedback("Good term match") },
        },
        feedbackItems: null,
        ...current,
      }),
    ).toEqual({
      matches: { i1: "t1", i2: "t2" },
      feedbackByItemId: { i1: richFeedback("Good term match") },
    });

    expect(
      resolveAuthorizedMatchingReveal({
        answerKeyVisible: true,
        answers: null,
        feedbackItems: {
          i1: { correct: false, expected: "t1", given: "t2" },
          i2: { correct: false, expected: "t2", given: "t1" },
        },
        ...current,
      }),
    ).toEqual({ matches: { i1: "t1", i2: "t2" }, feedbackByItemId: {} });

    expect(
      resolveAuthorizedMatchingReveal({
        answerKeyVisible: false,
        answers: null,
        feedbackItems: {
          i1: { correct: false, expected: "t1" },
          i2: { correct: false, expected: "t2" },
        },
        ...current,
      }),
    ).toBeNull();
    expect(
      resolveAuthorizedMatchingReveal({
        answerKeyVisible: true,
        answers: null,
        feedbackItems: { i1: { correct: false, expected: "t1" } },
        ...current,
      }),
    ).toBeNull();
  });
});
