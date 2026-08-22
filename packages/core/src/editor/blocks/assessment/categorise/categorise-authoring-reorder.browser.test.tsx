import { Editor, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { resolveScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";
import { AssessmentActionsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-actions-group";
import { AssessmentHintNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hint";
import { AssessmentHintsGroupNode } from "@/editor/blocks/assessment/shared/nodes/assessment-hints-group";
import { AssessmentInstructionsNode } from "@/editor/blocks/assessment/shared/nodes/assessment-instructions";
import { AssessmentPromptNode } from "@/editor/blocks/assessment/shared/nodes/assessment-prompt";
import { AssessmentSummaryFeedbackNode } from "@/editor/blocks/assessment/shared/nodes/assessment-summary-feedback";
import { AssessmentTitleNode } from "@/editor/blocks/assessment/shared/nodes/assessment-title";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import "@/styles/globals.css";

import { CategoriseAuthoringExtension } from "./categorise-authoring-extension";
import { categoriseBlockDefinition } from "./categorise-definition";

interface CategoriseAuthoringHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly rendered: RenderResult;
  category(categoryId: string): HTMLElement;
  categoryHandle(categoryId: string): HTMLButtonElement;
  categoryIdsInDocument(): string[];
  item(itemId: string): HTMLElement;
  itemAddAction(categoryId: string): HTMLButtonElement;
  itemHandle(itemId: string): HTMLButtonElement;
  itemIdsInCategory(categoryId: string): string[];
}

const mounted: CategoriseAuthoringHarness[] = [];
const categoriseTestCapabilities = resolveScaffoldCapabilities({
  blockCapabilities: [{ definition: categoriseBlockDefinition }],
  layoutDefinitions: [],
  surfaceDefinitions: [],
});

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("Categorise authoring reorder", () => {
  it("projects categories locally and commits the document once after a pointer drop", async () => {
    await page.viewport(1100, 900);
    const harness = await mountCategoriseAuthoringHarness();
    mounted.push(harness);
    const birds = harness.category("categorise-bin-birds");
    const fish = harness.category("categorise-bin-fish");
    const birdsRect = birds.getBoundingClientRect();
    const fishRect = fish.getBoundingClientRect();
    const destination = {
      x: fishRect.left + fishRect.width / 2,
      y: fishRect.top + fishRect.height * 0.75,
    };
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    await startPointerDrag(harness.categoryHandle("categorise-bin-birds"), destination);
    await waitFor(() => fish.getBoundingClientRect().left < fishRect.left - 8);

    expect(birds).toHaveAttribute("data-authoring-contained-reorder-projection");
    expect(fish).toHaveAttribute("data-authoring-contained-reorder-projection");
    expect(birds.getBoundingClientRect().left).toBeGreaterThan(birdsRect.left + 8);
    expect(harness.categoryIdsInDocument()).toEqual([
      "categorise-bin-birds",
      "categorise-bin-fish",
      "categorise-bin-reptiles",
    ]);
    expect(documentWrites).toBe(0);
    expectCategorySilhouette(birds, birdsRect, harness);

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.categoryIdsInDocument()).toEqual([
      "categorise-bin-fish",
      "categorise-bin-birds",
      "categorise-bin-reptiles",
    ]);
    expect(documentWrites).toBe(1);
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("projects items within their category and commits through keyboard drag", async () => {
    await page.viewport(1100, 900);
    const harness = await mountCategoriseAuthoringHarness();
    mounted.push(harness);
    const eagle = harness.item("categorise-item-eagle");
    const sparrow = harness.item("categorise-item-sparrow");
    const eagleRect = eagle.getBoundingClientRect();
    const sparrowRect = sparrow.getBoundingClientRect();
    const handle = harness.itemHandle("categorise-item-eagle");
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    handle.focus({ preventScroll: true });
    await userEvent.keyboard("{Space}");
    await waitFor(() => harness.host.querySelector("[data-interaction-drag-overlay]"));
    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => sparrow.getBoundingClientRect().top < sparrowRect.top - 8);

    expect(eagle.getBoundingClientRect().top).toBeGreaterThan(eagleRect.top + 8);
    expect(harness.itemIdsInCategory("categorise-bin-birds")).toEqual([
      "categorise-item-eagle",
      "categorise-item-sparrow",
      "categorise-item-robin",
    ]);
    expect(harness.itemIdsInCategory("categorise-bin-fish")).toEqual(["categorise-item-salmon"]);
    expect(documentWrites).toBe(0);
    expectItemSilhouette(eagle, eagleRect, harness);

    await userEvent.keyboard("{Space}");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.itemIdsInCategory("categorise-bin-birds")).toEqual([
      "categorise-item-sparrow",
      "categorise-item-eagle",
      "categorise-item-robin",
    ]);
    expect(harness.itemIdsInCategory("categorise-bin-fish")).toEqual(["categorise-item-salmon"]);
    expect(documentWrites).toBe(1);
    await waitFor(() => document.activeElement === harness.itemHandle("categorise-item-eagle"));
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("moves an item between categories with one document write after pointer drop", async () => {
    await page.viewport(1100, 900);
    const harness = await mountCategoriseAuthoringHarness();
    mounted.push(harness);
    const eagle = harness.item("categorise-item-eagle");
    const eagleRect = eagle.getBoundingClientRect();
    const salmon = harness.item("categorise-item-salmon");
    const salmonRect = salmon.getBoundingClientRect();
    const fishAddAction = harness.itemAddAction("categorise-bin-fish");
    const destination = {
      x: salmonRect.left + salmonRect.width / 2,
      y: salmonRect.top + salmonRect.height * 0.25,
    };
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    await startPointerDrag(harness.itemHandle("categorise-item-eagle"), destination);
    const destinationProjection = await waitFor(() =>
      harness.host.querySelector<HTMLElement>("[data-authoring-contained-destination-projection]"),
    );
    await waitFor(() => salmon.getBoundingClientRect().top > salmonRect.top + 8);

    expect(harness.itemIdsInCategory("categorise-bin-birds")).toEqual([
      "categorise-item-eagle",
      "categorise-item-sparrow",
      "categorise-item-robin",
    ]);
    expect(harness.itemIdsInCategory("categorise-bin-fish")).toEqual(["categorise-item-salmon"]);
    expect(documentWrites).toBe(0);
    expectItemSilhouette(eagle, eagleRect, harness);
    const destinationRect = destinationProjection.getBoundingClientRect();
    expect(destinationRect.left).toBeCloseTo(salmonRect.left, 1);
    expect(destinationRect.top).toBeCloseTo(salmonRect.top, 1);
    expect(destinationRect.width).toBeCloseTo(salmonRect.width, 1);
    expect(destinationRect.height).toBeCloseTo(eagleRect.height, 1);
    expect(getComputedStyle(fishAddAction).visibility).toBe("hidden");
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.itemIdsInCategory("categorise-bin-birds")).toEqual([
      "categorise-item-sparrow",
      "categorise-item-robin",
    ]);
    expect(harness.itemIdsInCategory("categorise-bin-fish")).toEqual([
      "categorise-item-eagle",
      "categorise-item-salmon",
    ]);
    expect(documentWrites).toBe(1);
    expect(
      harness.host.querySelector("[data-authoring-contained-destination-projection]"),
    ).toBeNull();
    expect(getComputedStyle(harness.itemAddAction("categorise-bin-fish")).visibility).toBe(
      "visible",
    );
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("replaces the target Add item action while projecting at the end of a category", async () => {
    await page.viewport(1100, 900);
    const harness = await mountCategoriseAuthoringHarness();
    mounted.push(harness);
    const fishAddAction = harness.itemAddAction("categorise-bin-fish");
    const addActionRect = fishAddAction.getBoundingClientRect();
    const destination = {
      x: addActionRect.left + addActionRect.width / 2,
      y: addActionRect.top + addActionRect.height / 2,
    };

    await startPointerDrag(harness.itemHandle("categorise-item-eagle"), destination);
    const destinationProjection = await waitFor(() =>
      harness.host.querySelector<HTMLElement>("[data-authoring-contained-destination-projection]"),
    );

    expect(getComputedStyle(fishAddAction).visibility).toBe("hidden");
    const destinationRect = destinationProjection.getBoundingClientRect();
    expect(destinationRect.left).toBeCloseTo(addActionRect.left, 1);
    expect(destinationRect.top).toBeCloseTo(addActionRect.top, 1);
    expect(destinationRect.width).toBeCloseTo(addActionRect.width, 1);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();
    expect(harness.itemIdsInCategory("categorise-bin-fish")).toEqual(["categorise-item-salmon"]);

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.itemIdsInCategory("categorise-bin-fish")).toEqual([
      "categorise-item-salmon",
      "categorise-item-eagle",
    ]);
    expect(getComputedStyle(harness.itemAddAction("categorise-bin-fish")).visibility).toBe(
      "visible",
    );
  });

  it("moves an item to the adjacent category with Arrow Right and restores focus", async () => {
    await page.viewport(1100, 900);
    const harness = await mountCategoriseAuthoringHarness();
    mounted.push(harness);
    const handle = harness.itemHandle("categorise-item-eagle");
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    handle.focus({ preventScroll: true });
    await userEvent.keyboard("{Space}");
    await waitFor(() => harness.host.querySelector("[data-interaction-drag-overlay]"));
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() =>
      requiredElement<HTMLElement>(
        harness.host,
        "[data-testid=scaffold-movement-status]",
      ).textContent?.includes("Fish"),
    );
    await waitFor(() =>
      harness.host.querySelector("[data-authoring-contained-destination-projection]"),
    );

    expect(documentWrites).toBe(0);
    expect(harness.itemIdsInCategory("categorise-bin-birds")[0]).toBe("categorise-item-eagle");
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();
    await userEvent.keyboard("{Space}");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.itemIdsInCategory("categorise-bin-birds")).toEqual([
      "categorise-item-sparrow",
      "categorise-item-robin",
    ]);
    expect(harness.itemIdsInCategory("categorise-bin-fish")).toEqual([
      "categorise-item-eagle",
      "categorise-item-salmon",
    ]);
    expect(documentWrites).toBe(1);
    await waitFor(() => document.activeElement === harness.itemHandle("categorise-item-eagle"));
    harness.editor.off("transaction", countDocumentWrite);
  });
});

function expectCategorySilhouette(
  source: HTMLElement,
  initialRect: DOMRect,
  harness: CategoriseAuthoringHarness,
): void {
  const style = getComputedStyle(source);
  const content = requiredElement<HTMLElement>(source, ".sc-course-categorise__bin-content");
  const draggedRect = source.getBoundingClientRect();

  expect(source).toHaveAttribute("data-authoring-movement-silhouette");
  expect(style.borderStyle).toBe("dashed");
  expect(style.backgroundColor).toMatch(/^rgba\(.+, 0\)$/);
  expect(getComputedStyle(content).visibility).toBe("hidden");
  expect(draggedRect.width).toBeCloseTo(initialRect.width, 1);
  expect(draggedRect.height).toBeCloseTo(initialRect.height, 1);
  expect(harness.host.querySelector("[data-interaction-drag-overlay]")).not.toBeNull();
}

function expectItemSilhouette(
  source: HTMLElement,
  initialRect: DOMRect,
  harness: CategoriseAuthoringHarness,
): void {
  const content = requiredElement<HTMLElement>(source, ".sc-course-categorise__item-content");
  const style = getComputedStyle(source);
  const draggedRect = source.getBoundingClientRect();
  const overlay = requiredElement<HTMLElement>(harness.host, "[data-interaction-drag-overlay]");

  expect(source).toHaveAttribute("data-authoring-movement-silhouette");
  expect(style.borderStyle).toBe("dashed");
  expect(style.backgroundColor).toMatch(/^rgba\(.+, 0\)$/);
  expect(getComputedStyle(content).visibility).toBe("hidden");
  expect(draggedRect.width).toBeCloseTo(initialRect.width, 1);
  expect(draggedRect.height).toBeCloseTo(initialRect.height, 1);
  expect(overlay.querySelector(".sc-app-categorise__category-select")).toBeNull();
}

async function mountCategoriseAuthoringHarness(): Promise<CategoriseAuthoringHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "box-sizing: border-box; min-height: 700px; padding: 32px; position: relative; width: 940px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.className = "sc-course sc-course-theme-scaffold-flow-v1";
  ownerRoot.style.cssText =
    "box-sizing: border-box; min-height: 636px; overflow: auto; padding: 16px; position: relative; width: 876px";
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    extensions: [
      createScaffoldCapabilitiesStorageExtension(categoriseTestCapabilities),
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      ExtendedParagraph,
      createRuntimeBlockFrameAttributesExtension([categoriseBlockDefinition.nodeType]),
      AssessmentTitleNode,
      AssessmentInstructionsNode,
      AssessmentPromptNode,
      AssessmentHintNode,
      AssessmentActionsGroupNode,
      AssessmentHintsGroupNode,
      AssessmentSummaryFeedbackNode,
      CategoriseAuthoringExtension,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: categoriseDocument(),
  });
  const rendered = await renderBrowserReact(
    createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, ownerRoot),
    { baseElement: host, container: reactElement },
  );

  await waitFor(() => ownerRoot.querySelectorAll('[data-node="categorise-bin"]').length === 3);
  await animationFrames(2);

  const categories = () =>
    Array.from(ownerRoot.querySelectorAll<HTMLElement>('[data-node="categorise-bin"]')).filter(
      (element) => !element.closest("[data-interaction-drag-overlay]"),
    );
  const category = (categoryId: string) => {
    const element = categories().find(
      (candidate) => candidate.getAttribute("data-bin-id") === categoryId,
    );
    if (!element) throw new Error(`Expected Categorise category ${categoryId}.`);
    return element;
  };
  const items = () =>
    Array.from(ownerRoot.querySelectorAll<HTMLElement>('[data-node="categorise-item"]')).filter(
      (element) => !element.closest("[data-interaction-drag-overlay]"),
    );
  const item = (itemId: string) => {
    const element = items().find((candidate) => candidate.getAttribute("data-item-id") === itemId);
    if (!element) throw new Error(`Expected Categorise item ${itemId}.`);
    return element;
  };

  return {
    editor,
    host,
    rendered,
    category,
    categoryHandle: (categoryId) =>
      requiredElement<HTMLButtonElement>(category(categoryId), ".sc-app-categorise__move-action"),
    categoryIdsInDocument: () => categoriseCategoryIdsInDocument(editor),
    item,
    itemAddAction: (categoryId) =>
      requiredElement<HTMLButtonElement>(category(categoryId), ".sc-app-categorise__add"),
    itemHandle: (itemId) =>
      requiredElement<HTMLButtonElement>(item(itemId), "[data-contained-movement-handle]"),
    itemIdsInCategory: (categoryId) => categoriseItemIdsInCategory(editor, categoryId),
  };
}

function categoriseDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "categorise",
        attrs: {
          id: "categorise-authoring-reorder",
          assessment: { feedbackByItemId: {}, summaryFeedback: null },
        },
        content: [
          {
            type: "assessment_title",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Categorise" }] }],
          },
          { type: "assessment_instructions", content: [{ type: "paragraph" }] },
          { type: "assessment_prompt", content: [{ type: "paragraph" }] },
          {
            type: "categorise_content",
            content: [
              {
                type: "categorise_bins_group",
                content: [
                  categoriseCategory("categorise-bin-birds", "Birds", [
                    categoriseItem("categorise-item-eagle", "Eagle"),
                    categoriseItem("categorise-item-sparrow", "Sparrow"),
                    categoriseItem("categorise-item-robin", "Robin"),
                  ]),
                  categoriseCategory("categorise-bin-fish", "Fish", [
                    categoriseItem("categorise-item-salmon", "Salmon"),
                  ]),
                  categoriseCategory("categorise-bin-reptiles", "Reptiles", [
                    categoriseItem("categorise-item-iguana", "Iguana"),
                  ]),
                ],
              },
            ],
          },
          {
            type: "assessment_actions_group",
            content: [{ type: "assessment_hints_group" }, { type: "assessment_summary_feedback" }],
          },
        ],
      },
    ],
  };
}

function categoriseCategory(id: string, label: string, items: JSONContent[]): JSONContent {
  return {
    type: "categorise_bin",
    attrs: { id },
    content: [
      {
        type: "categorise_bin_title",
        content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
      },
      { type: "categorise_items_group", content: items },
    ],
  };
}

function categoriseItem(id: string, label: string): JSONContent {
  return {
    type: "categorise_item",
    attrs: { id },
    content: [
      {
        type: "categorise_item_body",
        content: [{ type: "paragraph", content: [{ type: "text", text: label }] }],
      },
    ],
  };
}

function categoriseCategoryIdsInDocument(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === "categorise_bin" && typeof node.attrs["id"] === "string") {
      ids.push(node.attrs["id"]);
    }
    return true;
  });
  return ids;
}

function categoriseItemIdsInCategory(editor: Editor, categoryId: string): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "categorise_bin" || node.attrs["id"] !== categoryId) return true;
    node.descendants((descendant) => {
      if (
        descendant.type.name === "categorise_item" &&
        typeof descendant.attrs["id"] === "string"
      ) {
        ids.push(descendant.attrs["id"]);
      }
      return true;
    });
    return false;
  });
  return ids;
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element ${selector}.`);
  return element;
}

async function startPointerDrag(
  source: HTMLElement,
  destination: Readonly<{ x: number; y: number }>,
): Promise<void> {
  const sourceRect = source.getBoundingClientRect();
  const start = {
    x: sourceRect.left + sourceRect.width / 2,
    y: sourceRect.top + sourceRect.height / 2,
  };
  fireEvent.pointerDown(source, {
    button: 0,
    buttons: 1,
    clientX: start.x,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: start.x + 12,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(1);
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: destination.x,
    clientY: destination.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function finishPointerDrag(point: Readonly<{ x: number; y: number }>): Promise<void> {
  fireEvent.pointerUp(document, {
    buttons: 0,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function waitFor<T>(read: () => T | null | false, frames = 120): Promise<T> {
  for (let frame = 0; frame < frames; frame += 1) {
    const value = read();
    if (value) return value;
    await animationFrames(1);
  }
  throw new Error("Timed out waiting for Categorise authoring drag state.");
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
