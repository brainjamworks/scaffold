import { fireEvent } from "@testing-library/react";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { courseBlockAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createViewportCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { InteractionDragEnvironmentProvider } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { AuthoringOverlayBoundary } from "@/editor/interactions/floating/AuthoringOverlayBoundary";
import { EditorFloatingPopover } from "@/editor/interactions/floating/EditorFloatingPopover";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import "@/styles/globals.css";

import { ContainedMovementHandle } from "./ContainedMovementHandle";
import { EditorMovementLayer } from "./EditorMovementLayer";

const TEST_BLOCK = "authoring_movement_browser_block";
const blockRegistry = createBlockRegistry([defineBlock({ nodeType: TEST_BLOCK })]);
const surfaceVariants = createSurfaceVariantRegistry([pageDefaultSurfaceDefinition]);

const TestBlockNode = Node.create({
  name: TEST_BLOCK,
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-authoring-movement-browser-block]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        ...courseBlockAuthoringFrameAttributes({
          blockId: node.attrs["id"],
          nodeType: TEST_BLOCK,
        }),
        "data-authoring-movement-browser-block": "",
        style:
          "box-sizing: border-box; height: 80px; margin-bottom: 24px; width: 320px; border: 1px solid transparent",
      },
    ];
  },
});

interface MovementBrowserHarness {
  readonly editor: Editor;
  readonly host: HTMLElement;
  readonly ownerRoot: HTMLElement;
  readonly rendered: RenderResult;
  block(id: string): HTMLElement;
  blockHandle(): HTMLButtonElement;
  ids(): string[];
  indicator(): HTMLElement | null;
  overlay(): HTMLElement | null;
  surfaceBlockIds(surfaceId: string): string[];
  waitForIdle(): Promise<void>;
}

const mounted: MovementBrowserHarness[] = [];

afterEach(async () => {
  while (mounted.length > 0) {
    const harness = mounted.pop()!;
    await harness.rendered.unmount();
    harness.editor.destroy();
    harness.host.remove();
  }
});

describe("authoring movement shared drag", () => {
  it("reveals and drops on another slide while a stationary pointer auto-scrolls", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const before = harness.ids();
    const source = harness.blockHandle();
    const rootRect = harness.ownerRoot.getBoundingClientRect();
    const pointer = {
      x: rootRect.left + 220,
      y: rootRect.bottom - 10,
    };
    expect(isVisibleWithin(harness.block("c"), harness.ownerRoot)).toBe(false);

    const forwardIndicatorGeometry = waitForSameTargetIndicatorGeometry(harness);
    await startPointerDrag(source, pointer);
    const initialKey = await waitForValue(() => harness.indicator()?.dataset.movementTargetKey);
    expect(source).toHaveAttribute("data-interaction-drag-placeholder");
    expect(harness.overlay()).not.toBeNull();

    await Promise.all([
      waitFor(() => isComfortablyVisibleWithin(harness.block("c"), harness.ownerRoot, 48)),
      forwardIndicatorGeometry,
    ]);
    const stationaryKey = await waitForValue(() => {
      const key = harness.indicator()?.dataset.movementTargetKey;
      return key && key !== initialKey ? key : undefined;
    });
    expect(stationaryKey).not.toBe(initialKey);

    await movePointer({
      x: rootRect.left + rootRect.width / 2,
      y: rootRect.top + rootRect.height / 2,
    });
    await waitForScrollStability(harness.ownerRoot);
    const target = harness.block("c");
    const targetRect = target.getBoundingClientRect();
    const dropPoint = {
      x: targetRect.left + targetRect.width / 2,
      y: targetRect.top + targetRect.height * 0.75,
    };
    await movePointer(dropPoint);
    expect(harness.indicator()).toHaveAttribute(
      "data-movement-target-key",
      expect.stringContaining(":c"),
    );
    expectIndicatorAt(harness, target);

    await finishPointerDrag(dropPoint);
    await harness.waitForIdle();

    expect(harness.surfaceBlockIds("surface00001")).toEqual(["a2"]);
    expect(harness.surfaceBlockIds("surface00003")).toEqual(["c", "a", "c2"]);
    expect(harness.ids().filter((id) => id === "a")).toHaveLength(1);
    expect(harness.ids()).not.toEqual(before);
    expectNoTransientMovementState(harness);
  });

  it("auto-scrolls in both directions and cancels without a document write", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const before = harness.ids();
    const rootRect = harness.ownerRoot.getBoundingClientRect();
    const source = harness.blockHandle();

    const forwardIndicatorGeometry = waitForSameTargetIndicatorGeometry(harness);
    await startPointerDrag(source, {
      x: rootRect.left + 220,
      y: rootRect.bottom - 10,
    });
    await Promise.all([waitFor(() => harness.ownerRoot.scrollTop > 180), forwardIndicatorGeometry]);
    const downwardScroll = harness.ownerRoot.scrollTop;

    const backwardIndicatorGeometry = waitForSameTargetIndicatorGeometry(harness);
    await movePointer({ x: rootRect.left + 220, y: rootRect.top + 10 });
    await Promise.all([
      waitFor(() => harness.ownerRoot.scrollTop < downwardScroll - 80),
      backwardIndicatorGeometry,
    ]);

    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    await harness.waitForIdle();

    expect(harness.ids()).toEqual(before);
    expectNoTransientMovementState(harness);
  });

  it("rejects an invalid cross-slide drop and clears every transient state", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const before = harness.ids();
    const targetRect = harness.block("a2").getBoundingClientRect();
    await startPointerDrag(harness.blockHandle(), {
      x: targetRect.left + targetRect.width / 2,
      y: targetRect.top + targetRect.height / 2,
    });
    expect(harness.indicator()).not.toBeNull();

    const invalidPoint = { x: -100, y: -100 };
    await movePointer(invalidPoint);
    await waitFor(() => harness.indicator() === null);
    await finishPointerDrag(invalidPoint);
    await harness.waitForIdle();

    expect(harness.ids()).toEqual(before);
    expectNoTransientMovementState(harness);
    harness.ownerRoot.dispatchEvent(new Event("scroll"));
    await animationFrames(2);
    expect(harness.indicator()).toBeNull();
  });

  it("keeps distinct handles and overlay focus outside an active drag", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const source = harness.blockHandle();
    const contained = requiredElement<HTMLButtonElement>(
      harness.ownerRoot,
      "[data-contained-movement-handle]",
    );
    const overlayControl = requiredElement<HTMLButtonElement>(
      harness.host,
      '[data-test-movement-overlay-control=""]',
    );

    expect(harness.host.querySelectorAll("[data-authoring-move-handle]")).toHaveLength(1);
    expect(harness.ownerRoot.querySelectorAll("[data-contained-movement-handle]")).toHaveLength(1);
    expect(source).toHaveAccessibleName("Move block");
    expect(contained).toHaveAccessibleName("Move choice within its group");
    expect(source).not.toHaveAttribute("aria-roledescription");
    expect(contained).not.toHaveAttribute("aria-roledescription");
    expectClose(source.getBoundingClientRect().width, 44, 0.75);
    expectClose(source.getBoundingClientRect().height, 44, 0.75);
    expectClose(contained.getBoundingClientRect().width, 44, 0.75);
    expectClose(contained.getBoundingClientRect().height, 44, 0.75);

    overlayControl.focus({ preventScroll: true });
    harness.editor.view.dispatch(
      harness.editor.state.tr.setMeta("scaffold-authoring-movement-browser", true),
    );
    await animationFrames(2);
    expect(harness.blockHandle()).toBe(source);
    expect(document.activeElement).toBe(overlayControl);
  });
});

async function mountMovementHarness(): Promise<MovementBrowserHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "position: absolute; left: 120px; top: 32px; width: 720px; height: 700px; padding: 24px; box-sizing: border-box";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.setAttribute("data-authoring-movement-browser-fixture", "");
  ownerRoot.style.cssText =
    "position: relative; width: 640px; height: 240px; padding: 24px 48px; box-sizing: border-box; overflow: auto";
  const fixtureStyles = document.createElement("style");
  fixtureStyles.textContent = `
    [data-authoring-movement-browser-fixture] [data-surface] {
      box-sizing: border-box !important;
      display: block !important;
      height: 420px !important;
      margin-bottom: 48px !important;
      max-height: none !important;
      min-height: 420px !important;
      padding: 32px 40px !important;
      position: relative !important;
      width: 100% !important;
    }
  `;
  const editorElement = document.createElement("div");
  const reactElement = document.createElement("div");
  ownerRoot.append(editorElement, reactElement);
  host.append(fixtureStyles, ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    element: editorElement,
    extensions: [
      DocumentNode,
      StarterKit.configure({ document: false, paragraph: false, undoRedo: false }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      TestBlockNode,
      createScaffoldInteractionOwnerExtension(blockRegistry),
    ],
    content: movementDocument(),
  });
  const sourcePos = nodePos(editor, "a");
  const coordinateSpace = createViewportCoordinateSpace({
    getRoot: () => ownerRoot,
    ownerDocument: ownerRoot.ownerDocument,
  });
  const rendered = await renderBrowserReact(
    <InteractionProvider store={getInteractionFacadeStoreForEditor(editor)}>
      <AuthoringOverlayBoundary container={host} ownerRoot={ownerRoot}>
        <InteractionDragEnvironmentProvider
          coordinateRoot={ownerRoot}
          coordinateSpace={coordinateSpace}
        >
          <EditorMovementLayer
            blockDefinitions={blockRegistry}
            editor={editor}
            surfaceVariants={surfaceVariants}
          >
            <ContainedMovementHandle
              label="choice"
              sourceKey="browser-contained-choice"
              sourcePos={sourcePos}
            />
            <EditorFloatingPopover.Root open>
              <EditorFloatingPopover.Trigger>Movement overlay</EditorFloatingPopover.Trigger>
              <EditorFloatingPopover.Portal>
                <EditorFloatingPopover.Content
                  aria-label="Movement overlay"
                  authoringChrome
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <button type="button" data-test-movement-overlay-control="">
                    Size control
                  </button>
                </EditorFloatingPopover.Content>
              </EditorFloatingPopover.Portal>
            </EditorFloatingPopover.Root>
          </EditorMovementLayer>
        </InteractionDragEnvironmentProvider>
      </AuthoringOverlayBoundary>
    </InteractionProvider>,
    { baseElement: host, container: reactElement },
  );
  editor.view.focus();
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, sourcePos)),
  );
  await waitFor(() => host.querySelector("[data-authoring-move-handle]"));
  await animationFrames(2);

  const harness: MovementBrowserHarness = {
    editor,
    host,
    ownerRoot,
    rendered,
    block: (id) =>
      requiredElement<HTMLElement>(
        ownerRoot,
        `[data-authoring-movement-browser-block][data-id="${id}"]`,
      ),
    blockHandle: () => requiredElement<HTMLButtonElement>(host, "[data-authoring-move-handle]"),
    ids: () => documentIds(editor),
    indicator: () => host.querySelector<HTMLElement>("[data-testid=scaffold-drop-indicator-frame]"),
    overlay: () => host.querySelector<HTMLElement>("[data-interaction-drag-overlay]"),
    surfaceBlockIds: (surfaceId) => blockIdsInSurface(editor, surfaceId),
    waitForIdle: () =>
      waitFor(
        () =>
          !host.querySelector("[data-interaction-drag-overlay]") &&
          !host.querySelector("[data-interaction-drag-placeholder]") &&
          !host.querySelector("[data-testid=scaffold-drop-indicator-frame]"),
      ),
  };
  return harness;
}

function movementDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        content: [
          surface("surface00001", ["a", "a2"]),
          surface("surface00002", ["b", "b2"]),
          surface("surface00003", ["c", "c2"]),
        ],
      },
    ],
  };
}

function surface(id: string, blockIds: readonly string[]): JSONContent {
  return {
    type: "surface",
    attrs: { id, variant: "page-default" },
    content: blockIds.map((blockId) => ({ type: TEST_BLOCK, attrs: { id: blockId } })),
  };
}

function nodePos(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== TEST_BLOCK || node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  if (found < 0) throw new Error(`Expected movement block ${id}.`);
  return found;
}

function documentIds(editor: Editor): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === TEST_BLOCK && typeof node.attrs["id"] === "string") {
      ids.push(node.attrs["id"]);
    }
    return true;
  });
  return ids;
}

function blockIdsInSurface(editor: Editor, surfaceId: string): string[] {
  const ids: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name !== "surface" || node.attrs["id"] !== surfaceId) return true;
    node.descendants((child) => {
      if (child.type.name === TEST_BLOCK && typeof child.attrs["id"] === "string") {
        ids.push(child.attrs["id"]);
      }
      return true;
    });
    return false;
  });
  return ids;
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
    clientX: start.x + 6,
    clientY: start.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(1);
  await movePointer(destination);
}

async function movePointer(point: Readonly<{ x: number; y: number }>): Promise<void> {
  fireEvent.pointerMove(document, {
    button: 0,
    buttons: 1,
    clientX: point.x,
    clientY: point.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function finishPointerDrag(pointer: Readonly<{ x: number; y: number }>): Promise<void> {
  fireEvent.pointerUp(document, {
    buttons: 0,
    clientX: pointer.x,
    clientY: pointer.y,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
  });
  await animationFrames(2);
}

async function waitForScrollStability(scrollRoot: HTMLElement): Promise<void> {
  let previous = scrollRoot.scrollTop;
  let stableFrames = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    await animationFrames(1);
    const current = scrollRoot.scrollTop;
    stableFrames = current === previous ? stableFrames + 1 : 0;
    if (stableFrames >= 3) return;
    previous = current;
  }
  throw new Error("Timed out waiting for production auto-scroll to settle.");
}

function expectIndicatorAt(harness: MovementBrowserHarness, target: HTMLElement): void {
  const indicator = requiredElement<HTMLElement>(
    harness.host,
    "[data-testid=scaffold-drop-indicator-frame]",
  );
  const targetRect = target.getBoundingClientRect();
  expectClose(Number.parseFloat(indicator.style.left), targetRect.left, 1);
  expectClose(Number.parseFloat(indicator.style.top), targetRect.top, 1);
}

async function waitForSameTargetIndicatorGeometry(harness: MovementBrowserHarness): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + 8_000;
    let previous = readIndicatorPresentation(harness);
    let settled = false;
    const samples: Array<ReturnType<typeof readIndicatorPresentation>> = [];
    const observer = new MutationObserver(() => {
      const current = readIndicatorPresentation(harness);
      const lastSample = samples.at(-1);
      if (
        current &&
        (!lastSample || lastSample.key !== current.key || lastSample.top !== current.top)
      ) {
        samples.push(current);
      }
      if (
        previous &&
        current &&
        previous.key === current.key &&
        previous.top !== current.top &&
        current.aligned
      ) {
        settled = true;
        observer.disconnect();
        resolve();
        return;
      }
      previous = current;
    });
    observer.observe(harness.host, {
      attributeFilter: ["style", "data-movement-target-key"],
      attributes: true,
      childList: true,
      subtree: true,
    });
    const checkDeadline = () => {
      if (settled) return;
      if (performance.now() > deadline) {
        settled = true;
        observer.disconnect();
        reject(
          new Error(
            `Timed out waiting for same-target indicator geometry: ${JSON.stringify(samples.slice(-8))}`,
          ),
        );
        return;
      }
      requestAnimationFrame(checkDeadline);
    };
    requestAnimationFrame(checkDeadline);
  });
}

function readIndicatorPresentation(
  harness: MovementBrowserHarness,
): Readonly<{ aligned: boolean; key: string; top: number }> | null {
  const indicator = harness.indicator();
  const key = indicator?.dataset.movementTargetKey;
  const targetId = key?.split(":").at(-1);
  if (!indicator || !key || !targetId) return null;
  const target = harness.ownerRoot.querySelector<HTMLElement>(
    `[data-id="${CSS.escape(targetId)}"]`,
  );
  if (!target) return null;
  const targetRect = target.getBoundingClientRect();
  const left = Number.parseFloat(indicator.style.left);
  const top = Number.parseFloat(indicator.style.top);
  return {
    aligned: Math.abs(left - targetRect.left) <= 1 && Math.abs(top - targetRect.top) <= 1,
    key,
    top,
  };
}

function expectNoTransientMovementState(harness: MovementBrowserHarness): void {
  expect(harness.overlay()).toBeNull();
  expect(harness.indicator()).toBeNull();
  expect(harness.host.querySelector("[data-interaction-drag-placeholder]")).toBeNull();
}

function isVisibleWithin(element: Element, container: Element): boolean {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return elementRect.bottom > containerRect.top && elementRect.top < containerRect.bottom;
}

function isComfortablyVisibleWithin(element: Element, container: Element, inset: number): boolean {
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return (
    elementRect.top >= containerRect.top + inset &&
    elementRect.bottom <= containerRect.bottom - inset
  );
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}.`);
  return element;
}

async function waitFor(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 8_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for movement state.");
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function waitForValue<T>(read: () => T | null | undefined): Promise<T> {
  let value = read();
  await waitFor(() => {
    value = read();
    return value !== null && value !== undefined;
  });
  return value!;
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}
