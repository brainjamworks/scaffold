import { Editor, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR } from "@/editor/movement/view/authoring-contained-reorder-projection";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import "@/styles/globals.css";

import { ChecklistAuthoringExtension } from "./checklist-authoring-extension";
import {
  CHECKLIST_ITEM_NODE,
  CHECKLIST_NODE,
  checklistItemContent,
  emptyChecklistData,
} from "./content";

interface ChecklistAuthoringHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly rendered: RenderResult;
  handle(index: number): HTMLButtonElement;
  item(index: number): HTMLElement;
  itemIdsInDocument(): string[];
  itemsInDom(): HTMLElement[];
}

const mounted: ChecklistAuthoringHarness[] = [];

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("authoring Checklist contained reorder", () => {
  it("aligns row controls to the text centreline without shrinking the drag target", async () => {
    await page.viewport(1000, 800);
    const harness = await mountChecklistAuthoringHarness();
    mounted.push(harness);
    const first = harness.item(0);
    const handle = harness.handle(0);
    const grip = requiredElement<HTMLElement>(handle, ".sc-app-contained-movement-handle__visual");
    const checkbox = requiredElement<HTMLElement>(first, ".sc-course-checklist__checkbox");
    const text = requiredElement<HTMLElement>(first, ".sc-course-checklist__item-text p");
    const deleteButton = requiredElement<HTMLElement>(first, ".sc-app-checklist-item-delete");
    const textCentre = elementCentreY(text);

    expectClose(elementCentreY(grip), textCentre, 1);
    expectClose(elementCentreY(checkbox), textCentre, 1);
    expectClose(elementCentreY(deleteButton), textCentre, 1);
    expect(handle.getBoundingClientRect().width).toBeGreaterThanOrEqual(44);
    expect(handle.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  });

  it("projects row order locally and commits the document once on keyboard drop", async () => {
    await page.viewport(1000, 800);
    const harness = await mountChecklistAuthoringHarness();
    mounted.push(harness);
    const rows = harness.itemsInDom();
    const first = rows[0];
    const second = rows[1];
    if (!first || !second) throw new Error("Checklist reorder requires two rows");
    const firstTop = first.getBoundingClientRect().top;
    const secondTop = second.getBoundingClientRect().top;
    const before = harness.itemIdsInDocument();
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    const handle = harness.handle(0);
    const activationId = handle.getAttribute("data-authoring-movement-activation-id");
    handle.focus({ preventScroll: true });
    await userEvent.keyboard(" ");
    await waitFor(() => harness.host.querySelector("[data-interaction-drag-overlay]"));
    await userEvent.keyboard("{ArrowDown}");

    await waitFor(
      () =>
        first.getBoundingClientRect().top > firstTop + 4 &&
        second.getBoundingClientRect().top < secondTop - 4,
      () => "Checklist rows to project their local order",
    );
    expect(harness.itemsInDom()).toEqual(rows);
    expect(harness.itemIdsInDocument()).toEqual(before);
    expect(documentWrites).toBe(0);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await userEvent.keyboard(" ");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.itemIdsInDocument()).toEqual([before[1], before[0], before[2]]);
    expect(documentWrites).toBe(1);
    await waitFor(
      () =>
        document.activeElement?.getAttribute("data-authoring-movement-activation-id") ===
        activationId,
      () => "focus restoration to the moved Checklist row",
    );
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("shows an empty same-size row and restores it when keyboard dragging is cancelled", async () => {
    await page.viewport(1000, 800);
    const harness = await mountChecklistAuthoringHarness();
    mounted.push(harness);
    const first = harness.item(0);
    const second = harness.item(1);
    const shell = requiredElement<HTMLElement>(first, ".sc-app-checklist-item-shell");
    const controlSlot = requiredElement<HTMLElement>(first, ".sc-course-checklist__control-slot");
    const checkbox = requiredElement<HTMLElement>(first, ".sc-course-checklist__checkbox");
    const content = requiredElement<HTMLElement>(first, ".sc-course-checklist__item-text");
    const handle = harness.handle(0);
    const before = harness.itemIdsInDocument();
    const firstRect = first.getBoundingClientRect();
    const secondTop = second.getBoundingClientRect().top;

    handle.focus({ preventScroll: true });
    await userEvent.keyboard(" ");
    await waitFor(() => harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(first).toHaveAttribute("data-authoring-movement-silhouette");
    expect(shell).toHaveAttribute("data-authoring-movement-silhouette-surface");
    expect(controlSlot).toHaveAttribute("data-authoring-movement-silhouette-surface");
    expect(getComputedStyle(shell).visibility).toBe("visible");
    expect(getComputedStyle(controlSlot).visibility).toBe("visible");
    expect(getComputedStyle(checkbox).visibility).toBe("hidden");
    expect(getComputedStyle(content).visibility).toBe("hidden");
    expect(getComputedStyle(shell).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(shell).boxShadow).toBe("none");
    const checkboxMarker = getComputedStyle(controlSlot, "::before");
    expect(checkboxMarker.content).not.toBe("none");
    expect(checkboxMarker.visibility).toBe("visible");
    expect(checkboxMarker.borderStyle).toBe("dashed");
    expect(checkboxMarker.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(Number.parseFloat(checkboxMarker.width)).toBeGreaterThan(0);
    expect(Number.parseFloat(checkboxMarker.height)).toBeGreaterThan(0);
    expectClose(first.getBoundingClientRect().width, firstRect.width, 0.5);
    expectClose(first.getBoundingClientRect().height, firstRect.height, 0.5);

    await userEvent.keyboard("{ArrowDown}");
    await waitFor(() => second.getBoundingClientRect().top < secondTop - 4);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expectClose(first.getBoundingClientRect().top, firstRect.top, 1);
    expectClose(second.getBoundingClientRect().top, secondTop, 1);
    expect(harness.itemIdsInDocument()).toEqual(before);
    expect(first).not.toHaveAttribute("data-authoring-movement-silhouette");
    expect(
      harness.host.querySelector(`[${AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR}]`),
    ).toBeNull();
    expect(document.activeElement).toBe(handle);
  });

  it("uses the same local projection for pointer dragging", async () => {
    await page.viewport(1000, 800);
    const harness = await mountChecklistAuthoringHarness();
    mounted.push(harness);
    const first = harness.item(0);
    const second = harness.item(1);
    const firstTop = first.getBoundingClientRect().top;
    const secondRect = second.getBoundingClientRect();
    const before = harness.itemIdsInDocument();
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);
    const destination = {
      x: secondRect.left + secondRect.width / 2,
      y: secondRect.top + secondRect.height * 0.75,
    };

    await startPointerDrag(harness.handle(0), destination);
    await waitFor(() => first.getBoundingClientRect().top > firstTop + 4);

    expect(harness.itemIdsInDocument()).toEqual(before);
    expect(documentWrites).toBe(0);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.itemIdsInDocument()).toEqual([before[1], before[0], before[2]]);
    expect(documentWrites).toBe(1);
    expect(
      harness.host.querySelector(`[${AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR}]`),
    ).toBeNull();
    harness.editor.off("transaction", countDocumentWrite);
  });
});

async function mountChecklistAuthoringHarness(): Promise<ChecklistAuthoringHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "box-sizing: border-box; min-height: 500px; padding: 32px; position: relative; width: 760px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.className = "sc-course sc-course-theme-scaffold-flow-v1";
  ownerRoot.style.cssText =
    "box-sizing: border-box; min-height: 436px; overflow: auto; padding: 16px; position: relative; width: 696px";
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      ChecklistAuthoringExtension,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: checklistDocument(),
  });
  const rendered = await renderBrowserReact(
    createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, ownerRoot),
    { baseElement: host, container: reactElement },
  );

  await waitFor(() => ownerRoot.querySelectorAll('[data-node="checklist-item"]').length === 3);
  await animationFrames(2);

  const itemsInDom = () =>
    Array.from(ownerRoot.querySelectorAll<HTMLElement>('[data-node="checklist-item"]')).filter(
      (element) => !element.closest("[data-interaction-drag-overlay]"),
    );
  return {
    editor,
    host,
    rendered,
    handle: (index) =>
      requiredElement<HTMLButtonElement>(itemsInDom()[index]!, "[data-contained-movement-handle]"),
    item: (index) => itemsInDom()[index]!,
    itemIdsInDocument: () => checklistItemIdsInDocument(editor),
    itemsInDom,
  };
}

function checklistDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: CHECKLIST_NODE,
        attrs: { id: "check0000001", data: emptyChecklistData() },
        content: [
          checklistItem("item00000001", "Alpha"),
          checklistItem("item00000002", "Beta with a taller second line"),
          checklistItem("item00000003", "Gamma"),
        ],
      },
    ],
  };
}

function checklistItem(id: string, text: string): JSONContent {
  return {
    type: CHECKLIST_ITEM_NODE,
    attrs: { id },
    content: checklistItemContent(text),
  };
}

function checklistItemIdsInDocument(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === CHECKLIST_ITEM_NODE && typeof node.attrs["id"] === "string") {
      ids.push(node.attrs["id"]);
    }
    return true;
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

function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

function elementCentreY(element: Element): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

async function waitFor(
  condition: () => unknown,
  timeoutDescription: () => string = () => "Checklist authoring drag state",
): Promise<void> {
  const deadline = performance.now() + 8_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error(`Timed out waiting for ${timeoutDescription()}.`);
    }
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
