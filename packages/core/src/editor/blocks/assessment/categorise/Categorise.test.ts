// @vitest-environment happy-dom

import { Editor, Node as TiptapNode, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { EditorMovementLayer } from "@/editor/movement/view/EditorMovementLayer";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { createViewportCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { InteractionDragEnvironmentProvider } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { AuthoringOverlayBoundary } from "@/editor/interactions/floating/AuthoringOverlayBoundary";
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
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

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
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
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
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
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

function renderMovementEditor(editor: Editor) {
  const coordinateRoot = document.body;
  const coordinateSpace = createViewportCoordinateSpace({
    getRoot: () => coordinateRoot,
    ownerDocument: coordinateRoot.ownerDocument,
  });
  const movementLayer = createElement(
    EditorMovementLayer,
    {
      blockDefinitions: builtInBlockRegistry,
      editor,
      surfaceVariants: builtInSurfaceVariantRegistry,
    },
    createElement(EditorContent, { editor }),
  );
  const dragEnvironment = createElement(InteractionDragEnvironmentProvider, {
    children: movementLayer,
    coordinateRoot,
    coordinateSpace,
  });
  const overlayBoundary = createElement(AuthoringOverlayBoundary, {
    children: dragEnvironment,
    ownerRoot: coordinateRoot,
  });
  return render(
    createAssessmentRuntimeTestRoot({
      children: createElement(
        InteractionProvider,
        { store: getInteractionFacadeStoreForEditor(editor) },
        overlayBoundary,
      ),
      onStore: captureAssessmentStore,
    }),
  );
}

let assessmentStore: AssessmentStoreApi | null = null;
function captureAssessmentStore(store: AssessmentStoreApi | null) {
  assessmentStore = store;
}

function renderAssessmentEditor(editor: Editor) {
  if (editor.isEditable) return renderMovementEditor(editor);
  return render(
    createAssessmentRuntimeTestRoot({
      children: createElement(EditorContent, { editor }),
      onStore: captureAssessmentStore,
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
            feedbackByItemId: { eagle_000001: richFeedback("Eagles are birds.") },
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
                    attrs: { id: "birds_000001" },
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
                            attrs: { id: "eagle_000001" },
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
                    attrs: { id: "fish__000001" },
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
                            attrs: { id: "salmon_00001" },
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
        '[data-node="categorise-item"][data-id="salmon_00001"]',
      );
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element).not.toHaveAttribute("data-item-id");
      return element as HTMLElement;
    });
    await user.click(within(item).getByRole("button", { name: "Add feedback" }));
    const feedbackEditor = await screen.findByLabelText("Feedback editor");
    expect(feedbackEditor.getAttribute("data-attr-rich-text-field")).toBe(
      "categorise:salmon_00001:feedback",
    );

    fireEvent.paste(feedbackEditor, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? "Salmon belong with fish." : ""),
      },
    });

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.attrs?.["assessment"]).toMatchObject({
        feedbackByItemId: { salmon_00001: richFeedback("Salmon belong with fish.") },
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
            score: { scaled: 0 },
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
    const source = scrollLane?.querySelector<HTMLElement>(".sc-categorise-runtime-source");
    const bins = scrollLane?.querySelector<HTMLElement>(".sc-categorise-runtime-bin-grid");

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
    expect(source?.querySelectorAll("button[data-id]")).toHaveLength(2);
    expect(source?.querySelector("[data-item-id]")).toBeNull();
    expect(source?.querySelectorAll("[data-interaction-drag-activation-area]")).toHaveLength(2);
    expect(bins?.querySelectorAll('[role="button"][data-id]')).toHaveLength(2);
    expect(bins?.querySelector("[data-bin-id]")).toBeNull();
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
      if (node.type.name === "categorise_bin" && node.attrs["id"] === "fish__000001") {
        fishBinPos = pos;
      }
    });

    expect(moveSiblingNode(editor, fishBinPos!, "up")).toBe(true);

    const blockJson = editor.getJSON().content?.[0] as JSONContent | undefined;
    const content = blockJson?.content?.[3] as JSONContent | undefined;
    const bins = (content?.content?.[0] as JSONContent | undefined)?.content ?? [];
    expect(bins.map((bin) => bin.attrs?.["id"])).toEqual(["fish__000001", "birds_000001"]);
    expect(projectCategoriseAssessment(blockJson!)).toMatchObject({
      correctPlacements: [
        { itemId: "salmon_00001", categoryId: "fish__000001" },
        { itemId: "eagle_000001", categoryId: "birds_000001" },
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
      expect(
        screen.getByRole("button", { name: "Move category 1 within its group" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Move category 2 within its group" }),
      ).toBeInTheDocument();
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
        document.body.querySelector('[data-node="categorise-bin"][data-id="birds_000001"]'),
      ).not.toBeNull();
    });

    expect(screen.getByRole("group", { name: "Category 1" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Category 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item to category 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item to category 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Drag item to category" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move category up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move categorise item up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Move categorise item" })).toBeNull();

    const binsGroup = document.body.querySelector('[data-slot="categorise-bins-group"]');
    expect(binsGroup?.className).toContain("sc-categorise-bins-group");

    const birdsBin = document.body.querySelector(
      '[data-node="categorise-bin"][data-id="birds_000001"]',
    ) as HTMLElement;
    const fishBin = document.body.querySelector(
      '[data-node="categorise-bin"][data-id="fish__000001"]',
    ) as HTMLElement;
    expect(birdsBin.textContent).toContain("Eagle");
    expect(fishBin.textContent).toContain("Salmon");

    await user.click(within(birdsBin).getByRole("button", { name: "Add item to category 1" }));

    await waitFor(() => {
      expect(birdsBin.querySelectorAll('[data-node="categorise-item"][data-id]').length).toBe(2);
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

  it("keeps the required final category by hiding its delete control", async () => {
    const doc = categoriseDoc() as JSONContent;
    const categorise = doc.content?.[0];
    const binsGroup = categorise?.content?.[3]?.content?.[0];
    if (!binsGroup?.content?.[0]) throw new Error("Expected categorise fixture bins");
    binsGroup.content = [binsGroup.content[0]];

    const editor = makeEditor(true);
    editor.commands.setContent(doc);
    const view = renderMovementEditor(editor);

    await waitFor(() => {
      expect(screen.getByRole("group", { name: "Category 1" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "Delete category 1" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add category" })).toBeInTheDocument();

    view.unmount();
    editor.destroy();
  });

  it("deletes bin-local authoring items without an unassign action", async () => {
    const fixture = createDisposableCategoriseEditor({
      type: "doc",
      content: [
        categoriseDocWithItemFeedback("salmon_00001", "Salmon are fish.")
          .content?.[0] as JSONContent,
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
        '[data-node="categorise-bin"][data-id="fish__000001"]',
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
        document.body.querySelector('[data-node="categorise-item"][data-id="salmon_00001"]'),
      ).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Delete category 2" }));

    await waitFor(() => {
      expect(fishBin()).toBeNull();
      expect(screen.queryByRole("button", { name: "Delete category 1" })).toBeNull();
    });

    const categorise = fixture.json().content?.[0] as JSONContent | undefined;
    const content = categorise?.content?.[3] as JSONContent | undefined;
    const bins = content?.content?.[0]?.content as JSONContent[] | undefined;

    expect(fixture.topLevelNodeTypes()).toEqual(["categorise", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after categorise");
    expect(bins?.map((bin) => bin.attrs?.["id"])).toEqual(["birds_000001"]);
    expect(
      childOfType(bins?.[0], "categorise_items_group")?.content?.map((item) => item.attrs?.["id"]),
    ).toEqual(["eagle_000001"]);

    view.unmount();
    fixture.destroy();
  });

  it("deleting a category removes its contained items and feedback metadata", async () => {
    const fixture = createDisposableCategoriseEditor({
      type: "doc",
      content: [
        categoriseDocWithItemFeedback("salmon_00001", "Salmon are fish.")
          .content?.[0] as JSONContent,
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
        document.body.querySelector('[data-node="categorise-bin"][data-id="fish__000001"]'),
      ).toBeNull();
    });

    const categorise = fixture.json().content?.[0] as JSONContent | undefined;
    const content = categorise?.content?.[3] as JSONContent | undefined;
    const bins = content?.content?.[0]?.content as JSONContent[] | undefined;

    expect(fixture.topLevelNodeTypes()).toEqual(["categorise", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after category delete");
    expect(bins?.map((bin) => bin.attrs?.["id"])).toEqual(["birds_000001"]);
    expect(categorise?.attrs?.["assessment"]).toMatchObject({
      feedbackByItemId: { eagle_000001: richFeedback("Eagles are birds.") },
    });
    const categoriseAssessment = categorise?.attrs?.["assessment"] as
      | { feedbackByItemId?: Record<string, unknown> }
      | undefined;
    expect(categoriseAssessment?.feedbackByItemId).not.toHaveProperty("salmon_00001");

    view.unmount();
    fixture.destroy();
  });

  it("deleting an item removes its placement and feedback metadata", async () => {
    const fixture = createDisposableCategoriseEditor({
      type: "doc",
      content: [
        categoriseDocWithItemFeedback("salmon_00001", "Salmon are fish.")
          .content?.[0] as JSONContent,
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
        document.body.querySelector('[data-node="categorise-item"][data-id="salmon_00001"]'),
      ).toBeNull();
    });

    const categorise = fixture.json().content?.[0] as JSONContent | undefined;
    const content = categorise?.content?.[3] as JSONContent | undefined;
    const bins = content?.content?.[0]?.content as JSONContent[] | undefined;

    expect(fixture.topLevelNodeTypes()).toEqual(["categorise", "paragraph"]);
    expect(fixture.editor.state.doc.textContent).toContain("Keep after item delete");
    expect(bins?.map((bin) => bin.attrs?.["id"])).toEqual(["birds_000001", "fish__000001"]);
    expect(
      childOfType(bins?.[0], "categorise_items_group")?.content?.map((item) => item.attrs?.["id"]),
    ).toEqual(["eagle_000001"]);
    expect(childOfType(bins?.[1], "categorise_items_group")?.content ?? []).toEqual([]);
    expect(categorise?.attrs?.["assessment"]).toMatchObject({
      feedbackByItemId: { eagle_000001: richFeedback("Eagles are birds.") },
    });
    expect(
      (
        categorise?.attrs?.["assessment"] as
          | { feedbackByItemId?: Record<string, unknown> }
          | undefined
      )?.feedbackByItemId,
    ).not.toHaveProperty("salmon_00001");

    view.unmount();
    fixture.destroy();
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
      feedbackByItemId: { eagle_000001: richFeedback("Eagles are birds.") },
    });
    expect(categorise?.content?.length).toBe(5);
    const children = categorise?.content as JSONContent[] | undefined;
    const content = children?.[3];
    expect(content?.type).toBe("categorise_content");
    expect(children?.[4]?.type).toBe("assessment_actions_group");
    const bins = content?.content?.[0]?.content as JSONContent[] | undefined;
    expect(bins?.map((bin) => bin.attrs?.["id"])).toEqual(["birds_000001", "fish__000001"]);
    const birdsTitle = childOfType(bins?.[0], "categorise_bin_title");
    const birdsItems = childOfType(bins?.[0], "categorise_items_group");
    expect(birdsTitle?.content?.[0]?.content?.[0]?.text).toBe("Birds");
    expect(birdsItems?.content?.[0]?.attrs?.["id"]).toBe("eagle_000001");
    expect(birdsItems?.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe("Eagle");
    expect(projectCategoriseAssessment(categorise!)).toMatchObject({
      correctPlacements: [
        { itemId: "eagle_000001", categoryId: "birds_000001" },
        { itemId: "salmon_00001", categoryId: "fish__000001" },
      ],
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
    expect(learnerItems?.map((item) => item.attrs?.["id"])).toEqual([
      "eagle_000001",
      "salmon_00001",
    ]);
    expect(projectCategoriseInteraction(categorise)).toMatchObject({
      categories: [
        { id: "birds_000001", label: "Birds" },
        { id: "fish__000001", label: "Fish" },
      ],
      items: [
        { id: "eagle_000001", label: "Eagle" },
        { id: "salmon_00001", label: "Salmon" },
      ],
    });
    expect(projectCategoriseInteraction(learner)).toMatchObject({
      categories: [
        { id: "birds_000001", label: "Birds" },
        { id: "fish__000001", label: "Fish" },
      ],
      items: [
        { id: "eagle_000001", label: "Eagle" },
        { id: "salmon_00001", label: "Salmon" },
      ],
    });
    expect(projectCategoriseAssessment(categorise)).toMatchObject({
      correctPlacements: [
        { itemId: "eagle_000001", categoryId: "birds_000001" },
        { itemId: "salmon_00001", categoryId: "fish__000001" },
      ],
    });
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
                      attrs: { id: "birds_000001" },
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
                              attrs: { id: "eagle_000001" },
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
            score: { scaled: 0 },
            items: {},
          },
          { response: args.response },
        ),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    fireEvent.click(screen.getByRole("button", { name: "Select item 1" }));

    await waitFor(() => {
      expect(describedText('[data-id="salmon_00001"]')).toBe("Selected item");
      expect(describedText('[data-id="birds_000001"]')).toBe("Ready to place selected item");
    });

    fireEvent.click(document.body.querySelector('[data-id="birds_000001"]')!);

    await waitFor(() => {
      expect(describedText('[data-id="birds_000001"]')).toBe("Contains 1 item");
      expect(describedText('[data-placed-item-id="salmon_00001"]')).toBe("Placed item");
    });

    editor.destroy();
  });

  it("places once through the Enter then Space selection contract", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(learnerCategoriseDoc({ showAnswer: true }));
    const problemId = "artifact:artifact-1/block:categorise-1";
    renderAssessmentEditor(editor);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });
    const source = screen.getByRole("button", { name: "Select item 1" });
    expect(source).toBeInstanceOf(HTMLButtonElement);
    expect(source).not.toHaveAttribute("role");
    expect(source).not.toHaveAttribute("aria-roledescription");
    expect(source).not.toHaveAttribute("aria-description");
    expect(source).toHaveAttribute("data-interaction-drag-activation-area", "");
    const selectedItemId = source.getAttribute("data-id");
    expect(selectedItemId).not.toBeNull();
    const category = document.body.querySelector<HTMLElement>('[data-id="birds_000001"]');
    expect(category).toBeInstanceOf(HTMLElement);

    fireEvent.keyDown(source, { key: "Enter" });
    fireEvent.keyDown(category!, { key: " " });

    await waitFor(() => {
      expect(localAssessmentResponse(assessmentStore, problemId)).toMatchObject({
        placements: { [selectedItemId!]: "birds_000001" },
      });
    });
    fireEvent.keyDown(category!, { key: " " });
    expect(localAssessmentResponse(assessmentStore, problemId)).toMatchObject({
      placements: { [selectedItemId!]: "birds_000001" },
    });

    editor.destroy();
  });

  it("does not commit a stale selection after the item is placed externally", async () => {
    const editor = makeEditor(false);
    editor.commands.setContent(learnerCategoriseDoc({ showAnswer: true }));
    const problemId = "artifact:artifact-1/block:categorise-1";
    renderAssessmentEditor(editor);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });
    const source = screen.getByRole("button", { name: "Select item 1" });
    const selectedItemId = source.getAttribute("data-id");
    expect(selectedItemId).not.toBeNull();
    fireEvent.click(source);

    setAssessmentResponseField(assessmentStore, problemId, "placements", {
      [selectedItemId!]: "fish__000001",
    });
    await waitFor(() => {
      expect(document.body.querySelector(`[data-id="${selectedItemId}"]`)).toBeNull();
    });

    fireEvent.click(document.body.querySelector('[data-id="birds_000001"]')!);
    expect(localAssessmentResponse(assessmentStore, problemId)).toMatchObject({
      placements: { [selectedItemId!]: "fish__000001" },
    });

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
            score: { scaled: 0 },
            items: {
              salmon_00001: { correct: false, expected: "fish__000001", given: "birds_000001" },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "classify",
          correctPlacements: [{ itemId: "salmon_00001", categoryId: "fish__000001" }],
          feedbackByItemId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "placements", {
      salmon_00001: "birds_000001",
    });

    await waitFor(() => {
      expect(describedText('[data-placed-item-id="salmon_00001"]')).toBe("Placed item");
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(describedText('[data-placed-item-id="salmon_00001"]')).toBe(
        "Placed item. Submitted placement, incorrect",
      );
      for (const category of document.body.querySelectorAll(
        ".sc-categorise-runtime-category[data-id]",
      )) {
        expect(category).toHaveAttribute("aria-disabled", "true");
        expect(category).toHaveAttribute("tabindex", "-1");
      }
    });

    editor.destroy();
  });

  it("describes revealed categorise correct placement from the port payload", async () => {
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
            score: { scaled: 0 },
            items: {
              salmon_00001: { correct: false, expected: "birds_000001", given: "fish__000001" },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "classify",
          correctPlacements: [{ itemId: "salmon_00001", categoryId: "birds_000001" }],
          feedbackByItemId: {
            salmon_00001: richFeedback("Port feedback"),
          },
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "placements", {
      salmon_00001: "fish__000001",
    });

    await waitFor(() => {
      expect(describedText('[data-placed-item-id="salmon_00001"]')).toBe("Placed item");
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Show answer")).toBeInstanceOf(HTMLButtonElement);
    });
    fireEvent.click(screen.getByText("Show answer"));

    await waitFor(() => {
      expect(document.body.querySelector('[data-id="birds_000001"]')?.textContent).toContain(
        "Salmon",
      );
      expect(describedText('[data-placed-item-id="salmon_00001"]')).toBe(
        "Placed item. Revealed correct placement. Feedback available",
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
            score: { scaled: 0 },
            items: {
              salmon_00001: { correct: false, expected: "birds_000001", given: "fish__000001" },
            },
          },
          { response: args.response },
        ),
      revealAnswer: async () => ({
        answerKey: {
          kind: "classify",
          correctPlacements: [{ itemId: "salmon_00001", categoryId: "birds_000001" }],
          feedbackByItemId: {},
        },
      }),
    };

    renderRuntimeEditor(editor, assessmentPort);

    await waitFor(() => {
      expect(hasAssessmentRegistration(assessmentStore, problemId)).toBe(true);
    });

    setAssessmentResponseField(assessmentStore, problemId, "placements", {
      salmon_00001: "fish__000001",
    });

    await waitFor(() => {
      expect((screen.getByText("Submit") as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(screen.getByText("Submit"));

    await waitFor(() => {
      expect(screen.getByText("Show answer")).toBeInstanceOf(HTMLButtonElement);
    });
    fireEvent.click(screen.getByText("Show answer"));

    await waitFor(() => {
      const birds = document.body.querySelector('[data-id="birds_000001"]');
      const fish = document.body.querySelector('[data-id="fish__000001"]');

      expect(birds?.textContent).toContain("Salmon");
      expect(fish?.textContent).not.toContain("Salmon");
    });

    editor.destroy();
  });
});
