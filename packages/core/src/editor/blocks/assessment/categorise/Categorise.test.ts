// @vitest-environment happy-dom

import { Editor, Node as TiptapNode, type JSONContent } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { EditorMovementLayer } from "@/editor/drag/view/EditorMovementLayer";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { builtInInsertCatalog } from "@/editor/insertion/built-in-insert-catalog";
import {
  assessmentProblemOutcome,
  createAssessmentRuntimeTestRoot,
  hasAssessmentRegistration,
  localAssessmentResponse,
  setAssessmentResponseField,
} from "@/runtime/assessment/test-utils";
import type { AssessmentStoreApi } from "@/runtime/assessment/types";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { createDisposableEditor } from "@/editor/testing/disposable-editor";
import type { AssessmentPort, AssessmentSubmitRequest } from "@/host/ports";
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
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import { createDefaultPersistedCourseTheme } from "@/theme/course/default-course-theme";

import "./categorise-definition";
import { CategoriseAuthoringExtension } from "./categorise-authoring-extension";
import { categoriseBlockDefinition } from "./categorise-definition";
import { CategoriseRuntimeExtension } from "./categorise-runtime-extension";
import {
  projectCategoriseAssessment,
  projectCategoriseInteraction,
  projectCategoriseLearnerNode,
} from "./assessment";
import {
  describeCategoriseCategoryAccessibilityState,
  describeCategorisePlacedItemAccessibilityState,
  describeCategoriseSourceItemAccessibilityState,
} from "./categorise-fields";
import {
  categoriseItemPublicLabel,
  reconcileCategorisePlacements,
  resolveAuthorizedCategoriseReveal,
} from "./categorise-fields-shared";
import { deleteCategoriseCategory, deleteCategoriseItem, reassignCategoriseItem } from "./commands";

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
      createRuntimeBlockFrameAttributesExtension([categoriseBlockDefinition.nodeType]),
      BoundedRegionTestNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      editable ? AssessmentActionsGroupNode : AssessmentActionsGroupRuntimeNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      editable ? CategoriseAuthoringExtension : CategoriseRuntimeExtension,
    ],
  });
}

function createDisposableCategoriseEditor(content: JSONContent) {
  return createDisposableEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([categoriseBlockDefinition.nodeType]),
      BoundedRegionTestNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      CategoriseAuthoringExtension,
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

function renderMovementEditor(editor: Editor) {
  return render(
    createElement(CourseThemeProvider, {
      theme: createDefaultPersistedCourseTheme(),
      appearance: "light",
      children: createAssessmentRuntimeTestRoot({
        children: createElement(
          InteractionProvider,
          { store: getInteractionFacadeStoreForEditor(editor) },
          createElement(
            EditorMovementLayer,
            {
              blockDefinitions: builtInBlockRegistry,
              editor,
              surfaceVariants: builtInSurfaceVariantRegistry,
            },
            createElement(EditorContent, { editor }),
          ),
        ),
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

function categoriseDoc(settings: Record<string, unknown> = {}) {
  return {
    type: "doc",
    content: [
      {
        type: "categorise",
        attrs: {
          id: "categorise-1",
          assessment: {
            feedbackByItemId: { eagle: richFeedback("Eagles are birds.") },
            summaryFeedback: null,
          },
          settings: {
            feedbackMode: "on_submit",
            isGraded: true,
            showAnswer: false,
            legend: "Sort animals",
            points: 4,
            maxAttempts: 2,
            ...settings,
          },
        },
        content: [
          { type: "assessment_title", content: [{ type: "paragraph" }] },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "categorise_content",
            content: [
              {
                type: "categorise_bins_group",
                content: [
                  {
                    type: "categorise_bin",
                    attrs: { id: "birds" },
                    content: [
                      {
                        type: "categorise_bin_title",
                        content: fieldContent("Birds"),
                      },
                      {
                        type: "categorise_items_group",
                        content: [
                          {
                            type: "categorise_item",
                            attrs: { id: "eagle" },
                            content: [
                              {
                                type: "categorise_item_body",
                                content: fieldContent("Eagle"),
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    type: "categorise_bin",
                    attrs: { id: "fish" },
                    content: [
                      {
                        type: "categorise_bin_title",
                        content: fieldContent("Fish"),
                      },
                      {
                        type: "categorise_items_group",
                        content: [
                          {
                            type: "categorise_item",
                            attrs: { id: "salmon" },
                            content: [
                              {
                                type: "categorise_item_body",
                                content: fieldContent("Salmon"),
                              },
                            ],
                          },
                        ],
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
  };
}

function categoriseBlock(attrs: Record<string, unknown> = {}): JSONContent {
  const block = categoriseDoc().content?.[0];
  if (!block) throw new Error("Expected categorise fixture block");
  return {
    ...block,
    attrs: {
      ...block.attrs,
      ...attrs,
    },
  };
}

function categoriseDocWithItemFeedback(itemId: string, feedback: string) {
  const doc = categoriseDoc() as JSONContent;
  const block = doc.content?.[0] as JSONContent | undefined;
  const assessment = block?.attrs?.["assessment"];
  if (block && typeof assessment === "object" && assessment !== null) {
    block.attrs = {
      ...block.attrs,
      assessment: {
        ...assessment,
        feedbackByItemId: {
          ...(assessment as { feedbackByItemId?: Record<string, unknown> }).feedbackByItemId,
          [itemId]: richFeedback(feedback),
        },
      },
    };
  }
  return doc;
}

function withEmptyCategoriseCategory(doc: JSONContent, id: string, label: string): JSONContent {
  const copy = structuredClone(doc);
  const bins = copy.content?.[0]?.content?.[3]?.content?.[0];
  if (!bins) throw new Error("Expected Categorise bins fixture");
  bins.content = [
    ...(bins.content ?? []),
    {
      type: "categorise_bin",
      attrs: { id },
      content: [
        { type: "categorise_bin_title", content: fieldContent(label) },
        { type: "categorise_items_group" },
      ],
    },
  ];
  return copy;
}

function learnerCategoriseDoc(settings: Record<string, unknown> = {}): JSONContent {
  const authoring = categoriseDoc(settings);
  const categorise = authoring.content?.[0] as JSONContent;
  return {
    type: "doc",
    content: [projectCategoriseLearnerNode(categorise)],
  };
}

function childOfType(node: JSONContent | undefined, type: string): JSONContent | undefined {
  return node?.content?.find((child) => child.type === type);
}

function describedText(selector: string): string | null {
  const element = document.body.querySelector(selector);
  const describedBy = element?.getAttribute("aria-describedby");
  return describedBy ? (document.getElementById(describedBy)?.textContent ?? null) : null;
}

beforeEach(() => {
  assessmentStore = null;
});

describe("composite categorise node", () => {
  it("describes categorise runtime accessibility states", () => {
    expect(
      describeCategoriseSourceItemAccessibilityState({
        interactionLocked: false,
        selected: true,
      }),
    ).toBe("Selected item");

    expect(
      describeCategoriseCategoryAccessibilityState({
        activeDrop: false,
        placedCount: 2,
      }),
    ).toBe("Contains 2 items");

    expect(
      describeCategorisePlacedItemAccessibilityState({
        correct: false,
        hasFeedback: false,
        revealed: false,
        submitted: true,
      }),
    ).toBe("Placed item. Submitted placement, incorrect");

    expect(
      describeCategorisePlacedItemAccessibilityState({
        correct: true,
        hasFeedback: true,
        revealed: true,
        submitted: true,
      }),
    ).toBe("Placed item. Revealed correct placement. Feedback available");
  });

  it("registers only the outer categorise block in the insert catalog", () => {
    const nodeTypes = builtInInsertCatalog.actions.map((item) => item.nodeType);

    expect(nodeTypes).toContain("categorise");
    expect(nodeTypes).not.toContain("categorise_content");
    expect(nodeTypes).not.toContain("categorise_bin");
    expect(nodeTypes).not.toContain("categorise_item");
  });

  it("declares fill placement for bounded containers", () => {
    expect(categoriseBlockDefinition.boundedPlacement).toBe("fill");
  });

  it("persists author feedback for the selected categorise item", async () => {
    const editor = makeEditor();
    const user = userEvent.setup();
    editor.commands.setContent(categoriseDoc());

    renderMovementEditor(editor);

    const item = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-node="categorise-item"][data-item-id="salmon"]',
      );
      expect(element).toBeInstanceOf(HTMLElement);
      return element as HTMLElement;
    });
    await user.click(within(item).getByRole("button", { name: "Add feedback for item ‘Salmon’" }));
    const feedbackEditor = await screen.findByLabelText("Feedback editor");
    expect(feedbackEditor.getAttribute("data-attr-rich-text-field")).toBe(
      "categorise:salmon:feedback",
    );

    fireEvent.paste(feedbackEditor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Salmon belong with fish." : ""),
      },
    });

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs?.["assessment"]).toMatchObject({
        feedbackByItemId: { salmon: richFeedback("Salmon belong with fish.") },
      });
    });

    editor.destroy();
  });

  it("marks bounded authoring categories and local controls as one internal scroll lane", async () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-authoring" },
          content: [categoriseBlock({ id: "block-categorise-bounded-authoring" })],
        },
      ],
    });

    renderAssessmentEditor(editor);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        `[${AUTHORING_FRAME_ATTR}="block"][data-id="block-categorise-bounded-authoring"]`,
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element?.getAttribute("data-bounded-placement")).toBe("fill");
      return element;
    });
    const shell = frame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const content = frame?.querySelector<HTMLElement>('[data-slot="categorise-content"]');
    const scrollLane = content?.querySelector<HTMLElement>("[data-bounded-scroll]");
    const hint = content?.querySelector<HTMLElement>("[data-bounded-scroll-hint]");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(content).toBeInstanceOf(HTMLElement);
    expect(content?.getAttribute("data-bounded-scroll-frame")).toBe("");
    expect(content?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(shell?.querySelectorAll("[data-bounded-scroll]")).toHaveLength(1);
    expect(scrollLane?.getAttribute("data-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(scrollLane?.textContent).toContain("Birds");
    expect(scrollLane?.textContent).toContain("Eagle");
    expect(scrollLane?.textContent).toContain("Add item to category 1");
    expect(scrollLane?.textContent).toContain("Add category");
    expect(
      scrollLane?.querySelector('[data-node="categorise-bin"] [data-bounded-scroll]'),
    ).toBeNull();
    expect(shell?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-bounded-scroll")).toBe(false);

    editor.destroy();
  });

  it("keeps runtime source choices before all bins in one bounded answer lane", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "region",
          attrs: { id: "bounded-region-runtime" },
          content: [
            projectCategoriseLearnerNode(
              categoriseBlock({ id: "block-categorise-bounded-runtime" }),
            ),
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
            score: 0,
            items: {},
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    const frame = await waitFor(() => {
      const element = document.body.querySelector<HTMLElement>(
        '[data-runtime-frame="block"][data-id="block-categorise-bounded-runtime"]',
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element?.getAttribute("data-bounded-placement")).toBe("fill");
      return element;
    });
    const shell = frame?.querySelector<HTMLElement>("[data-assessment-shell]");
    const content = frame?.querySelector<HTMLElement>('[data-slot="categorise-content"]');
    const scrollLane = content?.querySelector<HTMLElement>("[data-bounded-scroll]");
    const hint = content?.querySelector<HTMLElement>("[data-bounded-scroll-hint]");
    const source = scrollLane?.querySelector<HTMLElement>(".sc-course-categorise__source");
    const bins = scrollLane?.querySelector<HTMLElement>(".sc-course-categorise__bin-grid");

    expect(shell).toBeInstanceOf(HTMLElement);
    expect(content).toBeInstanceOf(HTMLElement);
    expect(content?.getAttribute("data-bounded-scroll-frame")).toBe("");
    expect(shell?.querySelectorAll("[data-bounded-scroll]")).toHaveLength(1);
    expect(scrollLane?.getAttribute("data-bounded-scroll")).toBe("");
    expect(hint?.textContent).toBe("Scroll for more ↓");
    expect(scrollLane?.nextElementSibling).toBe(hint);
    expect(source).toBeInstanceOf(HTMLElement);
    expect(bins).toBeInstanceOf(HTMLElement);
    expect(source?.nextElementSibling).toBe(bins);
    expect(source?.querySelectorAll("button[data-item-id]")).toHaveLength(2);
    expect(bins?.querySelectorAll('[role="group"][data-bin-id]')).toHaveLength(2);
    expect(bins?.querySelector("[data-bounded-scroll]")).toBeNull();
    expect(shell?.hasAttribute("data-bounded-scroll")).toBe(false);
    expect(frame?.hasAttribute("data-bounded-scroll")).toBe(false);

    editor.destroy();
  });

  it("reorders authored categories through ProseMirror transactions", () => {
    const editor = makeEditor();
    editor.commands.setContent(categoriseDoc());

    let fishBinPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "categorise_bin" && node.attrs["id"] === "fish") {
        fishBinPos = pos;
      }
    });

    expect(moveSiblingNode(editor, fishBinPos!, "up")).toBe(true);

    const blockJson = editor.getJSON().content?.[0] as JSONContent | undefined;
    const content = blockJson?.content?.[3] as JSONContent | undefined;
    const bins = (content?.content?.[0] as JSONContent | undefined)?.content ?? [];
    expect(bins.map((bin) => bin.attrs?.["id"])).toEqual(["fish", "birds"]);
    expect(projectCategoriseAssessment(blockJson!)).toMatchObject({
      correctPlacements: [
        { itemId: "salmon", categoryId: "fish" },
        { itemId: "eagle", categoryId: "birds" },
      ],
    });

    editor.destroy();
  });

  it("exposes contained movement anchors and handles in editable mode only", async () => {
    const editableEditor = makeEditor(true);
    editableEditor.commands.setContent(categoriseDoc());
    const editableView = renderMovementEditor(editableEditor);

    await waitFor(() => {
      expect(
        document.body.querySelectorAll(
          '[data-node="categorise-bin"][data-contained-movement-target]',
        ).length,
      ).toBe(2);
      expect(screen.getByRole("button", { name: "Move category 1, Birds" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Move category 2, Fish" })).toBeInTheDocument();
      expect(
        document.body.querySelector(
          '[data-node="categorise-item"][data-contained-movement-target]',
        ),
      ).toBeNull();
      expect(screen.queryByRole("button", { name: "Move categorise item" })).toBeNull();
    });
    const doc = editableEditor.getJSON();
    editableView.unmount();
    editableEditor.destroy();
    cleanup();

    const runtimeEditor = makeEditor(false);
    runtimeEditor.commands.setContent({
      type: "doc",
      content: [projectCategoriseLearnerNode(doc.content?.[0] as JSONContent)],
    });
    const runtimeView = renderAssessmentEditor(runtimeEditor);

    expect(document.body.querySelector("[data-contained-movement-target]")).toBeNull();
    expect(document.body.querySelector("[data-contained-movement-handle]")).toBeNull();
    runtimeView.unmount();
    runtimeEditor.destroy();
  });

  it("hides authoring mutation controls when the editor becomes read only", async () => {
    const editor = makeEditor(true);
    editor.commands.setContent(categoriseDoc());
    const view = renderMovementEditor(editor);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /move category/i })).toHaveLength(2);
    });

    act(() => editor.setEditable(false));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /move category/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /delete category/i })).toBeNull();
      expect(screen.queryByRole("button", { name: "Add category" })).toBeNull();
      expect(screen.queryByRole("button", { name: /add item to category/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /delete item/i })).toBeNull();
    });

    view.unmount();
    editor.destroy();
  });

  it("authors items inside their categories without assignment drag controls", async () => {
    const editor = makeEditor(true);
    editor.commands.setContent(categoriseDoc());
    const view = renderMovementEditor(editor);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(
        document.body.querySelector('[data-node="categorise-bin"][data-bin-id="birds"]'),
      ).not.toBeNull();
    });

    expect(screen.getByRole("group", { name: "Category ‘Birds’" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Category ‘Fish’" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item to category 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item to category 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Drag item to category" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move category up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move categorise item up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move categorise item" })).toBeNull();

    const binsGroup = document.body.querySelector('[data-slot="categorise-bins-group"]');
    expect(binsGroup?.className).toContain("sc-course-categorise__bins");

    const birdsBin = document.body.querySelector(
      '[data-node="categorise-bin"][data-bin-id="birds"]',
    ) as HTMLElement;
    const fishBin = document.body.querySelector(
      '[data-node="categorise-bin"][data-bin-id="fish"]',
    ) as HTMLElement;
    expect(birdsBin.textContent).toContain("Eagle");
    expect(fishBin.textContent).toContain("Salmon");

    await user.click(within(birdsBin).getByRole("button", { name: "Add item to category 1" }));

    await waitFor(() => {
      expect(birdsBin.querySelectorAll('[data-node="categorise-item"][data-item-id]').length).toBe(
        2,
      );
    });

    const categorise = editor.getJSON().content?.[0] as JSONContent | undefined;
    const birds = categorise?.content?.[3]?.content?.[0]?.content?.[0];
    const items = childOfType(birds, "categorise_items_group")?.content;
    expect(items?.[1]).toMatchObject({
      type: "categorise_item",
      content: [{ type: "categorise_item_body", content: [{ type: "paragraph" }] }],
    });

    view.unmount();
    editor.destroy();
  });

  it("offers only other categories from a clearly named reassignment selector", async () => {
    const editor = makeEditor(true);
    editor.commands.setContent(categoriseDoc());
    const view = renderMovementEditor(editor);
    const user = userEvent.setup();

    const selector = await screen.findByRole("combobox", {
      name: "Move ‘Eagle’ to category. Current category: ‘Birds’",
    });
    expect(selector).toHaveTextContent("Birds");

    await user.click(selector);
    const destinations = await screen.findByRole("listbox", {
      name: "Move ‘Eagle’ to another category",
    });
    expect(within(destinations).getByRole("option", { name: "Fish" })).toBeInTheDocument();
    expect(within(destinations).queryByRole("option", { name: "Birds" })).toBeNull();

    await user.click(within(destinations).getByRole("option", { name: "Fish" }));
    await waitFor(() => {
      expect(
        screen.getByRole("combobox", {
          name: "Move ‘Eagle’ to category. Current category: ‘Fish’",
        }),
      ).toHaveTextContent("Fish");
    });

    view.unmount();
    editor.destroy();
  });

  it("keeps both required categories by disabling their delete controls", async () => {
    const doc = categoriseDoc() as JSONContent;
    const editor = makeEditor(true);
    editor.commands.setContent(doc);
    const view = renderMovementEditor(editor);

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Category ‘Birds’" })).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Delete category 1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete category 2" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add category" })).toBeInTheDocument();

    view.unmount();
    editor.destroy();
  });

  it("deletes bin-local authoring items without an unassign action", async () => {
    const fixture = createDisposableCategoriseEditor({
      type: "doc",
      content: [
        withEmptyCategoriseCategory(
          categoriseDocWithItemFeedback("salmon", "Salmon are fish."),
          "mammals",
          "Mammals",
        ).content?.[0] as JSONContent,
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep after categorise" }],
        },
      ],
    });
    const { editor } = fixture;
    const view = renderMovementEditor(editor);
    const user = userEvent.setup();

    const fishBin = () =>
      document.body.querySelector(
        '[data-node="categorise-bin"][data-bin-id="fish"]',
      ) as HTMLElement | null;

    expect(screen.queryByRole("button", { name: /remove item .* from category/i })).toBeNull();
    expect(
      await screen.findByRole("button", { name: "Delete item 1 from category 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Delete item 1 from category 2" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete category 2" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete item 1 from category 2" }));

    await waitFor(() => {
      expect(
        document.body.querySelector('[data-node="categorise-item"][data-item-id="salmon"]'),
      ).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Delete category 2" }));

    await waitFor(() => {
      expect(fishBin()).toBeNull();
      expect(screen.getByRole("button", { name: "Delete category 1" })).toBeDisabled();
    });

    const categorise = fixture.json().content?.[0] as JSONContent | undefined;
    const content = categorise?.content?.[3] as JSONContent | undefined;
    const bins = content?.content?.[0]?.content as JSONContent[] | undefined;

    expect(fixture.topLevelNodeTypes()).toEqual(["categorise", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after categorise");
    expect(bins?.map((bin) => bin.attrs?.["id"])).toEqual(["birds", "mammals"]);
    expect(
      childOfType(bins?.[0], "categorise_items_group")?.content?.map((item) => item.attrs?.["id"]),
    ).toEqual(["eagle"]);

    view.unmount();
    fixture.destroy();
  });

  it("deleting a category removes its contained items and feedback metadata", async () => {
    const fixture = createDisposableCategoriseEditor({
      type: "doc",
      content: [
        withEmptyCategoriseCategory(
          categoriseDocWithItemFeedback("salmon", "Salmon are fish."),
          "mammals",
          "Mammals",
        ).content?.[0] as JSONContent,
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep after category delete" }],
        },
      ],
    });

    const view = renderMovementEditor(fixture.editor);

    fireEvent.click(await screen.findByRole("button", { name: "Delete category 2" }));

    await waitFor(() => {
      expect(
        document.body.querySelector('[data-node="categorise-bin"][data-bin-id="fish"]'),
      ).toBeNull();
    });

    const categorise = fixture.json().content?.[0] as JSONContent | undefined;
    const content = categorise?.content?.[3] as JSONContent | undefined;
    const bins = content?.content?.[0]?.content as JSONContent[] | undefined;

    expect(fixture.topLevelNodeTypes()).toEqual(["categorise", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after category delete");
    expect(bins?.map((bin) => bin.attrs?.["id"])).toEqual(["birds", "mammals"]);
    expect(categorise?.attrs?.["assessment"]).toMatchObject({
      feedbackByItemId: { eagle: richFeedback("Eagles are birds.") },
    });
    const categoriseAssessment = categorise?.attrs?.["assessment"] as
      | { feedbackByItemId?: Record<string, unknown> }
      | undefined;
    expect(categoriseAssessment?.feedbackByItemId).not.toHaveProperty("salmon");

    view.unmount();
    fixture.destroy();
  });

  it("deleting an item removes its placement and feedback metadata", async () => {
    const fixture = createDisposableCategoriseEditor({
      type: "doc",
      content: [
        categoriseDocWithItemFeedback("salmon", "Salmon are fish.").content?.[0] as JSONContent,
        {
          type: "paragraph",
          content: [{ type: "text", text: "Keep after item delete" }],
        },
      ],
    });

    const view = renderMovementEditor(fixture.editor);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Delete item 1 from category 2" }));

    await waitFor(() => {
      expect(
        document.body.querySelector('[data-node="categorise-item"][data-item-id="salmon"]'),
      ).toBeNull();
    });

    const categorise = fixture.json().content?.[0] as JSONContent | undefined;
    const content = categorise?.content?.[3] as JSONContent | undefined;
    const bins = content?.content?.[0]?.content as JSONContent[] | undefined;

    expect(fixture.topLevelNodeTypes()).toEqual(["categorise", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after item delete");
    expect(bins?.map((bin) => bin.attrs?.["id"])).toEqual(["birds", "fish"]);
    expect(
      childOfType(bins?.[0], "categorise_items_group")?.content?.map((item) => item.attrs?.["id"]),
    ).toEqual(["eagle"]);
    expect(childOfType(bins?.[1], "categorise_items_group")?.content ?? []).toEqual([]);
    expect(categorise?.attrs?.["assessment"]).toMatchObject({
      feedbackByItemId: { eagle: richFeedback("Eagles are birds.") },
    });
    expect(
      (
        categorise?.attrs?.["assessment"] as
          | { feedbackByItemId?: Record<string, unknown> }
          | undefined
      )?.feedbackByItemId,
    ).not.toHaveProperty("salmon");

    view.unmount();
    fixture.destroy();
  });

  it("reassigns a complete item node and preserves keyed feedback in one undoable transaction", () => {
    const editor = makeEditor(true, true);
    editor.commands.setContent(categoriseDocWithItemFeedback("salmon", "Salmon are fish."));
    editor.view.dispatch(closeHistory(editor.state.tr));
    let salmonPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "categorise_item" && node.attrs["id"] === "salmon") salmonPos = pos;
    });
    let transactionCount = 0;
    editor.on("transaction", () => {
      transactionCount += 1;
    });

    expect(reassignCategoriseItem(editor, salmonPos, "birds")).toBe(true);
    expect(transactionCount).toBe(1);
    expect(projectCategoriseAssessment(editor.getJSON().content?.[0] as JSONContent)).toMatchObject(
      {
        correctPlacements: expect.arrayContaining([
          { itemId: "eagle", categoryId: "birds" },
          { itemId: "salmon", categoryId: "birds" },
        ]),
        feedbackByItemId: {
          salmon: richFeedback("Salmon are fish."),
        },
      },
    );

    expect(editor.commands.undo()).toBe(true);
    expect(projectCategoriseAssessment(editor.getJSON().content?.[0] as JSONContent)).toMatchObject(
      {
        correctPlacements: expect.arrayContaining([{ itemId: "salmon", categoryId: "fish" }]),
        feedbackByItemId: { salmon: richFeedback("Salmon are fish.") },
      },
    );
    expect(editor.commands.redo()).toBe(true);
    expect(projectCategoriseAssessment(editor.getJSON().content?.[0] as JSONContent)).toMatchObject(
      {
        correctPlacements: expect.arrayContaining([{ itemId: "salmon", categoryId: "birds" }]),
      },
    );
    editor.destroy();
  });

  it("enforces the two-category and one-item minimum in author commands", () => {
    const editor = makeEditor(true);
    editor.commands.setContent(categoriseDoc());
    let birdsPos = -1;
    let fishPos = -1;
    let eaglePos = -1;
    let salmonPos = -1;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "categorise_bin" && node.attrs["id"] === "birds") birdsPos = pos;
      if (node.type.name === "categorise_bin" && node.attrs["id"] === "fish") fishPos = pos;
      if (node.type.name === "categorise_item" && node.attrs["id"] === "eagle") eaglePos = pos;
      if (node.type.name === "categorise_item" && node.attrs["id"] === "salmon") salmonPos = pos;
    });

    expect(deleteCategoriseCategory(editor, birdsPos)).toBe(false);
    expect(deleteCategoriseCategory(editor, fishPos)).toBe(false);
    expect(deleteCategoriseItem(editor, salmonPos)).toBe(true);

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "categorise_item" && node.attrs["id"] === "eagle") eaglePos = pos;
    });
    expect(deleteCategoriseItem(editor, eaglePos)).toBe(false);
    editor.destroy();
  });

  it("round-trips a full composite tree across attrs and field nodes", () => {
    const editor = makeEditor();
    editor.commands.setContent(categoriseDoc());

    const json = editor.getJSON();
    const categorise = json.content?.[0] as JSONContent | undefined;
    expect(categorise?.attrs?.["quick"]).toBeUndefined();
    expect(categorise?.attrs).not.toHaveProperty("data");
    expect(categorise?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: false,
      legend: "Sort animals",
      points: 4,
      maxAttempts: 2,
    });
    expect(categorise?.attrs?.["assessment"]).toMatchObject({
      feedbackByItemId: { eagle: richFeedback("Eagles are birds.") },
    });
    expect(categorise?.content?.length).toBe(5);
    const children = categorise?.content as JSONContent[] | undefined;
    const content = children?.[3];
    expect(content?.type).toBe("categorise_content");
    expect(children?.[4]?.type).toBe("assessment_actions_group");
    const bins = content?.content?.[0]?.content as JSONContent[] | undefined;
    expect(bins?.map((bin) => bin.attrs?.["id"])).toEqual(["birds", "fish"]);
    const birdsTitle = childOfType(bins?.[0], "categorise_bin_title");
    const birdsItems = childOfType(bins?.[0], "categorise_items_group");
    expect(birdsTitle?.content?.[0]?.content?.[0]?.text).toBe("Birds");
    expect(birdsItems?.content?.[0]?.attrs?.["id"]).toBe("eagle");
    expect(birdsItems?.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("Eagle");
    expect(projectCategoriseAssessment(categorise!)).toMatchObject({
      correctPlacements: expect.arrayContaining([
        { itemId: "eagle", categoryId: "birds" },
        { itemId: "salmon", categoryId: "fish" },
      ]),
    });
    editor.destroy();
  });

  it("projects bin-owned items into the learner source list and derives placements", () => {
    const categorise = categoriseDoc().content?.[0] as JSONContent;
    const learner = projectCategoriseLearnerNode(categorise);
    const learnerContent = childOfType(learner, "categorise_content");
    const learnerBins = childOfType(learnerContent, "categorise_bins_group")?.content;
    const learnerItems = childOfType(learnerContent, "categorise_items_group")?.content;

    expect(learnerBins?.[0]?.content?.[0]?.type).toBe("paragraph");
    expect(learnerItems?.map((item) => item.attrs?.["id"])).toEqual(["salmon", "eagle"]);
    expect(projectCategoriseInteraction(categorise)).toMatchObject({
      categories: [
        { id: "birds", label: "Birds" },
        { id: "fish", label: "Fish" },
      ],
      items: [
        { id: "salmon", label: "Salmon" },
        { id: "eagle", label: "Eagle" },
      ],
    });
    expect(projectCategoriseInteraction(learner)).toMatchObject({
      categories: [
        { id: "birds", label: "Birds" },
        { id: "fish", label: "Fish" },
      ],
      items: [
        { id: "salmon", label: "Salmon" },
        { id: "eagle", label: "Eagle" },
      ],
    });
    expect(projectCategoriseAssessment(categorise)).toMatchObject({
      correctPlacements: expect.arrayContaining([
        { itemId: "eagle", categoryId: "birds" },
        { itemId: "salmon", categoryId: "fish" },
      ]),
    });
  });

  it("projects one stable shuffled source order independent of authored category nesting", () => {
    const first = categoriseDoc().content?.[0] as JSONContent;
    const second = structuredClone(first);
    const bins = childOfType(childOfType(second, "categorise_content"), "categorise_bins_group");
    const birds = bins?.content?.[0];
    const fish = bins?.content?.[1];
    const birdsItems = childOfType(birds, "categorise_items_group");
    const fishItems = childOfType(fish, "categorise_items_group");
    if (!birdsItems || !fishItems || !birdsItems.content?.[0] || !fishItems.content?.[0]) {
      throw new Error("Expected categorise projection fixture items");
    }
    const eagle = birdsItems.content[0];
    const salmon = fishItems.content[0];
    birdsItems.content = [salmon];
    fishItems.content = [eagle];

    const sourceIds = (node: JSONContent) =>
      childOfType(
        childOfType(projectCategoriseLearnerNode(node), "categorise_content"),
        "categorise_items_group",
      )?.content?.map((item) => item.attrs?.["id"]);

    expect(sourceIds(first)).toEqual(sourceIds(first));
    expect(sourceIds(second)).toEqual(sourceIds(first));
    expect(sourceIds(first)).not.toEqual(["eagle", "salmon"]);
    expect(projectCategoriseInteraction(first).items.map((item) => item.id)).toEqual(
      sourceIds(first),
    );
  });

  it("parses defaults when attrs are absent", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "categorise",
          content: [
            { type: "assessment_title", content: [{ type: "paragraph" }] },
            {
              type: "assessment_instructions",
              content: [{ type: "paragraph" }],
            },
            { type: "assessment_prompt", content: [{ type: "paragraph" }] },
            {
              type: "categorise_content",
              content: [
                {
                  type: "categorise_bins_group",
                  content: [
                    {
                      type: "categorise_bin",
                      attrs: { id: "birds" },
                      content: [
                        {
                          type: "categorise_bin_title",
                          content: fieldContent(),
                        },
                        {
                          type: "categorise_items_group",
                          content: [
                            {
                              type: "categorise_item",
                              attrs: { id: "eagle" },
                              content: [
                                {
                                  type: "categorise_item_body",
                                  content: fieldContent(),
                                },
                              ],
                            },
                          ],
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
    const categorise = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(categorise?.attrs?.["quick"]).toBeUndefined();
    expect(categorise?.attrs?.["settings"]).toMatchObject({
      feedbackMode: "on_submit",
      isGraded: true,
      showAnswer: true,
      points: 1,
      maxAttempts: null,
    });
    editor.destroy();
  });

  it("lets shared assessment children resolve their categorise ancestor", () => {
    const editor = makeEditor();
    editor.commands.setContent(categoriseDoc());

    let contentPos: number | undefined;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "categorise_content") contentPos = pos;
    });

    expect(findAncestorAssessmentBlockId(editor, contentPos, ["categorise"])).toBe("categorise-1");
    editor.destroy();
  });

  it("describes selected and placed categorise runtime state", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(learnerCategoriseDoc({ showAnswer: true }));
    const problemId = "artifact:artifact-1/block:categorise-1";
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

    fireEvent.click(screen.getByRole("button", { name: "Select ‘Salmon’, item 1 of 2" }));

    await waitFor(() => {
      expect(describedText('[data-item-id="salmon"]')).toBe("Selected item");
      expect(describedText('[data-bin-id="birds"]')).toBe("Ready to place selected item");
    });

    fireEvent.click(screen.getByRole("button", { name: "Place ‘Salmon’ in ‘Birds’" }));

    await waitFor(() => {
      expect(describedText('[data-bin-id="birds"]')).toBe("Contains 1 item");
      expect(describedText('[data-placed-item-id="salmon"]')).toBe("Placed item");
    });

    editor.destroy();
  });

  it("names the response, source handles, category groups, placement actions, and completeness", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(learnerCategoriseDoc());
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          { ...canonicalAssessmentResult, isCorrect: false, score: 0, items: {} },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    const responseGroup = await screen.findByRole("group", { name: "Sort animals" });
    expect(within(responseGroup).getByText("0 of 2 items placed")).toBeInTheDocument();
    expect(
      within(responseGroup).getByRole("group", { name: "Category ‘Birds’" }),
    ).toBeInTheDocument();
    const eagle = within(responseGroup).getByRole("button", {
      name: /Select ‘Eagle’, item \d of 2/,
    });
    const eagleCard = eagle.closest<HTMLElement>(".sc-course-categorise__source-item");
    expect(eagleCard).not.toBeNull();
    await userEvent.click(within(eagleCard!).getByText("Eagle"));
    expect(
      within(responseGroup).getByRole("button", {
        name: "Place ‘Eagle’ in ‘Birds’",
      }),
    ).toBeEmptyDOMElement();
    expect(within(responseGroup).getAllByText("Drop items here.")).toHaveLength(2);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(
        within(responseGroup).queryByRole("button", {
          name: "Place ‘Eagle’ in ‘Birds’",
        }),
      ).toBeNull();
      expect(within(responseGroup).getAllByText("Drop items here.")).toHaveLength(2);
      expect(eagle).toHaveFocus();
    });

    await userEvent.click(within(eagleCard!).getByText("Eagle"));
    const place = within(responseGroup).getByRole("button", {
      name: "Place ‘Eagle’ in ‘Birds’",
    });
    expect(place).toBeEmptyDOMElement();
    await userEvent.click(place);

    await waitFor(() => {
      expect(within(responseGroup).getByText("1 of 2 items placed")).toBeInTheDocument();
      expect(
        within(responseGroup).getByRole("group", { name: "Placed ‘Eagle’ in ‘Birds’" }),
      ).toBeInTheDocument();
      expect(
        within(responseGroup).getByRole("button", { name: /Select ‘Salmon’, item \d of 2/ }),
      ).toHaveFocus();
    });

    const returnEagle = within(responseGroup).getByRole("button", {
      name: "Return ‘Eagle’ to unplaced items",
    });
    await userEvent.click(returnEagle);
    await waitFor(() => {
      expect(within(responseGroup).getByRole("button", { name: /Select ‘Eagle’/ })).toHaveFocus();
    });
    editor.destroy();
  });

  it("checks an immediate Categorise mapping once per newly completed placement set", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(
      learnerCategoriseDoc({ feedbackMode: "immediate", maxAttempts: null }),
    );
    const check = vi.fn(async (args) =>
      assessmentProblemOutcome(
        {
          ...canonicalAssessmentResult,
          isCorrect: false,
          score: 0.5,
          items: {
            eagle: { correct: true, expected: "birds", given: "birds" },
            salmon: { correct: false, expected: "fish", given: "birds" },
          },
        },
        {
          response: args.response,
          submitted: false,
          checkResult: {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0.5,
            items: {
              eagle: { correct: true, expected: "birds", given: "birds" },
              salmon: { correct: false, expected: "fish", given: "birds" },
            },
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
    const group = await screen.findByRole("group", { name: "Sort animals" });
    await userEvent.click(within(group).getByRole("button", { name: /Select ‘Eagle’/ }));
    await userEvent.click(within(group).getByRole("button", { name: "Place ‘Eagle’ in ‘Birds’" }));
    expect(check).not.toHaveBeenCalled();

    await userEvent.click(within(group).getByRole("button", { name: /Select ‘Salmon’/ }));
    await userEvent.click(within(group).getByRole("button", { name: "Place ‘Salmon’ in ‘Birds’" }));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(1));

    await userEvent.click(
      within(group).getByRole("button", { name: "Return ‘Salmon’ to unplaced items" }),
    );
    await userEvent.click(within(group).getByRole("button", { name: /Select ‘Salmon’/ }));
    await userEvent.click(within(group).getByRole("button", { name: "Place ‘Salmon’ in ‘Fish’" }));
    await waitFor(() => expect(check).toHaveBeenCalledTimes(2));
    editor.destroy();
  });

  it("canonicalizes an unlocked hydrated mapping without grading or consuming an attempt", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(learnerCategoriseDoc());
    const problemId = "artifact:artifact-1/block:categorise-1";
    const check = vi.fn();
    const submit = vi.fn(async (args: AssessmentSubmitRequest) =>
      assessmentProblemOutcome(
        { ...canonicalAssessmentResult, isCorrect: false, score: 0, items: {} },
        { response: args.response },
      ),
    );
    const assessmentPort: AssessmentPort = { type: "runtime", check, submit };

    renderRuntimeEditor(editor, assessmentPort, {
      snapshotVersion: 2,
      artifactId: "artifact-1",
      problems: {
        "categorise-1": {
          response: {
            kind: "classify",
            placements: [
              { itemId: "deleted-item", categoryId: "birds" },
              { itemId: "salmon", categoryId: "deleted-category" },
              { itemId: "eagle", categoryId: "birds" },
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
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
      expect(assessmentStore?.getState().durable.problems[problemId]).toMatchObject({
        response: {
          kind: "classify",
          placements: [{ itemId: "eagle", categoryId: "birds" }],
        },
        attemptNumber: 0,
        submitted: false,
      });
      expect(screen.getByRole("button", { name: /Select ‘Salmon’/ })).toBeInTheDocument();
    });
    expect(check).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("describes submitted categorise placement correctness", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(learnerCategoriseDoc({ showAnswer: true }));
    const problemId = "artifact:artifact-1/block:categorise-1";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              salmon: { correct: false, expected: "fish", given: "birds" },
              eagle: { correct: true, expected: "birds", given: "birds" },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "classify",
          correctPlacements: [
            { itemId: "salmon", categoryId: "fish" },
            { itemId: "eagle", categoryId: "birds" },
          ],
          feedbackByItemId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "placements", {
      salmon: "birds",
      eagle: "birds",
    });

    await waitFor(() => {
      expect(describedText('[data-placed-item-id="salmon"]')).toBe("Placed item");
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(describedText('[data-placed-item-id="salmon"]')).toBe(
        "Placed item. Submitted placement, incorrect",
      );
    });

    editor.destroy();
  });

  it("describes revealed categorise correct placement from the port payload", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(learnerCategoriseDoc({ showAnswer: true }));
    const problemId = "artifact:artifact-1/block:categorise-1";
    const submit = vi.fn(async (args: AssessmentSubmitRequest) =>
      assessmentProblemOutcome(
        {
          ...canonicalAssessmentResult,
          isCorrect: false,
          score: 0,
          items: {
            salmon: { correct: false, expected: "birds", given: "fish" },
            eagle: { correct: false, expected: "fish", given: "birds" },
          },
        },
        { response: args.response },
      ),
    );
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit,
      revealAnswer: async () => ({
        answerKey: {
          kind: "classify",
          correctPlacements: [
            { itemId: "salmon", categoryId: "birds" },
            { itemId: "eagle", categoryId: "fish" },
          ],
          feedbackByItemId: {
            salmon: richFeedback("Port feedback"),
          },
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "placements", {
      salmon: "fish",
      eagle: "birds",
    });

    await waitFor(() => {
      expect(describedText('[data-placed-item-id="salmon"]')).toBe("Placed item");
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
      expect(describedText('[data-placed-item-id="salmon"]')).toContain(
        "Submitted placement, incorrect",
      );
      expect(screen.getByRole("button", { name: "Show correct answer" })).toBeInTheDocument();
    });
    const durableResponseBeforeReveal = localAssessmentResponse(assessmentStore, problemId);
    fireEvent.click(screen.getByRole("button", { name: "Show correct answer" }));

    await waitFor(() => {
      expect(document.body.querySelector('[data-bin-id="birds"]')?.textContent).toContain("Salmon");
      expect(describedText('[data-placed-item-id="salmon"]')).toBe(
        "Placed item. Revealed correct placement. Feedback available",
      );
      expect(localAssessmentResponse(assessmentStore, problemId)).toEqual(
        durableResponseBeforeReveal,
      );
    });

    editor.destroy();
  });

  it("reveals placements from port payload instead of authored correctBinId attrs", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(learnerCategoriseDoc({ showAnswer: true }));
    const problemId = "artifact:artifact-1/block:categorise-1";
    const assessmentPort: AssessmentPort = {
      type: "runtime",
      submit: async (args) =>
        assessmentProblemOutcome(
          {
            ...canonicalAssessmentResult,
            isCorrect: false,
            score: 0,
            items: {
              salmon: { correct: false, expected: "birds", given: "fish" },
              eagle: { correct: false, expected: "fish", given: "birds" },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "classify",
          correctPlacements: [
            { itemId: "salmon", categoryId: "birds" },
            { itemId: "eagle", categoryId: "fish" },
          ],
          feedbackByItemId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "placements", {
      salmon: "fish",
      eagle: "birds",
    });

    await waitFor(() => {
      expect((screen.getByText("Submit") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(describedText('[data-placed-item-id="salmon"]')).toContain(
        "Submitted placement, incorrect",
      );
      expect(screen.getByRole("button", { name: "Show correct answer" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Show correct answer" }));

    await waitFor(() => {
      const birds = document.body.querySelector('[data-bin-id="birds"]');
      const fish = document.body.querySelector('[data-bin-id="fish"]');

      expect(birds?.textContent).toContain("Salmon");
      expect(fish?.textContent).not.toContain("Salmon");
    });

    editor.destroy();
  });
});

describe("categorise runtime mapping", () => {
  it("reconciles only still-current item and category memberships", () => {
    expect(
      reconcileCategorisePlacements(
        {
          eagle: "birds",
          salmon: "deleted-category",
          deleted: "birds",
        },
        ["salmon", "eagle", "new-item"],
        ["birds", "fish"],
      ),
    ).toEqual({ eagle: "birds" });

    expect(() => reconcileCategorisePlacements({}, ["eagle", "eagle"], ["birds"])).toThrow(
      "Projected Categorise item ids must be nonblank and unique",
    );
    expect(() => reconcileCategorisePlacements({}, ["eagle"], ["birds", " "])).toThrow(
      "Projected Categorise category ids must be nonblank and unique",
    );
  });

  it("prefers a complete authorized reveal and otherwise reconstructs an exact result mapping", () => {
    const reveal = {
      placements: { eagle: "birds", salmon: "fish" },
      feedbackByItemId: { eagle: richFeedback("Eagles are birds.") },
    };
    expect(
      resolveAuthorizedCategoriseReveal({
        answerKeyVisible: true,
        categoryIds: ["birds", "fish"],
        itemIds: ["salmon", "eagle"],
        reveal,
        resultItems: {
          eagle: { expected: "fish" },
          salmon: { expected: "birds" },
        },
      }),
    ).toEqual(reveal);

    expect(
      resolveAuthorizedCategoriseReveal({
        answerKeyVisible: true,
        categoryIds: ["birds", "fish"],
        itemIds: ["salmon", "eagle"],
        reveal: { placements: { eagle: "birds" }, feedbackByItemId: {} },
        resultItems: {
          eagle: { expected: "birds" },
          salmon: { expected: "fish" },
        },
      }),
    ).toEqual({
      placements: { salmon: "fish", eagle: "birds" },
      feedbackByItemId: {},
    });
  });

  it("does not reconstruct placements without authorization or a complete valid expected map", () => {
    const resultItems = {
      eagle: { expected: "birds" },
      salmon: { expected: "unknown" },
    };
    expect(
      resolveAuthorizedCategoriseReveal({
        answerKeyVisible: false,
        categoryIds: ["birds", "fish"],
        itemIds: ["eagle", "salmon"],
        reveal: null,
        resultItems,
      }),
    ).toBeNull();
    expect(
      resolveAuthorizedCategoriseReveal({
        answerKeyVisible: true,
        categoryIds: ["birds", "fish"],
        itemIds: ["eagle", "salmon"],
        reveal: null,
        resultItems,
      }),
    ).toBeNull();
  });

  it("derives public item names with a positional fallback only for empty content", () => {
    expect(categoriseItemPublicLabel("  Eagle\n ", 2)).toBe("Eagle");
    expect(categoriseItemPublicLabel("  ", 2)).toBe("item 2");
  });
});
