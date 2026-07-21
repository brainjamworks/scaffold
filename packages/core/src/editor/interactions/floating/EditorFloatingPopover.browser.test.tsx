import { Editor, mergeAttributes, Node } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import {
  EditorContent,
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vite-plus/test";

import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
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
import { createTiptapResizableReactNodeView } from "@/editor/frame/authoring/tiptap-resizable-react-node-view";
import { courseBlockAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import { authoringInteractionRootAttributes } from "@/editor/interactions/dom/authoring-root";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { zIndex } from "@/ui/overlays/z-index";
import "@/styles/globals.css";

import { AuthoringOverlayBoundary } from "./AuthoringOverlayBoundary";
import { EditorFloatingPopover } from "./EditorFloatingPopover";

const TEST_BLOCK = "browser_editor_floating_popover_resizable_block";

const testBlockRegistry = createBlockRegistry([
  defineBlock({
    nodeType: TEST_BLOCK,
    frame: { resizable: true, resizeMode: "responsive" },
  }),
]);

function ResizablePopoverBlock(props: ReactNodeViewProps) {
  return (
    <NodeViewWrapper
      {...courseBlockAuthoringFrameAttributes({
        blockId: props.node.attrs["id"],
        nodeType: props.node.type.name,
      })}
      data-test-resizable-popover-block=""
      style={{ position: "relative" }}
    >
      <NodeViewContent />
      <EditorFloatingPopover.Root open>
        <EditorFloatingPopover.Trigger asChild>
          <button
            type="button"
            contentEditable={false}
            style={{ left: 260, position: "absolute", top: 72 }}
          >
            Feedback
          </button>
        </EditorFloatingPopover.Trigger>
        <EditorFloatingPopover.Portal>
          <EditorFloatingPopover.Content
            aria-label="Feedback surface"
            align="start"
            onOpenAutoFocus={(event) => event.preventDefault()}
            side="bottom"
            sideOffset={4}
            style={{
              background: "var(--color-background)",
              height: 120,
              width: 240,
            }}
          >
            Feedback controls
          </EditorFloatingPopover.Content>
        </EditorFloatingPopover.Portal>
      </EditorFloatingPopover.Root>
    </NodeViewWrapper>
  );
}

const ResizablePopoverBlockNode = Node.create({
  name: TEST_BLOCK,
  group: "block",
  content: "paragraph",
  selectable: true,

  addAttributes() {
    return {
      frame: { default: null },
      id: { default: "resizable-popover-block" },
    };
  },

  parseHTML() {
    return [{ tag: `div[data-node="${TEST_BLOCK}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-node": TEST_BLOCK }), 0];
  },

  addNodeView() {
    return createTiptapResizableReactNodeView(ResizablePopoverBlock, {
      blockDefinitions: testBlockRegistry,
      frame: {
        resizable: true,
        resizeMode: "responsive",
      },
    });
  },
});

describe("EditorFloatingPopover browser stacking", () => {
  it("stacks an authoring popover above the active resize frame it crosses", async () => {
    const host = document.createElement("div");
    host.style.cssText = "height: 480px; position: relative; width: 720px;";
    const ownerRoot = document.createElement("div");
    for (const [name, value] of Object.entries(authoringInteractionRootAttributes())) {
      ownerRoot.setAttribute(name, value);
    }
    ownerRoot.style.cssText = "height: 480px; position: relative; width: 720px;";
    const reactElement = document.createElement("div");
    ownerRoot.append(reactElement);
    host.append(ownerRoot);
    document.body.append(host);

    const editor = new Editor({
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
        ResizablePopoverBlockNode,
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
                content: [
                  {
                    type: TEST_BLOCK,
                    attrs: { id: "resizable-popover-block" },
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Resizable content" }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const reactRoot = createRoot(reactElement);

    try {
      flushSync(() => {
        reactRoot.render(
          <AuthoringOverlayBoundary ownerRoot={ownerRoot}>
            <EditorContent editor={editor} />
          </AuthoringOverlayBoundary>,
        );
      });

      await waitForElement(ownerRoot, "[data-test-resizable-popover-block]");
      const resizeWrapper = await waitForElement<HTMLElement>(
        ownerRoot,
        "[data-authoring-frame-wrapper]",
      );
      editor.view.focus();
      editor.view.dispatch(
        editor.state.tr.setSelection(
          NodeSelection.create(editor.state.doc, nodePosById(editor, "resizable-popover-block")),
        ),
      );

      const frame = await waitForElement<HTMLElement>(
        ownerRoot,
        "[data-authoring-frame-wrapper-active]",
      );
      frame.style.height = "220px";
      resizeWrapper.style.maxWidth = "360px";
      resizeWrapper.style.width = "360px";
      await waitForCondition(() => {
        const frameRect = frame.getBoundingClientRect();
        return Math.abs(frameRect.height - 220) <= 1 && Math.abs(frameRect.width - 360) <= 1;
      });
      const popover = await waitForElement<HTMLElement>(
        ownerRoot,
        '[role="dialog"][aria-label="Feedback surface"]',
      );
      await waitForCondition(() => getComputedStyle(popover).visibility === "visible");
      const popperWrapper = popover.closest<HTMLElement>("[data-radix-popper-content-wrapper]");
      if (!popperWrapper) throw new Error("Expected the authoring Popper wrapper.");
      const frameRect = frame.getBoundingClientRect();
      const popoverRect = popover.getBoundingClientRect();

      expect(popoverRect.left).toBeLessThan(frameRect.right);
      expect(popoverRect.right).toBeGreaterThan(frameRect.right);
      expect(popoverRect.top).toBeLessThan(frameRect.bottom);
      expect(popoverRect.bottom).toBeGreaterThan(frameRect.top);
      expect(getComputedStyle(frame, "::after").zIndex).toBe("1");
      expect(getComputedStyle(popover).zIndex).toBe(String(zIndex.popover));
      expect(getComputedStyle(popperWrapper).zIndex).toBe(String(zIndex.popover));
    } finally {
      reactRoot.unmount();
      editor.destroy();
      host.remove();
    }
  });
});

function nodePosById(editor: Editor, id: string): number {
  let result = -1;
  editor.state.doc.descendants((node, pos) => {
    if (node.attrs["id"] !== id) return true;
    result = pos;
    return false;
  });
  if (result < 0) throw new Error(`Expected node ${id}.`);
  return result;
}

async function waitForElement<T extends Element = Element>(
  root: ParentNode,
  selector: string,
): Promise<T> {
  await waitForCondition(() => root.querySelector(selector) !== null);
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Expected ${selector}.`);
  return element;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error("Timed out waiting for EditorFloatingPopover browser state.");
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}
