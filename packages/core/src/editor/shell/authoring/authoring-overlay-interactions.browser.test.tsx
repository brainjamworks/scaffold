import { Editor, Node } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { render as renderBrowserReact, type RenderResult } from "vitest-browser-react";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";
import { Select } from "@/ui/components/Select/Select";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import {
  CellAuthoringNode,
  GridAuthoringNode,
} from "@/editor/arrangements/grid/authoring/grid-nodes";
import {
  LayoutAuthoringNode,
  SectionAuthoringNode,
} from "@/editor/arrangements/layout/authoring/layout-nodes";
import {
  AUTHORING_ANCHOR_ATTR,
  authoringFrameAttributes,
  AuthoringFrameKind,
  courseBlockAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { AuthoringOverlayBoundary } from "@/editor/interactions/floating/AuthoringOverlayBoundary";
import { EditorFloatingPopover } from "@/editor/interactions/floating/EditorFloatingPopover";
import { MenuControls } from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { structuralMenuAnchorId } from "@/editor/interactions/interaction-bubble/structural-bubble-anchor";
import {
  resolveStructuralBubbleAnchorVirtualElement,
  resolveStructuralInteractionBubbleModel,
  StructuralInteractionBubbleMenu,
} from "@/editor/shell/bubbles/interaction/StructuralInteractionBubbleMenu";
import { createStructuralInteractionBubbleRendererMap } from "@/editor/interactions/interaction-bubble";
import { BlockInteractionBubbleMenu } from "@/editor/shell/bubbles/interaction/BlockInteractionBubbleMenu";
import { RichTextBubbleMenu } from "@/editor/shell/bubbles/rich-text/RichTextBubbleMenu";
import { EditorMovementLayer } from "@/editor/drag/view/EditorMovementLayer";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { defineBlock } from "@/editor/blocks/block-definition";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import "@/styles/globals.css";

const TestGridNode = Node.create({
  name: "grid",
  group: "block",
  content: "paragraph+",
  defining: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: "section[data-test-overlay-grid]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "section",
      {
        ...HTMLAttributes,
        ...authoringFrameAttributes({
          frameKind: AuthoringFrameKind.Grid,
          id: node.attrs["id"],
          nodeType: "grid",
        }),
        "data-test-overlay-grid": "",
      },
      0,
    ];
  },
});

const TEST_MOVEMENT_BLOCK = "browser_overlay_movement_block";

const testBlockRegistry = createBlockRegistry([
  ...builtInBlockRegistry.definitions,
  defineBlock({ nodeType: TEST_MOVEMENT_BLOCK }),
]);
const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: testBlockRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});

const TestMovementBlockNode = Node.create({
  name: TEST_MOVEMENT_BLOCK,
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-test-overlay-movement-block]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      {
        ...HTMLAttributes,
        ...courseBlockAuthoringFrameAttributes({
          blockId: node.attrs["id"],
          nodeType: TEST_MOVEMENT_BLOCK,
        }),
        "data-test-overlay-movement-block": "",
        style: "height: 80px; width: 200px",
      },
    ];
  },
});

interface BrowserHarness {
  collisionBoundary: HTMLElement | null;
  editor: Editor;
  host: HTMLElement;
  ownerRoot: HTMLElement;
  reactRoot: Root;
}

interface MovementHarness {
  editor: Editor;
  host: HTMLElement;
  ownerRoot: HTMLElement;
  rendered: RenderResult;
}

let harness: BrowserHarness | null = null;
const placementObserverCleanups = new Set<() => void>();

afterEach(() => {
  for (const cleanupObserver of placementObserverCleanups) cleanupObserver();
  placementObserverCleanups.clear();
  harness?.reactRoot.unmount();
  harness?.editor.destroy();
  harness?.host.remove();
  harness = null;
});

describe("authoring nested rich text dismissal", () => {
  it("lets a real Scaffold color popover consume the first Escape before its parent", async () => {
    const current = await mountOpenStructuralBubble();
    const childTrigger = requireElement<HTMLButtonElement>(
      current.ownerRoot,
      'button[aria-label="Background colour"]',
    );
    childTrigger.click();
    const child = await waitForElement<HTMLElement>(
      current.ownerRoot,
      '[role="dialog"][aria-label="Background colour"]',
    );

    await expectChildThenParentDismissal(
      current,
      childTrigger,
      child,
      () => current.ownerRoot.querySelector('[role="dialog"][aria-label="Background colour"]'),
      { consumesFocusedTooltipEscape: true },
    );
  });

  it("lets a real Scaffold menu select consume the first Escape before its parent", async () => {
    const current = await mountOpenStructuralBubble();
    const childTrigger = requireElement<HTMLButtonElement>(
      current.ownerRoot,
      'button[aria-label="Block size"]',
    );
    childTrigger.click();
    const child = await waitForElement<HTMLElement>(
      current.ownerRoot,
      '[role="listbox"][aria-label="Block size"]',
    );

    await expectChildThenParentDismissal(current, childTrigger, childTrigger, () =>
      current.ownerRoot.querySelector('[role="listbox"][aria-label="Block size"]'),
    );

    expect(child.isConnected).toBe(false);
  });

  it("preserves Radix child-first Escape and returns the later parent Escape to the editor", async () => {
    const current = await mountOpenStructuralBubble();
    const childTrigger = requireElement<HTMLButtonElement>(
      current.ownerRoot,
      'button[aria-label="Radix child"]',
    );
    childTrigger.focus({ preventScroll: true });
    childTrigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowDown",
      }),
    );
    const child = await waitForElement<HTMLElement>(
      current.ownerRoot,
      '[role="listbox"] [role="option"]',
    );

    await expectChildThenParentDismissal(current, childTrigger, child, () =>
      current.ownerRoot.querySelector('[role="listbox"]'),
    );
  });
});

describe("authoring owner-local geometry", () => {
  it("keeps a selected movement handle through a transaction while a real overlay descendant is focused", async () => {
    const current = await mountMovementHarness();

    try {
      const handle = await waitForElement<HTMLElement>(
        current.host,
        "[data-authoring-move-handle]",
      );
      const overlayControl = await waitForElement<HTMLButtonElement>(
        current.host,
        'button[data-test-movement-overlay-control=""]',
      );
      const overlayHost = overlayControl.closest("[data-scaffold-overlay-host]");
      if (!(overlayHost instanceof HTMLElement)) {
        throw new Error("Expected the movement chrome inside its overlay host.");
      }
      const movementTarget = requireElement<HTMLElement>(
        current.ownerRoot,
        "[data-test-overlay-movement-block]",
      );
      const handleRect = handle.getBoundingClientRect();
      const hostRect = overlayHost.getBoundingClientRect();
      const targetRect = movementTarget.getBoundingClientRect();
      const leftGap = targetRect.left - handleRect.right;
      const rightGap = handleRect.left - targetRect.right;

      expect(handleRect.left).toBeGreaterThanOrEqual(hostRect.left - 1);
      expect(handleRect.right).toBeLessThanOrEqual(hostRect.right + 1);
      expect(Math.min(Math.abs(leftGap - 8), Math.abs(rightGap - 8))).toBeLessThanOrEqual(1);

      overlayControl.focus({ preventScroll: true });
      expect(document.activeElement).toBe(overlayControl);
      current.editor.view.dispatch(
        current.editor.state.tr.setMeta("scaffold-browser-render", true),
      );
      await nextAnimationFrame();
      await nextAnimationFrame();

      expect(handle.isConnected).toBe(true);
      expect(current.host.querySelector("[data-authoring-move-handle]")).toBe(handle);
      expect(document.activeElement).toBe(overlayControl);
    } finally {
      await current.rendered.unmount();
      current.editor.destroy();
      current.host.remove();
    }
  });

  it("does not borrow structural trigger size from a sibling editor with the same id", async () => {
    const first = createBareGridEditor();
    const second = createBareGridEditor();
    const renderers = createStructuralInteractionBubbleRendererMap([
      {
        kind: InteractionTargetKind.Grid,
        renderer: () => <span>Grid controls</span>,
      },
    ]);

    try {
      const firstTrigger = appendStructuralTrigger(first.ownerRoot, "grid-a", 96, 72);
      const secondTrigger = appendStructuralTrigger(second.ownerRoot, "grid-a", 20, 36);
      await nextAnimationFrame();
      expect(firstTrigger.getBoundingClientRect().width).not.toBe(
        secondTrigger.getBoundingClientRect().width,
      );

      const secondStore = getInteractionFacadeStoreForEditor(second.editor);
      secondStore.getState().commands.openMenu({
        id: "grid-a",
        kind: InteractionTargetKind.Grid,
        pos: 0,
      });
      const model = resolveStructuralInteractionBubbleModel(
        second.editor,
        secondStore.getState().snapshot,
        alignmentTargetPort,
        renderers,
      );
      const virtualElement = resolveStructuralBubbleAnchorVirtualElement(
        second.editor,
        model?.descriptor ?? null,
      );
      const virtualRect = virtualElement?.getBoundingClientRect();

      expect(virtualRect?.width).toBeCloseTo(secondTrigger.getBoundingClientRect().width, 2);
      expect(virtualRect?.height).toBeCloseTo(secondTrigger.getBoundingClientRect().height, 2);
      expect(virtualRect?.width).not.toBeCloseTo(firstTrigger.getBoundingClientRect().width, 2);
      expect(virtualRect?.height).not.toBeCloseTo(firstTrigger.getBoundingClientRect().height, 2);
    } finally {
      first.editor.destroy();
      first.host.remove();
      second.editor.destroy();
      second.host.remove();
    }
  });
});

describe("authoring bubble placement", () => {
  it("keeps Block targets inert until their changed coordinates are committed", async () => {
    let placementObserver: PlacementObserver | null = null;
    const current = await mountBlockPlacementHarness((ownerRoot) => {
      placementObserver = observeBubblePlacement(ownerRoot);
    });
    const observer = requirePlacementObserver(placementObserver);
    const floating = requireElement<HTMLElement>(
      current.ownerRoot,
      '[data-scaffold-bubble-placement-ready="true"]',
    );
    const firstRect = floating.getBoundingClientRect();
    expect(observer.samples.some((sample) => !sample.ready)).toBe(true);
    expect(observer.violations).toEqual([]);

    const sampleCount = observer.samples.length;
    current.editor.commands.setNodeSelection(nodePosById(current.editor, "block-b"));
    await waitForCondition(
      () =>
        floating.dataset.scaffoldBubblePlacementReady === "true" &&
        observer.samples.length > sampleCount &&
        Math.hypot(
          floating.getBoundingClientRect().left - firstRect.left,
          floating.getBoundingClientRect().top - firstRect.top,
        ) > 1,
    );

    expect(observer.samples.slice(sampleCount).some((sample) => !sample.ready)).toBe(true);
    expect(observer.violations).toEqual([]);
    observer.disconnect();
  });

  it("keeps RichText selections inert until their changed coordinates are committed", async () => {
    let placementObserver: PlacementObserver | null = null;
    const current = await mountRichTextPlacementHarness((ownerRoot) => {
      placementObserver = observeBubblePlacement(ownerRoot);
    });
    const observer = requirePlacementObserver(placementObserver);
    const floating = requireElement<HTMLElement>(
      current.ownerRoot,
      '[data-scaffold-bubble-placement-ready="true"]',
    );
    const firstRect = floating.getBoundingClientRect();
    expect(observer.samples.some((sample) => !sample.ready)).toBe(true);
    expect(observer.violations).toEqual([]);

    const sampleCount = observer.samples.length;
    selectTextByValue(current.editor, "Second target");
    await waitForCondition(
      () =>
        floating.dataset.scaffoldBubblePlacementReady === "true" &&
        observer.samples.length > sampleCount &&
        Math.hypot(
          floating.getBoundingClientRect().left - firstRect.left,
          floating.getBoundingClientRect().top - firstRect.top,
        ) > 1,
    );

    expect(observer.samples.slice(sampleCount).some((sample) => !sample.ready)).toBe(true);
    expect(observer.violations).toEqual([]);
    observer.disconnect();
  });

  it("keeps initial and changed targets inert until Tiptap commits their coordinates", async () => {
    let placementObserver: PlacementObserver | null = null;
    const current = await mountOpenStructuralBubble({
      secondGrid: true,
      beforeOpen: (ownerRoot) => {
        placementObserver = observeBubblePlacement(ownerRoot);
      },
    });
    const observer = requirePlacementObserver(placementObserver);

    try {
      const floating = requireElement<HTMLElement>(
        current.ownerRoot,
        '[data-scaffold-bubble-placement-ready="true"]',
      );
      const firstRect = floating.getBoundingClientRect();
      expect(observer.samples.some((sample) => !sample.ready)).toBe(true);
      expect(observer.violations).toEqual([]);

      const secondPos = nodePosById(current.editor, "grid-b");
      const sampleCount = observer.samples.length;
      getInteractionFacadeStoreForEditor(current.editor)
        .getState()
        .commands.activateStructuralTarget({
          id: "grid-b",
          kind: InteractionTargetKind.Grid,
          pos: secondPos,
        });
      getInteractionFacadeStoreForEditor(current.editor).getState().commands.openMenu({
        id: "grid-b",
        kind: InteractionTargetKind.Grid,
        pos: secondPos,
      });

      await waitForCondition(
        () =>
          current.ownerRoot.querySelector('[data-test-structural-target="grid-b"]') &&
          floating.dataset.scaffoldBubblePlacementReady === "true" &&
          observer.samples.length > sampleCount,
      );
      const secondRect = floating.getBoundingClientRect();

      expect(
        Math.hypot(secondRect.left - firstRect.left, secondRect.top - firstRect.top),
      ).toBeGreaterThan(1);
      expect(observer.samples.slice(sampleCount).some((sample) => !sample.ready)).toBe(true);
      expect(observer.violations).toEqual([]);
    } finally {
      observer.disconnect();
    }
  });

  it("uses an explicit collision boundary and scrolls only the narrow toolbar viewport", async () => {
    const current = await mountOpenStructuralBubble({
      collisionBoundaryWidth: 280,
      ownerWidth: 360,
    });
    const collisionBoundary = current.collisionBoundary;
    if (!collisionBoundary) throw new Error("Expected an explicit collision boundary.");
    const toolbar = requireElement<HTMLElement>(
      current.ownerRoot,
      "[data-scaffold-interaction-bubble]",
    );
    const floating = requireElement<HTMLElement>(
      current.ownerRoot,
      '[data-scaffold-bubble-placement-ready="true"]',
    );
    const overlayHost = requireElement<HTMLElement>(
      current.ownerRoot,
      "[data-scaffold-overlay-host]",
    );
    const boundaryRect = collisionBoundary.getBoundingClientRect();
    const bubbleRect = toolbar.getBoundingClientRect();
    const availableInlineSize = Number.parseFloat(
      floating.style.getPropertyValue("--sc-overlay-available-inline-size"),
    );

    expect(collisionBoundary).not.toBe(overlayHost);
    expect(collisionBoundary).not.toBe(current.ownerRoot);
    expect(getComputedStyle(overlayHost).overflow).toBe("clip");
    expect(availableInlineSize).toBeGreaterThan(0);
    expect(availableInlineSize).toBeLessThanOrEqual(boundaryRect.width);
    expect(bubbleRect.width).toBeLessThanOrEqual(boundaryRect.width);
    expect(bubbleRect.left).toBeGreaterThanOrEqual(boundaryRect.left - 1);
    expect(bubbleRect.right).toBeLessThanOrEqual(boundaryRect.right + 1);
    expect(toolbar.scrollWidth).toBeGreaterThan(toolbar.clientWidth);
    expect(getComputedStyle(toolbar).scrollbarWidth).toBe("none");

    const toolbarFrame = requireElement<HTMLElement>(
      current.ownerRoot,
      "[data-scaffold-bubble-toolbar-frame]",
    );
    const scrollButton = requireElement<HTMLButtonElement>(
      toolbarFrame,
      '[aria-label="Show more actions"]',
    );
    const toolbarFrameRect = toolbarFrame.getBoundingClientRect();
    const scrollButtonRect = scrollButton.getBoundingClientRect();

    expect(toolbarFrameRect.left).toBeGreaterThanOrEqual(boundaryRect.left - 1);
    expect(toolbarFrameRect.right).toBeLessThanOrEqual(boundaryRect.right + 1);
    expect(scrollButtonRect.left).toBeGreaterThanOrEqual(toolbar.getBoundingClientRect().right);

    const buttons = Array.from(
      toolbar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const firstButton = buttons[0];
    const lastButton = buttons.at(-1);
    if (!firstButton || !lastButton) throw new Error("Expected toolbar controls.");
    toolbar.scrollLeft = 0;
    const ancestorScroll = {
      body: document.body.scrollLeft,
      document: document.documentElement.scrollLeft,
      editor: current.editor.view.dom.scrollLeft,
      host: current.host.scrollLeft,
      owner: current.ownerRoot.scrollLeft,
      window: window.scrollX,
    };

    scrollButton.click();
    await nextAnimationFrame();

    expect(toolbar.scrollLeft).toBeGreaterThan(0);
    expect(window.scrollX).toBe(ancestorScroll.window);
    expect(document.documentElement.scrollLeft).toBe(ancestorScroll.document);
    expect(document.body.scrollLeft).toBe(ancestorScroll.body);
    expect(current.host.scrollLeft).toBe(ancestorScroll.host);
    expect(current.ownerRoot.scrollLeft).toBe(ancestorScroll.owner);
    expect(current.editor.view.dom.scrollLeft).toBe(ancestorScroll.editor);

    toolbar.scrollLeft = 0;
    firstButton.focus({ preventScroll: true });
    firstButton.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "End" }),
    );
    await nextAnimationFrame();

    expect(document.activeElement).toBe(lastButton);
    expect(toolbar.scrollLeft).toBeGreaterThan(0);
    expect(window.scrollX).toBe(ancestorScroll.window);
    expect(document.documentElement.scrollLeft).toBe(ancestorScroll.document);
    expect(document.body.scrollLeft).toBe(ancestorScroll.body);
    expect(current.host.scrollLeft).toBe(ancestorScroll.host);
    expect(current.ownerRoot.scrollLeft).toBe(ancestorScroll.owner);
    expect(current.editor.view.dom.scrollLeft).toBe(ancestorScroll.editor);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
  });
});

async function expectChildThenParentDismissal(
  current: BrowserHarness,
  childTrigger: HTMLButtonElement,
  escapeTarget: HTMLElement,
  queryChild: () => Element | null,
  options: { consumesFocusedTooltipEscape?: boolean } = {},
): Promise<void> {
  const firstEscape = dispatchEscape(escapeTarget);

  expect(firstEscape.defaultPrevented).toBe(true);
  await waitForCondition(() => queryChild() === null);
  expect(current.ownerRoot.querySelector("[data-scaffold-interaction-bubble]")).not.toBeNull();
  expect(childTrigger.isConnected).toBe(true);
  expect(document.activeElement).toBe(childTrigger);

  if (options.consumesFocusedTooltipEscape) {
    expect(current.ownerRoot.querySelector(".sc-tooltip")).not.toBeNull();
    const tooltipEscape = dispatchEscape(childTrigger);
    expect(tooltipEscape.defaultPrevented).toBe(true);
    await waitForCondition(() => current.ownerRoot.querySelector(".sc-tooltip") === null);
    expect(current.ownerRoot.querySelector("[data-scaffold-interaction-bubble]")).not.toBeNull();
    expect(document.activeElement).toBe(childTrigger);
  }

  const secondEscape = dispatchEscape(childTrigger);

  expect(secondEscape.defaultPrevented).toBe(true);
  expect(
    getInteractionFacadeStoreForEditor(current.editor).getState().snapshot.owners.menuOwner.target,
  ).toBeNull();
  await waitForCondition(
    () => current.ownerRoot.querySelector("[data-scaffold-interaction-bubble]") === null,
  );
  expect(childTrigger.isConnected).toBe(false);
  expect(current.editor.view.dom.isConnected).toBe(true);
  expect(current.ownerRoot.contains(current.editor.view.dom)).toBe(true);
  expect(document.activeElement).toBe(current.editor.view.dom);
  expect(document.activeElement).not.toBe(document.body);
}

interface StructuralBubbleHarnessOptions {
  beforeOpen?: (ownerRoot: HTMLElement) => void;
  collisionBoundaryWidth?: number;
  ownerWidth?: number;
  secondGrid?: boolean;
}

async function mountOpenStructuralBubble(
  options: StructuralBubbleHarnessOptions = {},
): Promise<BrowserHarness> {
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.inset = "0 auto auto 0";
  host.style.width = `${options.ownerWidth ?? 800}px`;
  host.style.height = "600px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.style.height = "600px";
  ownerRoot.style.position = "relative";
  ownerRoot.style.width = "100%";
  const editorElement = document.createElement("div");
  const reactElement = document.createElement("div");
  ownerRoot.append(editorElement, reactElement);
  host.append(ownerRoot);
  document.body.append(host);

  const editor = new Editor({
    element: editorElement,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestGridNode,
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "grid",
          attrs: { id: "grid-a" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Grid content" }] }],
        },
        ...(options.secondGrid
          ? [
              {
                type: "grid",
                attrs: { id: "grid-b" },
                content: [
                  { type: "paragraph", content: [{ type: "text", text: "Other content" }] },
                ],
              },
            ]
          : []),
      ],
    },
  });
  const firstGrid = requireElement<HTMLElement>(ownerRoot, '[data-id="grid-a"]');
  firstGrid.style.height = "80px";
  firstGrid.style.position = "absolute";
  firstGrid.style.left = "48px";
  firstGrid.style.top = "280px";
  firstGrid.style.width = "180px";
  const secondGrid = ownerRoot.querySelector<HTMLElement>('[data-id="grid-b"]');
  if (secondGrid) {
    secondGrid.style.height = "80px";
    secondGrid.style.position = "absolute";
    secondGrid.style.left = "360px";
    secondGrid.style.top = "360px";
    secondGrid.style.width = "180px";
  }
  const collisionBoundary =
    options.collisionBoundaryWidth === undefined ? null : document.createElement("div");
  if (collisionBoundary) {
    collisionBoundary.dataset.testCollisionBoundary = "";
    collisionBoundary.style.height = "560px";
    collisionBoundary.style.left = "16px";
    collisionBoundary.style.pointerEvents = "none";
    collisionBoundary.style.position = "absolute";
    collisionBoundary.style.top = "16px";
    collisionBoundary.style.width = `${options.collisionBoundaryWidth}px`;
    ownerRoot.append(collisionBoundary);
  }
  const renderers = createStructuralInteractionBubbleRendererMap([
    {
      kind: InteractionTargetKind.Grid,
      renderer: ({ descriptor }) => (
        <>
          <span data-test-structural-target={descriptor.id ?? ""} />
          <TestBubbleChildren />
        </>
      ),
    },
  ]);
  const reactRoot = createRoot(reactElement);
  const bubbleMenu = (
    <InteractionProvider store={getInteractionFacadeStoreForEditor(editor)}>
      <StructuralInteractionBubbleMenu
        alignmentTargetPort={alignmentTargetPort}
        editor={editor}
        pluginKey="browserNestedStructuralInteractionBubble"
        renderers={renderers}
      />
    </InteractionProvider>
  );
  reactRoot.render(
    collisionBoundary ? (
      <OverlayBoundary collisionBoundary={collisionBoundary} container={ownerRoot} kind="contained">
        {bubbleMenu}
      </OverlayBoundary>
    ) : (
      <AuthoringOverlayBoundary ownerRoot={ownerRoot}>{bubbleMenu}</AuthoringOverlayBoundary>
    ),
  );
  harness = { collisionBoundary, editor, host, ownerRoot, reactRoot };

  await waitForElement(ownerRoot, "[data-scaffold-overlay-host]");
  options.beforeOpen?.(ownerRoot);
  getInteractionFacadeStoreForEditor(editor).getState().commands.activateStructuralTarget({
    id: "grid-a",
    kind: InteractionTargetKind.Grid,
    pos: 0,
  });
  getInteractionFacadeStoreForEditor(editor).getState().commands.openMenu({
    id: "grid-a",
    kind: InteractionTargetKind.Grid,
    pos: 0,
  });
  await waitForElement(ownerRoot, "[data-scaffold-interaction-bubble]");

  return harness;
}

async function mountBlockPlacementHarness(
  beforeOpen: (ownerRoot: HTMLElement) => void,
): Promise<BrowserHarness> {
  const host = document.createElement("div");
  host.style.height = "600px";
  host.style.inset = "0 auto auto 0";
  host.style.position = "absolute";
  host.style.width = "800px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.style.height = "600px";
  ownerRoot.style.position = "relative";
  const editorElement = document.createElement("div");
  const reactElement = document.createElement("div");
  ownerRoot.append(editorElement, reactElement);
  host.append(ownerRoot);
  document.body.append(host);
  const editor = new Editor({
    element: editorElement,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestMovementBlockNode,
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
    ],
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Start" }] },
        { type: TEST_MOVEMENT_BLOCK, attrs: { id: "block-a" } },
        { type: TEST_MOVEMENT_BLOCK, attrs: { id: "block-b" } },
      ],
    },
  });
  const firstBlock = requireElement<HTMLElement>(ownerRoot, '[data-id="block-a"]');
  firstBlock.style.left = "48px";
  firstBlock.style.position = "absolute";
  firstBlock.style.top = "280px";
  const secondBlock = requireElement<HTMLElement>(ownerRoot, '[data-id="block-b"]');
  secondBlock.style.left = "360px";
  secondBlock.style.position = "absolute";
  secondBlock.style.top = "360px";
  editor.commands.setTextSelection(2);
  const reactRoot = createRoot(reactElement);
  reactRoot.render(
    <InteractionProvider store={getInteractionFacadeStoreForEditor(editor)}>
      <AuthoringOverlayBoundary ownerRoot={ownerRoot}>
        <BlockInteractionBubbleMenu
          alignmentTargetPort={alignmentTargetPort}
          blockDefinitions={testBlockRegistry}
          editor={editor}
          pluginKey="browserBlockPlacementBubble"
        />
      </AuthoringOverlayBoundary>
    </InteractionProvider>,
  );
  harness = {
    collisionBoundary: null,
    editor,
    host,
    ownerRoot,
    reactRoot,
  };

  await waitForElement(ownerRoot, "[data-scaffold-overlay-host]");
  beforeOpen(ownerRoot);
  editor.view.dom.focus({ preventScroll: true });
  editor.commands.setNodeSelection(nodePosById(editor, "block-a"));
  await waitForElement(ownerRoot, '[data-scaffold-bubble-placement-ready="true"]');
  return harness;
}

async function mountRichTextPlacementHarness(
  beforeOpen: (ownerRoot: HTMLElement) => void,
): Promise<BrowserHarness> {
  const host = document.createElement("div");
  host.style.height = "600px";
  host.style.inset = "0 auto auto 0";
  host.style.position = "absolute";
  host.style.width = "800px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  ownerRoot.style.height = "600px";
  ownerRoot.style.position = "relative";
  const editorElement = document.createElement("div");
  const reactElement = document.createElement("div");
  ownerRoot.append(editorElement, reactElement);
  host.append(ownerRoot);
  document.body.append(host);
  const editor = new Editor({
    element: editorElement,
    extensions: [StarterKit.configure({ undoRedo: false })],
    content: {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First target" }] },
        { type: "paragraph", content: [{ type: "text", text: "Second target" }] },
      ],
    },
  });
  const paragraphs = editor.view.dom.querySelectorAll<HTMLElement>("p");
  const firstParagraph = paragraphs[0];
  const secondParagraph = paragraphs[1];
  if (!firstParagraph || !secondParagraph) throw new Error("Expected rich-text targets.");
  firstParagraph.style.left = "48px";
  firstParagraph.style.position = "absolute";
  firstParagraph.style.top = "280px";
  firstParagraph.style.width = "180px";
  secondParagraph.style.left = "360px";
  secondParagraph.style.position = "absolute";
  secondParagraph.style.top = "360px";
  secondParagraph.style.width = "180px";
  const reactRoot = createRoot(reactElement);
  reactRoot.render(
    <AuthoringOverlayBoundary ownerRoot={ownerRoot}>
      <RichTextBubbleMenu editor={editor} pluginKey="browserRichTextPlacementBubble" />
    </AuthoringOverlayBoundary>,
  );
  harness = {
    collisionBoundary: null,
    editor,
    host,
    ownerRoot,
    reactRoot,
  };

  await waitForElement(ownerRoot, "[data-scaffold-overlay-host]");
  beforeOpen(ownerRoot);
  editor.view.dom.focus({ preventScroll: true });
  selectTextByValue(editor, "First target");
  await waitForElement(ownerRoot, '[data-scaffold-bubble-placement-ready="true"]');
  return harness;
}

async function mountMovementHarness(): Promise<MovementHarness> {
  const host = document.createElement("div");
  host.style.position = "absolute";
  host.style.inset = "0 auto auto 0";
  host.style.width = "800px";
  host.style.height = "600px";
  host.style.boxSizing = "border-box";
  host.style.paddingInline = "24px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  const editorElement = document.createElement("div");
  const reactElement = document.createElement("div");
  ownerRoot.append(editorElement, reactElement);
  host.append(ownerRoot);
  document.body.append(host);
  const editor = new Editor({
    element: editorElement,
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        paragraph: false,
        undoRedo: false,
      }),
      ExtendedParagraph,
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      GridAuthoringNode,
      CellAuthoringNode,
      LayoutAuthoringNode,
      SectionAuthoringNode,
      TestMovementBlockNode,
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "courseDocument",
          content: [
            {
              type: "surface",
              attrs: { id: "surface-a", variant: "page-default" },
              content: [{ type: TEST_MOVEMENT_BLOCK, attrs: { id: "movement-a" } }],
            },
          ],
        },
      ],
    },
  });
  editor.view.dom.style.paddingLeft = "20px";
  let movementPos = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== TEST_MOVEMENT_BLOCK) return true;
    movementPos = pos;
    return false;
  });
  if (movementPos < 0) throw new Error("Expected movement block position.");
  const rendered = await renderBrowserReact(
    <InteractionProvider store={getInteractionFacadeStoreForEditor(editor)}>
      <AuthoringOverlayBoundary container={host} ownerRoot={ownerRoot}>
        <EditorMovementLayer
          blockDefinitions={testBlockRegistry}
          editor={editor}
          surfaceVariants={builtInSurfaceVariantRegistry}
        >
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
      </AuthoringOverlayBoundary>
    </InteractionProvider>,
    { baseElement: host, container: reactElement },
  );
  editor.view.focus();
  editor.view.dispatch(
    editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, movementPos)),
  );

  return {
    editor,
    host,
    ownerRoot,
    rendered,
  };
}

function createBareGridEditor(): Omit<BrowserHarness, "reactRoot"> {
  const host = document.createElement("div");
  host.style.position = "relative";
  host.style.width = "400px";
  host.style.height = "240px";
  const ownerRoot = document.createElement("div");
  for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
    ownerRoot.setAttribute(name, value);
  }
  const editorElement = document.createElement("div");
  ownerRoot.append(editorElement);
  host.append(ownerRoot);
  document.body.append(host);
  const editor = new Editor({
    element: editorElement,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestGridNode,
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "grid",
          attrs: { id: "grid-a" },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Grid content" }] }],
        },
      ],
    },
  });
  return { collisionBoundary: null, editor, host, ownerRoot };
}

function nodePosById(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  if (found < 0) throw new Error(`Expected node position for ${id}.`);
  return found;
}

function selectTextByValue(editor: Editor, text: string): void {
  let from: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (from !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index < 0) return true;
    from = pos + index;
    return false;
  });
  if (from === null) throw new Error(`Expected text target ${text}.`);
  editor.commands.setTextSelection({ from, to: from + text.length });
}

interface BubblePlacementSample {
  interactive: boolean;
  left: number;
  ready: boolean;
  top: number;
  visible: boolean;
}

interface PlacementObserver {
  disconnect: () => void;
  samples: BubblePlacementSample[];
  violations: BubblePlacementSample[];
}

function requirePlacementObserver(observer: PlacementObserver | null): PlacementObserver {
  if (!observer) throw new Error("Expected a placement observer.");
  return observer;
}

function observeBubblePlacement(root: HTMLElement): PlacementObserver {
  const samples: BubblePlacementSample[] = [];
  const violations: BubblePlacementSample[] = [];
  const sample = () => {
    for (const floating of root.querySelectorAll<HTMLElement>(
      "[data-scaffold-bubble-placement-ready]",
    )) {
      const style = getComputedStyle(floating);
      const rect = floating.getBoundingClientRect();
      const next: BubblePlacementSample = {
        interactive: style.pointerEvents !== "none",
        left: rect.left,
        ready: floating.dataset.scaffoldBubblePlacementReady === "true",
        top: rect.top,
        visible: style.visibility !== "hidden" && style.opacity !== "0",
      };
      const previous = samples.at(-1);
      if (
        previous?.interactive === next.interactive &&
        previous.left === next.left &&
        previous.ready === next.ready &&
        previous.top === next.top &&
        previous.visible === next.visible
      ) {
        continue;
      }
      samples.push(next);
      if (!next.ready && (next.visible || next.interactive)) violations.push(next);
    }
  };
  const observer = new MutationObserver(sample);
  observer.observe(root, {
    attributes: true,
    attributeFilter: ["data-scaffold-bubble-placement-ready", "style"],
    childList: true,
    subtree: true,
  });
  sample();
  const disconnect = () => {
    observer.disconnect();
    placementObserverCleanups.delete(disconnect);
  };
  placementObserverCleanups.add(disconnect);

  return {
    disconnect,
    samples,
    violations,
  };
}

function appendStructuralTrigger(
  ownerRoot: HTMLElement,
  id: string,
  width: number,
  height: number,
): HTMLButtonElement {
  const trigger = document.createElement("button");
  trigger.setAttribute(
    AUTHORING_ANCHOR_ATTR,
    structuralMenuAnchorId(InteractionTargetKind.Grid, id) ?? "",
  );
  trigger.style.boxSizing = "border-box";
  trigger.style.height = `${height}px`;
  trigger.style.width = `${width}px`;
  ownerRoot.append(trigger);
  return trigger;
}

function TestBubbleChildren() {
  const [values, setValues] = useState<Record<string, unknown>>({
    backgroundColor: "#ffffff",
    size: "small",
  });
  const [radixValue, setRadixValue] = useState("one");

  return (
    <>
      <MenuControls
        controls={[
          {
            kind: "color",
            name: "backgroundColor",
            label: "Background colour",
          },
          {
            kind: "select",
            name: "size",
            label: "Block size",
            options: [
              { value: "small", label: "Small" },
              { value: "large", label: "Large" },
            ],
          },
        ]}
        value={values}
        onValueChange={(name, next) => {
          setValues((current) => ({ ...current, [name]: next }));
          return true;
        }}
      />
      <Select.Root value={radixValue} onValueChange={setRadixValue}>
        <Select.Trigger aria-label="Radix child" />
        <Select.Content>
          <Select.Item value="one">Radix option one</Select.Item>
          <Select.Item value="two">Radix option two</Select.Item>
        </Select.Content>
      </Select.Root>
    </>
  );
}

function dispatchEscape(target: Element): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key: "Escape",
  });
  target.dispatchEvent(event);
  return event;
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected element for ${selector}.`);
  return element;
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  await waitForCondition(() => root.querySelector(selector));
  return requireElement<T>(root, selector);
}

async function waitForCondition(condition: () => unknown): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for authoring overlay browser state.");
    }
    await nextAnimationFrame();
  }
  await nextAnimationFrame();
}

function nextAnimationFrame(): Promise<void> {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
