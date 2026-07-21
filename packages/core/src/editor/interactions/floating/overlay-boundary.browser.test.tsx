import { PlusIcon } from "@phosphor-icons/react";
import { Editor, Node } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMemo, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import * as Dialog from "@/ui/components/Dialog/Dialog";
import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import {
  authoringFrameAttributes,
  AuthoringFrameKind,
} from "@/editor/interactions/dom/authoring-frame";
import { EditorFloatingPopover } from "@/editor/interactions/floating/EditorFloatingPopover";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { AuthoringOverlayBoundary } from "@/editor/interactions/floating/AuthoringOverlayBoundary";
import { FloatingAuthoringChrome } from "@/editor/shell/authoring/floating/FloatingAuthoringChrome";
import type { FloatingControl } from "@/editor/shell/authoring/floating/floating-control";
import { EditorMovementLayer } from "@/editor/drag/view/EditorMovementLayer";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { createStructuralInteractionBubbleRendererMap } from "@/editor/interactions/interaction-bubble";
import { StructuralInteractionBubbleMenu } from "@/editor/shell/bubbles/interaction/StructuralInteractionBubbleMenu";
import { createSlashCommand } from "@/editor/suggestions/slash/SlashCommand";
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
    return [{ tag: "section[data-test-overlay-contract-grid]" }];
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
        "data-test-overlay-contract-grid": "",
      },
      0,
    ];
  },
});

const contractFloatingControl: FloatingControl = {
  className: "sc-floating-control-trigger",
  dataAttributes: { "data-test-direct-floating-control": "" },
  icon: PlusIcon,
  label: "Direct floating control",
  open: () => true,
  placement: "middle-right",
  resolveState: (editor) => {
    const pos = findNodePosById(editor, "grid-a");
    return pos === null
      ? null
      : {
          anchorId: null,
          key: "contract-direct-floating-control",
          pos,
          target: { id: "grid-a", kind: InteractionTargetKind.Grid, pos },
        };
  },
};

const slashParagraphItem: InsertAction = {
  category: "content",
  content: () => ({ type: "paragraph" }),
  description: "Insert a paragraph from the browser contract.",
  icon: PlusIcon,
  id: "contract-paragraph",
  nodeType: "paragraph",
  title: "Contract paragraph",
};

interface AuthoringHarness {
  editor: Editor;
  grid: HTMLElement;
  host: HTMLElement;
  ownerRoot: HTMLElement;
  overlayHost: HTMLElement;
  reactRoot: Root;
  scrollContent: HTMLElement;
}

interface MountOptions {
  beforeOpen?: (host: HTMLElement) => void;
  height?: number;
  left?: number;
  reducedMotion?: boolean;
  secondGrid?: boolean;
  width?: number;
}

interface PlacementSample {
  interactive: boolean;
  ready: boolean;
  visible: boolean;
}

interface PlacementObserver {
  disconnect: () => void;
  samples: PlacementSample[];
  violations: PlacementSample[];
}

const harnesses: AuthoringHarness[] = [];
const observerCleanups = new Set<() => void>();
let restoreMediaPreference: (() => void) | null = null;

afterEach(() => {
  for (const disconnect of observerCleanups) disconnect();
  observerCleanups.clear();
  while (harnesses.length > 0) {
    const harness = harnesses.pop();
    harness?.reactRoot.unmount();
    harness?.editor.destroy();
    harness?.host.remove();
  }
  restoreMediaPreference?.();
  restoreMediaPreference = null;
});

describe("authoring overlay boundary contract", () => {
  it("keeps a real Tiptap BubbleMenu and nested Radix child in one owned host", async () => {
    const current = await mountAuthoringHarness();
    const bubble = await waitForElement<HTMLElement>(
      current.overlayHost,
      "[data-scaffold-interaction-bubble]",
    );
    const childTrigger = uniqueElement<HTMLButtonElement>(bubble, '[aria-label="Nested controls"]');

    childTrigger.click();
    const child = await waitForElement<HTMLElement>(
      current.overlayHost,
      '[role="dialog"][aria-label="Nested controls"]',
    );
    const childAction = uniqueElement<HTMLButtonElement>(child, "button");

    expect(current.overlayHost.contains(bubble)).toBe(true);
    expect(current.overlayHost.contains(child)).toBe(true);
    expect(current.host.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);

    const firstEscape = dispatchEscape(childAction);
    expect(firstEscape.defaultPrevented).toBe(true);
    await waitForCondition(() => !child.isConnected);
    expect(bubble.isConnected).toBe(true);
    expect(document.activeElement).toBe(childTrigger);

    const secondEscape = dispatchEscape(childTrigger);
    expect(secondEscape.defaultPrevented).toBe(true);
    await waitForCondition(() => !bubble.isConnected);
    expect(document.activeElement).toBe(current.editor.view.dom);
  });

  it("contains wide and edge placement without exposing a measuring frame", async () => {
    await page.viewport(1120, 760);
    let placementObserver: PlacementObserver | null = null;
    const current = await mountAuthoringHarness({
      beforeOpen: (host) => {
        placementObserver = observeBubblePlacement(host);
      },
      height: 560,
      width: 800,
    });
    const observer = requirePlacementObserver(placementObserver);
    let floating = await waitForElement<HTMLElement>(
      current.overlayHost,
      '[data-scaffold-bubble-placement-ready="true"]',
    );

    expect(observer.samples.some((sample) => !sample.ready)).toBe(true);
    expect(observer.violations).toEqual([]);
    expectContained(floating, current.ownerRoot);

    const positions = [
      { left: 0, top: 220 },
      { left: 620, top: 220 },
      { left: 310, top: 0 },
      { left: 310, top: 480 },
    ];
    for (const position of positions) {
      getInteractionFacadeStoreForEditor(current.editor).getState().commands.dismissInteraction();
      await waitForCondition(
        () => current.overlayHost.querySelector("[data-scaffold-interaction-bubble]") === null,
      );
      current.grid.style.left = `${position.left}px`;
      current.grid.style.top = `${position.top}px`;
      const sampleCount = observer.samples.length;
      openStructuralTarget(current.editor, "grid-a");
      current.grid.style.left = `${position.left}px`;
      current.grid.style.top = `${position.top}px`;
      updateStructuralBubblePosition(current.editor);
      floating = await waitForElement<HTMLElement>(
        current.overlayHost,
        '[data-scaffold-bubble-placement-ready="true"]',
      );
      await waitForCondition(() => observer.samples.length > sampleCount);
      expectContained(floating, current.ownerRoot);
      expect(observer.samples.slice(sampleCount).some((sample) => !sample.ready)).toBe(true);
      expect(observer.violations).toEqual([]);
    }

    observer.disconnect();
  });

  it("keeps narrow actions on one internally scrolling row and reveals keyboard focus", async () => {
    await page.viewport(420, 760);
    const current = await mountAuthoringHarness({ width: 280 });
    const toolbar = await waitForElement<HTMLElement>(
      current.overlayHost,
      "[data-scaffold-interaction-bubble]",
    );
    const frame = uniqueElement<HTMLElement>(
      current.overlayHost,
      "[data-scaffold-bubble-toolbar-frame]",
    );
    await waitForCondition(() => toolbar.scrollWidth > toolbar.clientWidth);

    const buttons = Array.from(
      toolbar.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    );
    const first = buttons[0];
    const second = buttons[1];
    const last = buttons.at(-1);
    if (!first || !second || !last) throw new Error("Expected narrow toolbar controls.");
    const rowTop = first.getBoundingClientRect().top;
    expect(
      buttons.every((button) => Math.abs(button.getBoundingClientRect().top - rowTop) <= 1),
    ).toBe(true);
    expect(toolbar.scrollWidth).toBeGreaterThan(toolbar.clientWidth);
    expect(frame.getBoundingClientRect().width).toBeLessThanOrEqual(
      current.ownerRoot.getBoundingClientRect().width,
    );

    const ancestorScroll = captureAncestorScroll(current);
    first.focus({ preventScroll: true });
    dispatchKey(first, "ArrowRight");
    expect(document.activeElement).toBe(second);
    dispatchKey(second, "End");
    await waitForCondition(() => document.activeElement === last && toolbar.scrollLeft > 0);
    expectControlVisible(toolbar, last);
    dispatchKey(last, "Home");
    await waitForCondition(() => document.activeElement === first && toolbar.scrollLeft === 0);
    expectControlVisible(toolbar, first);
    expect(captureAncestorScroll(current)).toEqual(ancestorScroll);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
  });

  it("keeps modal focus contained while a non-modal child permits background interaction", async () => {
    const current = await mountAuthoringHarness();
    const bubble = await waitForElement<HTMLElement>(
      current.overlayHost,
      "[data-scaffold-interaction-bubble]",
    );
    const backgroundAction = uniqueElement<HTMLButtonElement>(
      bubble,
      '[aria-label="Bubble background action"]',
    );
    const popoverTrigger = uniqueElement<HTMLButtonElement>(
      bubble,
      '[aria-label="Nested controls"]',
    );
    popoverTrigger.click();
    const popover = await waitForElement<HTMLElement>(
      current.overlayHost,
      '[role="dialog"][aria-label="Nested controls"]',
    );
    const popoverAction = uniqueElement<HTMLButtonElement>(popover, "button");
    popoverAction.focus({ preventScroll: true });
    expect(document.activeElement).toBe(popoverAction);
    expect(getComputedStyle(popoverAction).outlineStyle).not.toBe("none");

    backgroundAction.focus();
    await waitForCondition(() => !popover.isConnected);
    expect(document.activeElement).toBe(backgroundAction);
    expect(bubble.isConnected).toBe(true);

    const modalTrigger = uniqueElement<HTMLButtonElement>(bubble, '[aria-label="Modal controls"]');
    modalTrigger.click();
    const modal = await waitForElement<HTMLElement>(
      current.overlayHost,
      '[role="dialog"][aria-label="Modal controls"]',
    );
    const modalAction = uniqueElement<HTMLButtonElement>(modal, "button");
    modalAction.focus({ preventScroll: true });
    expect(document.activeElement).toBe(modalAction);
    expect(getComputedStyle(modalAction).outlineStyle).not.toBe("none");
    expect(getComputedStyle(current.editor.view.dom).pointerEvents).toBe("none");

    await userEvent.tab();
    expect(modal.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(modalAction);
    const escape = dispatchEscape(modalAction);
    expect(escape.defaultPrevented).toBe(true);
    await waitForCondition(() => !modal.isConnected);
    expect(document.activeElement).toBe(modalTrigger);
    expect(bubble.isConnected).toBe(true);
  });

  it("tracks scroll and resize, then removes its target without an orphan", async () => {
    await page.viewport(720, 620);
    const current = await mountAuthoringHarness({
      height: 340,
      reducedMotion: true,
      secondGrid: true,
      width: 620,
    });
    current.ownerRoot.style.height = "340px";
    current.ownerRoot.style.overflow = "auto";
    current.scrollContent.style.height = "760px";
    let floating = await waitForElement<HTMLElement>(
      current.overlayHost,
      '[data-scaffold-bubble-placement-ready="true"]',
    );
    const beforeTarget = current.grid.getBoundingClientRect();
    const beforeFloating = floating.getBoundingClientRect();
    const beforeScroll = current.ownerRoot.scrollTop;

    current.ownerRoot.scrollTop = beforeScroll + 80;
    current.ownerRoot.dispatchEvent(new Event("scroll"));
    const scrollDelta = current.ownerRoot.scrollTop - beforeScroll;
    expect(getComputedStyle(current.ownerRoot).overflow).toBe("auto");
    expect(current.ownerRoot.scrollHeight).toBeGreaterThan(current.ownerRoot.clientHeight);
    expect(scrollDelta).toBe(80);
    await nextAnimationFrame();
    await nextAnimationFrame();
    await waitForCondition(
      () => current.grid.getBoundingClientRect().top < beforeTarget.top - scrollDelta / 2,
    );
    const scrolledTarget = current.grid.getBoundingClientRect();
    const scrolledFloating = floating.getBoundingClientRect();
    expect(Math.abs(scrolledFloating.top - beforeFloating.top)).toBeGreaterThan(40);
    expect(
      Math.abs(
        scrolledFloating.bottom - scrolledTarget.top - (beforeFloating.bottom - beforeTarget.top),
      ),
    ).toBeLessThanOrEqual(16);

    current.ownerRoot.scrollTop = 0;
    current.ownerRoot.dispatchEvent(new Event("scroll"));
    await waitForCondition(
      () => current.grid.getBoundingClientRect().top > scrolledTarget.top + 40,
    );
    current.host.style.width = "360px";
    current.ownerRoot.style.width = "360px";
    current.scrollContent.style.width = "360px";
    current.grid.style.left = "88px";
    window.dispatchEvent(new Event("resize"));
    updateStructuralBubblePosition(current.editor);
    await waitForCondition(() => {
      floating = uniqueElement<HTMLElement>(
        current.overlayHost,
        '[data-scaffold-bubble-placement-ready="true"]',
      );
      const available = Number.parseFloat(
        floating.style.getPropertyValue("--sc-overlay-available-inline-size"),
      );
      return (
        Number.isFinite(available) && available <= 360 && isContained(floating, current.ownerRoot)
      );
    });
    expectContained(floating, current.ownerRoot);

    current.editor.view.dom.focus({ preventScroll: true });
    removeNodeById(current.editor, "grid-a");
    await waitForCondition(
      () => current.overlayHost.querySelector("[data-scaffold-interaction-bubble]") === null,
    );
    expect(current.ownerRoot.querySelector('[data-id="grid-a"]')).toBeNull();
    expect(document.activeElement).toBe(current.editor.view.dom);

    current.host.style.width = "280px";
    current.ownerRoot.style.width = "280px";
    const secondGrid = uniqueElement<HTMLElement>(current.ownerRoot, '[data-id="grid-b"]');
    secondGrid.style.left = "40px";
    secondGrid.style.top = "180px";
    window.dispatchEvent(new Event("resize"));
    openStructuralTarget(current.editor, "grid-b");
    const narrowBubble = await waitForElement<HTMLElement>(
      current.overlayHost,
      "[data-scaffold-interaction-bubble]",
    );
    expect(window.matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    const escape = dispatchEscape(narrowBubble.querySelector("button") ?? narrowBubble);
    expect(escape.defaultPrevented).toBe(true);
    await waitForCondition(() => !narrowBubble.isConnected);
    expect(document.activeElement).toBe(current.editor.view.dom);
  });

  it("isolates two editors and keeps every engine below its nearest physical host", async () => {
    await page.viewport(1280, 760);
    const first = await mountAuthoringHarness({ left: 0, width: 560 });
    first.editor.view.dom.focus({ preventScroll: true });
    first.editor.view.dispatch(first.editor.state.tr.setMeta("contract-floating-render", true));
    const direct = await waitForElement<HTMLElement>(
      first.overlayHost,
      '[data-test-direct-floating-control=""]',
    );
    expect(direct.closest(".sc-editor-floating-content")).not.toBeNull();
    const second = await mountAuthoringHarness({ left: 620, width: 560 });
    const firstBubble = await waitForElement<HTMLElement>(
      first.overlayHost,
      "[data-scaffold-interaction-bubble]",
    );
    const secondBubble = await waitForElement<HTMLElement>(
      second.overlayHost,
      "[data-scaffold-interaction-bubble]",
    );

    expect(first.overlayHost).not.toBe(second.overlayHost);
    expect(first.host.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
    expect(second.host.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
    expect(first.overlayHost.querySelectorAll("[data-scaffold-editor-floating-layer]").length).toBe(
      2,
    );
    expect(first.overlayHost.querySelector(".sc-editor-movement-layer")).not.toBeNull();

    const childTrigger = uniqueElement<HTMLButtonElement>(
      firstBubble,
      '[aria-label="Nested controls"]',
    );
    childTrigger.click();
    const child = await waitForElement<HTMLElement>(
      first.overlayHost,
      '[role="dialog"][aria-label="Nested controls"]',
    );
    child.dispatchEvent(new PointerEvent("pointermove", { bubbles: true }));
    expect(secondBubble.isConnected).toBe(true);
    dispatchEscape(uniqueElement(child, "button"));
    await waitForCondition(() => !child.isConnected);
    expect(secondBubble.isConnected).toBe(true);
    dispatchEscape(childTrigger);
    await waitForCondition(() => !firstBubble.isConnected);
    expect(secondBubble.isConnected).toBe(true);

    first.editor.commands.focus("end");
    first.editor.commands.insertContent("/");
    const slashMenu = await waitForElement<HTMLElement>(
      first.overlayHost,
      '[role="listbox"][aria-label="Insert block"]',
    );
    expect(first.overlayHost.contains(slashMenu)).toBe(true);
    expect(second.overlayHost.contains(slashMenu)).toBe(false);
    expect(first.host.querySelectorAll("[data-scaffold-overlay-host]")).toHaveLength(1);
  });
});

function ContractBubbleControls() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button type="button" aria-label="First action">
        First
      </button>
      {Array.from({ length: 8 }, (_, index) => (
        <button key={index} type="button" aria-label={`Action ${index + 2}`}>
          Action {index + 2}
        </button>
      ))}
      <EditorFloatingPopover.Root>
        <EditorFloatingPopover.Trigger asChild>
          <button type="button" aria-label="Nested controls">
            Nested controls
          </button>
        </EditorFloatingPopover.Trigger>
        <EditorFloatingPopover.Portal>
          <EditorFloatingPopover.Content
            aria-label="Nested controls"
            style={{ background: "white", padding: 12 }}
          >
            <button autoFocus type="button" style={{ outline: "2px solid currentColor" }}>
              Nested action
            </button>
          </EditorFloatingPopover.Content>
        </EditorFloatingPopover.Portal>
      </EditorFloatingPopover.Root>
      <button type="button" aria-label="Bubble background action">
        Background action
      </button>
      <Dialog.Root open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog.Trigger asChild>
          <button type="button" aria-label="Modal controls">
            Modal controls
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay style={{ inset: 0, position: "absolute" }} />
          <Dialog.Content
            aria-label="Modal controls"
            style={{ background: "white", left: 80, padding: 16, position: "absolute", top: 80 }}
          >
            <Dialog.Title>Modal controls</Dialog.Title>
            <Dialog.Description>Contained modal interaction.</Dialog.Description>
            <button autoFocus type="button" style={{ outline: "2px solid currentColor" }}>
              Modal action
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <button type="button" aria-label="Last action">
        Last
      </button>
    </>
  );
}

function TestAuthoringChrome({
  children,
  editor,
  overlayContainer,
}: {
  children: ReactNode;
  editor: Editor;
  overlayContainer: Element;
}) {
  const [ownerRoot, setOwnerRoot] = useState<HTMLDivElement | null>(null);
  const alignmentTargetPort = useMemo(
    () =>
      createAlignmentTargetPort({
        blockDefinitions: builtInBlockRegistry,
        surfaceVariants: builtInSurfaceVariantRegistry,
      }),
    [],
  );
  const renderers = useMemo(
    () =>
      createStructuralInteractionBubbleRendererMap([
        {
          kind: InteractionTargetKind.Grid,
          renderer: () => <ContractBubbleControls />,
        },
      ]),
    [],
  );

  return (
    <InteractionProvider store={getInteractionFacadeStoreForEditor(editor)}>
      <AuthoringOverlayBoundary ownerRoot={ownerRoot} container={overlayContainer}>
        <div
          ref={setOwnerRoot}
          className="sc-authoring-chrome-root"
          {...authoringInteractionRootAttributes()}
        >
          <EditorMovementLayer
            blockDefinitions={builtInBlockRegistry}
            editor={editor}
            surfaceVariants={builtInSurfaceVariantRegistry}
          >
            {children}
          </EditorMovementLayer>
          <FloatingAuthoringChrome controls={[contractFloatingControl]} editor={editor} />
          <StructuralInteractionBubbleMenu
            alignmentTargetPort={alignmentTargetPort}
            editor={editor}
            pluginKey="testOverlayBoundaryStructuralBubble"
            renderers={renderers}
          />
        </div>
      </AuthoringOverlayBoundary>
    </InteractionProvider>
  );
}

async function mountAuthoringHarness(options: MountOptions = {}): Promise<AuthoringHarness> {
  if (options.reducedMotion) {
    if (restoreMediaPreference) throw new Error("Reduced-motion preference already installed.");
    restoreMediaPreference = emulateReducedMotionPreference();
  }
  const width = options.width ?? 720;
  const height = options.height ?? 600;
  const host = document.createElement("div");
  host.style.cssText = [
    `height: ${height}px`,
    `left: ${options.left ?? 0}px`,
    "overflow: hidden",
    "position: absolute",
    "top: 0",
    `width: ${width}px`,
  ].join(";");
  const reactElement = document.createElement("div");
  host.append(reactElement);
  document.body.append(host);

  const editor = new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestGridNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
      createSlashCommand({
        items: [slashParagraphItem],
        surfaceVariants: builtInSurfaceVariantRegistry,
      }),
    ],
    content: {
      type: "doc",
      content: [
        gridContent("grid-a", "Grid content"),
        ...(options.secondGrid ? [gridContent("grid-b", "Other content")] : []),
      ],
    },
  });
  const reactRoot = createRoot(reactElement);
  reactRoot.render(
    <TestAuthoringChrome editor={editor} overlayContainer={host}>
      <div data-test-authoring-scroll-content="">
        <EditorContent editor={editor} />
      </div>
    </TestAuthoringChrome>,
  );

  try {
    const ownerRoot = await waitForElement<HTMLElement>(host, "[data-authoring-interaction-root]");
    ownerRoot.style.cssText = `height: ${height}px; position: relative; width: ${width}px;`;
    const scrollContent = uniqueElement<HTMLElement>(
      ownerRoot,
      '[data-test-authoring-scroll-content=""]',
    );
    scrollContent.style.cssText = `height: ${height}px; position: relative; width: ${width}px;`;
    const overlayHost = await waitForElement<HTMLElement>(host, "[data-scaffold-overlay-host]");
    const grid = uniqueElement<HTMLElement>(ownerRoot, '[data-id="grid-a"]');
    positionGrid(grid, 240, 280);
    const secondGrid = ownerRoot.querySelector<HTMLElement>('[data-id="grid-b"]');
    if (secondGrid) positionGrid(secondGrid, 360, 480);
    options.beforeOpen?.(host);
    openStructuralTarget(editor, "grid-a");
    await waitForElement(overlayHost, "[data-scaffold-interaction-bubble]");
    const liveGrid = uniqueElement<HTMLElement>(ownerRoot, '[data-id="grid-a"]');
    positionGrid(liveGrid, 240, 280);
    updateStructuralBubblePosition(editor);

    const harness: AuthoringHarness = {
      editor,
      get grid() {
        return uniqueElement<HTMLElement>(ownerRoot, '[data-id="grid-a"]');
      },
      host,
      ownerRoot,
      overlayHost,
      reactRoot,
      scrollContent,
    };
    harnesses.push(harness);
    return harness;
  } catch (error) {
    reactRoot.unmount();
    editor.destroy();
    host.remove();
    throw error;
  }
}

function gridContent(id: string, text: string) {
  return {
    type: "grid",
    attrs: { id },
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function openStructuralTarget(editor: Editor, id: string): void {
  const target = {
    id,
    kind: InteractionTargetKind.Grid,
    pos: nodePosById(editor, id),
  };
  const commands = getInteractionFacadeStoreForEditor(editor).getState().commands;
  commands.activateStructuralTarget(target);
  commands.openMenu(target);
}

function updateStructuralBubblePosition(editor: Editor): void {
  editor.view.dispatch(
    editor.state.tr.setMeta("scaffoldStructuralInteractionBubbleMenu", "updatePosition"),
  );
}

function removeNodeById(editor: Editor, id: string): void {
  const pos = nodePosById(editor, id);
  const node = editor.state.doc.nodeAt(pos);
  if (!node) throw new Error(`Expected node ${id}.`);
  editor.commands.deleteRange({ from: pos, to: pos + node.nodeSize });
}

function nodePosById(editor: Editor, id: string): number {
  const found = findNodePosById(editor, id);
  if (found === null) throw new Error(`Expected node position for ${id}.`);
  return found;
}

function findNodePosById(editor: Editor, id: string): number | null {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    found = pos;
    return false;
  });
  return found < 0 ? null : found;
}

function positionGrid(grid: HTMLElement, left: number, top: number): void {
  grid.style.cssText = [
    "height: 80px",
    `left: ${left}px`,
    "position: absolute",
    `top: ${top}px`,
    "width: 180px",
  ].join(";");
}

function expectContained(element: HTMLElement, boundary: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const boundaryRect = boundary.getBoundingClientRect();
  expect(rect.left).toBeGreaterThanOrEqual(boundaryRect.left - 1);
  expect(rect.right).toBeLessThanOrEqual(boundaryRect.right + 1);
  expect(rect.top).toBeGreaterThanOrEqual(boundaryRect.top - 1);
  expect(rect.bottom).toBeLessThanOrEqual(boundaryRect.bottom + 1);
}

function isContained(element: HTMLElement, boundary: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const boundaryRect = boundary.getBoundingClientRect();
  return (
    rect.left >= boundaryRect.left - 1 &&
    rect.right <= boundaryRect.right + 1 &&
    rect.top >= boundaryRect.top - 1 &&
    rect.bottom <= boundaryRect.bottom + 1
  );
}

function expectControlVisible(toolbar: HTMLElement, control: HTMLElement): void {
  const toolbarRect = toolbar.getBoundingClientRect();
  const controlRect = control.getBoundingClientRect();
  expect(controlRect.left).toBeGreaterThanOrEqual(toolbarRect.left - 1);
  expect(controlRect.right).toBeLessThanOrEqual(toolbarRect.right + 1);
}

function captureAncestorScroll(current: AuthoringHarness) {
  return {
    body: document.body.scrollLeft,
    document: document.documentElement.scrollLeft,
    editor: current.editor.view.dom.scrollLeft,
    host: current.host.scrollLeft,
    owner: current.ownerRoot.scrollLeft,
    window: window.scrollX,
  };
}

function observeBubblePlacement(root: HTMLElement): PlacementObserver {
  const samples: PlacementSample[] = [];
  const violations: PlacementSample[] = [];
  const sample = () => {
    for (const floating of root.querySelectorAll<HTMLElement>(
      "[data-scaffold-bubble-placement-ready]",
    )) {
      const style = getComputedStyle(floating);
      const next = {
        interactive: style.pointerEvents !== "none",
        ready: floating.dataset.scaffoldBubblePlacementReady === "true",
        visible: style.visibility !== "hidden" && style.opacity !== "0",
      };
      const previous = samples.at(-1);
      if (
        previous?.interactive === next.interactive &&
        previous.ready === next.ready &&
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
    observerCleanups.delete(disconnect);
  };
  observerCleanups.add(disconnect);
  return { disconnect, samples, violations };
}

function requirePlacementObserver(observer: PlacementObserver | null): PlacementObserver {
  if (!observer) throw new Error("Expected placement observations.");
  return observer;
}

function emulateReducedMotionPreference(): () => void {
  const original = window.matchMedia.bind(window);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string): MediaQueryList => {
      const native = original(query);
      if (query !== "(prefers-reduced-motion: reduce)") return native;
      return new Proxy(native, {
        get(target, property) {
          if (property === "matches") return true;
          if (property === "media") return query;
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  });
  return () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: original,
    });
  };
}

function dispatchEscape(target: Element): KeyboardEvent {
  return dispatchKey(target, "Escape");
}

function dispatchKey(target: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
  });
  target.dispatchEvent(event);
  return event;
}

function uniqueElement<T extends Element>(root: ParentNode, selector: string): T {
  const matches = root.querySelectorAll<T>(selector);
  if (matches.length !== 1 || !matches[0]) {
    throw new Error(`Expected one element for ${selector}, found ${matches.length}.`);
  }
  return matches[0];
}

async function waitForElement<T extends Element>(root: ParentNode, selector: string): Promise<T> {
  await waitForCondition(() => root.querySelector(selector) !== null);
  return uniqueElement<T>(root, selector);
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for authoring boundary browser state.");
    }
    await nextAnimationFrame();
  }
  await nextAnimationFrame();
}

function nextAnimationFrame(): Promise<void> {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
