import { Editor, type JSONContent } from "@tiptap/core";
import UniqueID from "@tiptap/extension-unique-id";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { fireEvent } from "@testing-library/react";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { createScaffoldApplication } from "@/composition/application/create-scaffold-application";
import { createScaffoldCapabilitiesStorageExtension } from "@/composition/extensions/scaffold-capabilities-storage";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createRuntimeBlockFrameAttributesExtension } from "@/editor/frame/model/frame-attributes-extension";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { createAuthoringMovementTestRoot } from "@/editor/movement/tests/authoring-movement-test-root";
import { AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR } from "@/editor/movement/view/authoring-contained-reorder-projection";
import { AUTHORING_MOVEMENT_SILHOUETTE_ATTR } from "@/editor/movement/view/authoring-movement-presentation";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import "@/styles/globals.css";
import "@/theme/course/designs/scaffold-flow/v1/process-flow.css";
import "@radix-ui/themes/styles.css";

import { PROCESS_FLOW_NODE, PROCESS_FLOW_STEP_NODE, createProcessFlowContent } from "./content";
import { ProcessFlowAuthoringExtension } from "./process-flow-authoring-extension";
import "./ProcessFlow.css";

interface ProcessFlowAuthoringHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly rendered: RenderResult;
  handle(index: number): HTMLButtonElement;
  itemsInDom(): HTMLElement[];
  stepIdsInDocument(): string[];
}

const mounted: ProcessFlowAuthoringHarness[] = [];
const testCapabilities = createScaffoldApplication().capabilities;

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("authoring Process Flow reorder", () => {
  it("renders connectors and keyboard scrolling through the live NodeView wrappers", async () => {
    await page.viewport(1100, 800);
    const harness = await mountProcessFlowAuthoringHarness("horizontal");
    mounted.push(harness);
    const items = harness.itemsInDom();
    const first = items[0];
    const last = items.at(-1);
    if (!first || !last) throw new Error("Process Flow wrapper coverage requires steps");

    const list = requiredElement<HTMLElement>(harness.host, ".sc-course-process-flow__steps");
    const scrollport = requiredElement<HTMLElement>(
      harness.host,
      ".sc-course-process-flow__scrollport",
    );

    expect(list.tagName).toBe("DIV");
    expect(list).toHaveAttribute("role", "list");
    expect(items.every((item) => item.tagName === "DIV")).toBe(true);
    expect(items.every((item) => item.getAttribute("role") === "listitem")).toBe(true);
    expect(getComputedStyle(first, "::after").content).not.toBe("none");
    expect(getComputedStyle(last, "::after").content).toBe("none");
    expect(scrollport).toHaveAttribute("data-process-flow-scrollable", "horizontal");
    expect(scrollport.tabIndex).toBe(0);
  });

  it("projects horizontal step order locally and commits once on keyboard drop", async () => {
    await page.viewport(1100, 800);
    const harness = await mountProcessFlowAuthoringHarness("horizontal");
    mounted.push(harness);
    const items = harness.itemsInDom();
    const first = items[0];
    const second = items[1];
    if (!first || !second) throw new Error("Process Flow reorder requires two steps");
    const firstLeft = first.getBoundingClientRect().left;
    const secondLeft = second.getBoundingClientRect().left;
    const before = harness.stepIdsInDocument();
    let documentWrites = 0;
    const countDocumentWrite = ({ transaction }: { transaction: { docChanged: boolean } }) => {
      if (transaction.docChanged) documentWrites += 1;
    };
    harness.editor.on("transaction", countDocumentWrite);

    const handle = harness.handle(0);
    const activationId = handle.getAttribute("data-authoring-movement-activation-id");
    handle.focus({ preventScroll: true });
    expect(document.activeElement).toBe(handle);
    await userEvent.keyboard(" ");
    const overlay = await waitForElement(harness.host, "[data-interaction-drag-overlay]");

    expect(overlay.querySelector("[data-authoring-movement-snapshot]")?.textContent).toContain(
      "Research",
    );
    await waitFor(
      () => harness.host.querySelector(`[${AUTHORING_MOVEMENT_SILHOUETTE_ATTR}]`),
      "Process Flow keyboard silhouette",
    );
    expect(harness.host.querySelector(`[${AUTHORING_MOVEMENT_SILHOUETTE_ATTR}]`)).toHaveAttribute(
      "data-node",
      "process-flow-step",
    );

    await userEvent.keyboard("{ArrowRight}");
    await waitFor(
      () =>
        first.getBoundingClientRect().left > firstLeft + 4 &&
        second.getBoundingClientRect().left < secondLeft - 4,
      "Process Flow to project horizontally",
    );

    expect(harness.itemsInDom()).toEqual(items);
    expect(harness.stepIdsInDocument()).toEqual(before);
    expect(documentWrites).toBe(0);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await userEvent.keyboard(" ");
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.stepIdsInDocument()).toEqual([before[1], before[0], before[2]]);
    expect(documentWrites).toBe(1);
    await waitFor(
      () =>
        document.activeElement?.getAttribute("data-authoring-movement-activation-id") ===
        activationId,
      "focus restoration to the moved Process Flow step",
    );
    harness.editor.off("transaction", countDocumentWrite);
  });

  it("uses the same local projection for vertical pointer dragging", async () => {
    await page.viewport(1000, 900);
    const harness = await mountProcessFlowAuthoringHarness("vertical");
    mounted.push(harness);
    const items = harness.itemsInDom();
    const first = items[0];
    const second = items[1];
    if (!first || !second) throw new Error("Process Flow reorder requires two steps");
    const firstTop = first.getBoundingClientRect().top;
    const secondTop = second.getBoundingClientRect().top;
    const secondRect = second.getBoundingClientRect();
    const before = harness.stepIdsInDocument();
    const destination = {
      x: secondRect.left + secondRect.width / 2,
      y: secondRect.top + secondRect.height * 0.75,
    };

    await startPointerDrag(harness.handle(0), destination);
    const overlay = await waitForElement(harness.host, "[data-interaction-drag-overlay]");

    expect(overlay.querySelector("[data-authoring-movement-snapshot]")?.textContent).toContain(
      "Research",
    );
    await waitFor(
      () => harness.host.querySelector(`[${AUTHORING_MOVEMENT_SILHOUETTE_ATTR}]`),
      "Process Flow pointer silhouette",
    );
    await waitFor(
      () =>
        first.getBoundingClientRect().top > firstTop + 4 &&
        second.getBoundingClientRect().top < secondTop - 4,
      "Process Flow to project vertically",
    );

    expect(harness.itemsInDom()).toEqual(items);
    expect(harness.stepIdsInDocument()).toEqual(before);
    expect(harness.host.querySelector("[data-testid=scaffold-drop-indicator-frame]")).toBeNull();

    await finishPointerDrag(destination);
    await waitFor(() => !harness.host.querySelector("[data-interaction-drag-overlay]"));

    expect(harness.stepIdsInDocument()).toEqual([before[1], before[0], before[2]]);
    expect(
      harness.host.querySelector(`[${AUTHORING_CONTAINED_REORDER_PROJECTION_ATTR}]`),
    ).toBeNull();
    expect(first).not.toHaveAttribute(AUTHORING_MOVEMENT_SILHOUETTE_ATTR);
  });
});

async function mountProcessFlowAuthoringHarness(
  orientation: "horizontal" | "vertical",
): Promise<ProcessFlowAuthoringHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "box-sizing: border-box; min-height: 650px; padding: 32px; position: relative; width: 900px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.className = "sc-course sc-course-theme-scaffold-flow-v1";
  ownerRoot.style.cssText =
    "box-sizing: border-box; min-height: 586px; overflow: auto; padding: 24px; position: relative; width: 836px";
  const reactElement = document.createElement("div");
  ownerRoot.append(reactElement);
  host.append(ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      UniqueID.configure({ attributeName: "id", types: "all", updateDocument: false }),
      createScaffoldCapabilitiesStorageExtension(testCapabilities),
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createRuntimeBlockFrameAttributesExtension([PROCESS_FLOW_NODE]),
      ProcessFlowAuthoringExtension,
    ],
    content: processFlowDocument(orientation),
  });
  const rendered = await renderBrowserReact(
    createAuthoringMovementTestRoot(editor, <EditorContent editor={editor} />, ownerRoot),
    { baseElement: host, container: reactElement },
  );

  await waitFor(() => ownerRoot.querySelectorAll(processFlowItemSelector()).length === 3);
  await waitFor(
    () =>
      ownerRoot.querySelectorAll('[data-interaction-drag-activation-valid="true"]').length === 3,
    "Process Flow drag environment",
  );
  await animationFrames(2);

  const itemsInDom = () =>
    Array.from(ownerRoot.querySelectorAll<HTMLElement>(processFlowItemSelector())).filter(
      (element) => !element.closest("[data-interaction-drag-overlay]"),
    );
  return {
    editor,
    host,
    rendered,
    handle: (index) => requiredElement(itemsInDom()[index]!, "[data-contained-movement-handle]"),
    itemsInDom,
    stepIdsInDocument: () => stepIdsInDocument(editor),
  };
}

function processFlowItemSelector(): string {
  return '[data-node="process-flow-step"]';
}

function processFlowDocument(orientation: "horizontal" | "vertical"): JSONContent {
  const flow = createProcessFlowContent({ orientation });
  flow.attrs = { ...flow.attrs, id: "processflow01" };
  if (!flow.content) throw new Error("Expected Process Flow seed steps.");
  flow.content = flow.content.map((step, index) => ({
    ...step,
    attrs: { ...step.attrs, id: `flowstep000${index + 1}` },
  }));
  return { type: "doc", content: [flow] };
}

function stepIdsInDocument(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === PROCESS_FLOW_STEP_NODE && typeof node.attrs["id"] === "string") {
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

async function waitForElement(root: ParentNode, selector: string): Promise<HTMLElement> {
  let element: HTMLElement | null = null;
  await waitFor(() => {
    element = root.querySelector<HTMLElement>(selector);
    return element;
  }, `element ${selector}`);
  return element!;
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
    clientX: start.x,
    clientY: start.y + 12,
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

async function waitFor(condition: () => unknown, description = "Process Flow authoring drag state") {
  const deadline = performance.now() + 8_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${description}.`);
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function animationFrames(count: number): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
