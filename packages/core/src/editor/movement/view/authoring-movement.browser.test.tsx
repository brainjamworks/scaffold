import { fireEvent } from "@testing-library/react";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page } from "vite-plus/test/browser/context";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
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
import { pageDefaultSurfaceDefinition } from "@/editor/surfaces/model/templates/page-default";
import { createSurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
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
  readonly editorElement: HTMLElement;
  readonly host: HTMLElement;
  readonly ownerRoot: HTMLElement;
  readonly rendered: RenderResult;
  block(id: string): HTMLElement;
  blockHandle(): HTMLButtonElement;
  ids(): string[];
  overlay(): HTMLElement | null;
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
  it("keeps the genuine client point authoritative after scroll geometry changes", async () => {
    await page.viewport(1100, 800);
    const harness = await mountMovementHarness();
    mounted.push(harness);
    const before = harness.ids();
    const source = harness.blockHandle();
    const target = harness.block("b");
    const targetRect = target.getBoundingClientRect();
    expect(targetRect.left).toBeGreaterThan(100);

    const pointer = {
      x: targetRect.left + targetRect.width / 2,
      y: targetRect.top + targetRect.height * 0.75,
    };
    await startPointerDrag(source, pointer);

    expect(source).toHaveAttribute("data-interaction-drag-placeholder");
    const preview = requiredElement<HTMLElement>(
      harness.host,
      '[data-authoring-movement-preview="block"]',
    );
    expect(preview.closest("[data-interaction-drag-overlay]")).not.toBeNull();
    expect(preview.querySelector("button, [data-authoring-move-handle]")).toBeNull();
    expect(harness.host.querySelectorAll("[data-interaction-drag-overlay]")).toHaveLength(1);
    expectIndicatorAt(harness, target);

    harness.editorElement.style.transform = "translateY(-104px)";
    fireEvent.scroll(harness.ownerRoot);
    await animationFrames(3);
    const currentTarget = harness.block("c");
    expectIndicatorAt(harness, currentTarget);

    await finishPointerDrag(pointer);
    await harness.waitForIdle();
    expect(harness.ids()).toEqual(["b", "c", "a"]);
    expect(harness.ids()).not.toEqual(before);
  });

  it("keeps distinct handles, overlay focus, and cancellation without a document write", async () => {
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

    const before = harness.ids();
    source.focus({ preventScroll: true });
    const targetRect = harness.block("c").getBoundingClientRect();
    await startPointerDrag(source, {
      x: targetRect.left + targetRect.width / 2,
      y: targetRect.top + targetRect.height / 2,
    });
    expect(harness.overlay()).not.toBeNull();
    fireEvent.keyDown(document, { code: "Escape", key: "Escape" });
    await harness.waitForIdle();

    expect(harness.ids()).toEqual(before);
    expect(document.activeElement).toBe(source);
  });
});

async function mountMovementHarness(): Promise<MovementBrowserHarness> {
  const host = document.createElement("div");
  host.style.cssText =
    "position: absolute; left: 120px; top: 72px; width: 720px; height: 620px; padding: 24px; box-sizing: border-box";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.style.cssText =
    "position: relative; width: 640px; height: 520px; padding: 24px 48px; box-sizing: border-box; overflow: hidden";
  const editorElement = document.createElement("div");
  const reactElement = document.createElement("div");
  ownerRoot.append(editorElement, reactElement);
  host.append(ownerRoot);
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
    content: movementDocument(["a", "b", "c"]),
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
    editorElement,
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
    overlay: () => host.querySelector<HTMLElement>("[data-interaction-drag-overlay]"),
    waitForIdle: () =>
      waitFor(
        () =>
          !host.querySelector("[data-interaction-drag-overlay]") &&
          !host.querySelector("[data-interaction-drag-placeholder]"),
      ),
  };
  return harness;
}

function movementDocument(ids: readonly string[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "courseDocument",
        content: [
          {
            type: "surface",
            attrs: { id: "surface-a", variant: "page-default" },
            content: ids.map((id) => ({ type: TEST_BLOCK, attrs: { id } })),
          },
        ],
      },
    ],
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

function expectIndicatorAt(harness: MovementBrowserHarness, target: HTMLElement): void {
  const indicator = requiredElement<HTMLElement>(
    harness.host,
    "[data-testid=scaffold-drop-indicator-frame]",
  );
  const targetRect = target.getBoundingClientRect();
  expectClose(Number.parseFloat(indicator.style.left), targetRect.left, 1);
  expectClose(Number.parseFloat(indicator.style.top), targetRect.top, 1);
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}.`);
  return element;
}

async function waitFor(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for movement state.");
    await animationFrames(1);
  }
  await animationFrames(1);
}

async function animationFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

function expectClose(actual: number, expected: number, tolerance: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}
