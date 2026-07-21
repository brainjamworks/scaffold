// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { z } from "zod";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { RESIZE_GESTURE_ACTIVE_ATTR } from "@/editor/interactions/gesture/editor-resize-gesture";
import { courseBlockAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import {
  createInteractionChromeSlot,
  createInteractionOwnerSnapshot,
  InteractionChromeSlotReason,
  InteractionTargetKind,
  type InteractionOwnerSnapshot,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { InteractionProvider } from "@/editor/interactions/targets/facade/interaction-provider";
import {
  createInteractionStore,
  type InteractionStore,
} from "@/editor/interactions/targets/facade/interaction-store";
import {
  resolveBlockChromeTargetDescriptor,
  type BlockChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";
import { defineConfiguration } from "@/editor/configuration/definition";
import { createDisposableEditor } from "@/editor/testing";
import { createAlignmentTargetPort } from "@/editor/interactions/alignment/alignment-target";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import {
  BlockInteractionBubbleMenu,
  BlockInteractionBubbleMenuContent,
  resolveBlockBubbleAnchorVirtualElement,
  resolveBlockInteractionBubbleModel,
} from "./BlockInteractionBubbleMenu";

const QUICK = "v2_bubble_quick_block";
const RESIZABLE = "v2_bubble_resizable_block";

function frameNode(name: string, options: { atom?: boolean; content?: string }) {
  return Node.create({
    name,
    group: "block",
    ...(options.atom ? { atom: true } : { content: options.content }),
    selectable: true,

    addAttributes() {
      return {
        id: { default: null },
        data: { default: {} },
        frame: { default: null },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-${name.replaceAll("_", "-")}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        {
          ...HTMLAttributes,
          ...courseBlockAuthoringFrameAttributes({
            blockId: HTMLAttributes.id,
            nodeType: name,
          }),
          "data-node": name,
          [`data-${name.replaceAll("_", "-")}`]: "",
        },
        ...(options.atom ? [] : [0]),
      ];
    },
  });
}

const QuickNode = frameNode(QUICK, { atom: true });
const ResizableNode = frameNode(RESIZABLE, { content: "paragraph+" });

const quickBlockDefinition = defineBlock({
  nodeType: QUICK,
  configuration: defineConfiguration({
    attr: "data",
    schema: z.object({
      isGraded: z.boolean(),
      actionState: z.string().optional(),
    }),
    controls: [
      {
        kind: "boolean",
        name: "isGraded",
        label: "Graded",
        placement: { quickMenu: { presentation: "icon-toggle" } },
      },
    ],
  }),
  authoringControls: {
    controls: ({ editor, pos }) => [
      {
        kind: "action",
        id: "reset-state",
        label: "Reset state",
        run: () => {
          const node = editor.state.doc.nodeAt(pos);
          if (!node) return;
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              data: { ...node.attrs["data"], actionState: "reset" },
            }),
          );
        },
      },
    ],
  },
});

const resizableBlockDefinition = defineBlock({
  nodeType: RESIZABLE,
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  configuration: defineConfiguration({
    attr: "data",
    schema: z.object({}),
    sheet: {
      title: "Resizable settings",
      sections: [{ id: "general", title: "General" }],
    },
    controls: [],
  }),
});

const testBlockRegistry = createBlockRegistry([quickBlockDefinition, resizableBlockDefinition]);
const alignmentTargetPort = createAlignmentTargetPort({
  blockDefinitions: testBlockRegistry,
  surfaceVariants: builtInSurfaceVariantRegistry,
});

function makeEditor(blockType: string, attrs: Record<string, unknown>) {
  const editor = new Editor({
    extensions: [StarterKit.configure({ undoRedo: false }), QuickNode, ResizableNode],
    content: {
      type: "doc",
      content: [
        blockType === RESIZABLE
          ? {
              type: blockType,
              attrs,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "resizable text" }],
                },
              ],
            }
          : { type: blockType, attrs },
      ],
    },
  });
  document.body.append(editor.view.dom);

  return editor;
}

function blockBubbleSnapshot(input: {
  target: InteractionTargetRef | null;
  visible?: boolean;
}): InteractionOwnerSnapshot {
  return createInteractionOwnerSnapshot({
    chromeSlots: {
      blockBubble: createInteractionChromeSlot({
        reason:
          input.visible === false
            ? InteractionChromeSlotReason.SuppressedByExplicitOwner
            : InteractionChromeSlotReason.Allowed,
        target: input.target,
        visible: input.visible !== false,
      }),
    },
  });
}

function blockRef(id: string): InteractionTargetRef {
  return { id, kind: InteractionTargetKind.Block };
}

function descriptorFor(editor: Editor, id: string): BlockChromeTargetDescriptor {
  const descriptor = resolveBlockChromeTargetDescriptor(
    editor.state,
    blockRef(id),
    testBlockRegistry,
  );
  if (!descriptor) throw new Error(`no live descriptor for ${id}`);
  return descriptor;
}

function renderContent(input: {
  descriptor: BlockChromeTargetDescriptor;
  editor: Editor;
  store?: InteractionStore;
}): ReturnType<typeof render> {
  return renderWithTooltips(
    <InteractionProvider store={input.store ?? createInteractionStore()}>
      <BlockInteractionBubbleMenuContent
        alignmentTargetPort={alignmentTargetPort}
        blockDefinitions={testBlockRegistry}
        descriptor={input.descriptor}
        editor={input.editor}
      />
    </InteractionProvider>,
  );
}

function renderWithTooltips(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

describe("BlockInteractionBubbleMenu boundary", () => {
  it("appends the Tiptap bubble to the nearest ready authoring host", async () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });
    const boundaryRoot = document.createElement("div");
    document.body.append(boundaryRoot);
    const store = createInteractionStore({
      snapshot: blockBubbleSnapshot({ target: blockRef("quick-a") }),
    });

    render(
      <OverlayBoundary container={boundaryRoot} kind="contained">
        <InteractionProvider store={store}>
          <BlockInteractionBubbleMenu
            alignmentTargetPort={alignmentTargetPort}
            blockDefinitions={testBlockRegistry}
            editor={editor}
            pluginKey="testBlockBoundaryBubble"
          />
        </InteractionProvider>
      </OverlayBoundary>,
    );

    await waitFor(() => {
      const host = boundaryRoot.querySelector("[data-scaffold-overlay-host]");
      const bubble = boundaryRoot.querySelector("[data-scaffold-interaction-bubble]");
      expect(host).not.toBeNull();
      expect(bubble?.closest("[data-scaffold-overlay-host]")).toBe(host);
      expect(bubble?.parentElement?.hasAttribute("data-scaffold-bubble-toolbar-frame")).toBe(true);
      expect(
        bubble
          ?.closest("[data-scaffold-bubble-placement-ready]")
          ?.getAttribute("data-scaffold-bubble-placement-ready"),
      ).toBe("true");
    });

    editor.destroy();
    boundaryRoot.remove();
  });

  it("does not register a Tiptap bubble while its authoring boundary is pending", () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });
    const store = createInteractionStore({
      snapshot: blockBubbleSnapshot({ target: blockRef("quick-a") }),
    });
    const initialPluginCount = editor.state.plugins.length;

    render(
      <OverlayBoundary container={null} kind="contained">
        <InteractionProvider store={store}>
          <BlockInteractionBubbleMenu
            alignmentTargetPort={alignmentTargetPort}
            blockDefinitions={testBlockRegistry}
            editor={editor}
            pluginKey="testPendingBlockBubble"
          />
        </InteractionProvider>
      </OverlayBoundary>,
    );

    expect(editor.state.plugins).toHaveLength(initialPluginCount);
    editor.destroy();
  });
});

describe("resolveBlockInteractionBubbleModel", () => {
  it("resolves a live descriptor model from a visible blockBubble slot", () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });

    const model = resolveBlockInteractionBubbleModel(
      editor,
      blockBubbleSnapshot({ target: blockRef("quick-a") }),
      testBlockRegistry,
    );

    expect(model?.descriptor.blockId).toBe("quick-a");
    expect(model?.targetKey).toBe(model?.descriptor.targetKey);
    editor.destroy();
  });

  it("hides when the explicit structural owner suppresses the slot", () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });

    const model = resolveBlockInteractionBubbleModel(
      editor,
      blockBubbleSnapshot({ target: blockRef("quick-a"), visible: false }),
      testBlockRegistry,
    );

    expect(model).toBeNull();
    editor.destroy();
  });

  it("hides when the slot target has no live descriptor", () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });

    const model = resolveBlockInteractionBubbleModel(
      editor,
      blockBubbleSnapshot({ target: blockRef("quick-gone") }),
      testBlockRegistry,
    );

    expect(model).toBeNull();
    editor.destroy();
  });

  it("hides on a read-only editor", () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });
    editor.setEditable(false);

    const model = resolveBlockInteractionBubbleModel(
      editor,
      blockBubbleSnapshot({ target: blockRef("quick-a") }),
      testBlockRegistry,
    );

    expect(model).toBeNull();
    editor.destroy();
  });

  it("hides while a resize gesture owns the transient interaction", () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });
    editor.view.dom.setAttribute(RESIZE_GESTURE_ACTIVE_ATTR, "");

    const model = resolveBlockInteractionBubbleModel(
      editor,
      blockBubbleSnapshot({ target: blockRef("quick-a") }),
      testBlockRegistry,
    );

    expect(model).toBeNull();
    editor.destroy();
  });
});

describe("resolveBlockBubbleAnchorVirtualElement", () => {
  it("anchors to the block authoring frame element", () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });

    const reference = resolveBlockBubbleAnchorVirtualElement(
      editor,
      descriptorFor(editor, "quick-a"),
    );

    expect(reference?.contextElement.getAttribute("data-authoring-frame")).toBe("block");
    expect(reference?.contextElement.getAttribute("data-id")).toBe("quick-a");
    editor.destroy();
  });

  it("returns null when the frame element is missing", () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });
    const descriptor = descriptorFor(editor, "quick-a");
    editor.view.dom
      .querySelector('[data-authoring-frame="block"]')
      ?.removeAttribute("data-authoring-frame");

    expect(resolveBlockBubbleAnchorVirtualElement(editor, descriptor)).toBeNull();
    editor.destroy();
  });
});

describe("BlockInteractionBubbleMenuContent", () => {
  it("renders default block actions and quick controls from the descriptor", () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });

    renderContent({ descriptor: descriptorFor(editor, "quick-a"), editor });

    expect(screen.getByRole("button", { name: "Duplicate block" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete block" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Graded (off)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset state" })).toBeInTheDocument();
    editor.destroy();
  });

  it("writes quick control values through the document position", async () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });

    renderContent({ descriptor: descriptorFor(editor, "quick-a"), editor });

    await userEvent.click(screen.getByRole("button", { name: "Graded (off)" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset state" }));

    expect(editor.state.doc.nodeAt(0)?.attrs["data"]).toMatchObject({
      isGraded: true,
      actionState: "reset",
    });
    editor.destroy();
  });

  it("keeps alignment controls without offering block size presets", () => {
    const editor = makeEditor(RESIZABLE, { id: "resizable-a", data: {} });

    renderContent({ descriptor: descriptorFor(editor, "resizable-a"), editor });

    expect(screen.queryByRole("combobox", { name: "Block size" })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Horizontal alignment" })).toBeInTheDocument();
    editor.destroy();
  });

  it("aligns a resizable block while preserving its arbitrary frame width", async () => {
    const editor = makeEditor(RESIZABLE, {
      id: "resizable-a",
      data: {},
      frame: { align: "start", widthMode: "percent", widthPercent: 33 },
    });

    renderContent({ descriptor: descriptorFor(editor, "resizable-a"), editor });

    expect(
      screen
        .getByRole("radio", { name: "Horizontal alignment: Left" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    await userEvent.click(screen.getByRole("radio", { name: "Horizontal alignment: Right" }));
    expect(editor.state.doc.nodeAt(0)?.attrs["frame"]).toMatchObject({
      align: "end",
      widthMode: "percent",
      widthPercent: 33,
    });

    await userEvent.click(screen.getByRole("radio", { name: "Horizontal alignment: Center" }));
    expect(editor.state.doc.nodeAt(0)?.attrs["frame"]).toMatchObject({
      align: "center",
      widthMode: "percent",
      widthPercent: 33,
    });
    expect(screen.getByRole("button", { name: "Duplicate block" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete block" })).toBeInTheDocument();
    editor.destroy();
  });

  it("does not offer block size commands for fixed-frame blocks", () => {
    const editor = makeEditor(QUICK, {
      id: "quick-a",
      data: { isGraded: false },
    });

    renderContent({ descriptor: descriptorFor(editor, "quick-a"), editor });

    expect(screen.queryByRole("radiogroup", { name: "Horizontal alignment" })).toBeNull();
    editor.destroy();
  });

  it("deletes the block through the bubble action", async () => {
    const fixture = createDisposableEditor({
      extensions: [StarterKit.configure({ undoRedo: false }), QuickNode],
      content: {
        type: "doc",
        content: [
          { type: QUICK, attrs: { id: "quick-a", data: { isGraded: false } } },
          { type: "paragraph", content: [{ type: "text", text: "Keep me" }] },
        ],
      },
    });

    renderContent({
      descriptor: descriptorFor(fixture.editor, "quick-a"),
      editor: fixture.editor,
    });

    await userEvent.click(screen.getByRole("button", { name: "Delete block" }));

    expect(fixture.topLevelNodeTypes()).toEqual(["paragraph"]);
    expect(fixture.editor.state.doc.textContent).toBe("Keep me");
    fixture.destroy();
  });

  it("dispatches openSettings through the facade commands", async () => {
    const editor = makeEditor(RESIZABLE, { id: "resizable-a", data: {} });
    const openSettingsTargets: InteractionTargetRef[] = [];
    const store = createInteractionStore({
      commandPorts: {
        openSettings: (target) => {
          openSettingsTargets.push(target);
          return true;
        },
      },
    });
    const descriptor = descriptorFor(editor, "resizable-a");

    renderContent({ descriptor, editor, store });

    await userEvent.click(screen.getByRole("button", { name: "Open block settings" }));

    expect(openSettingsTargets).toEqual([descriptor.target]);
    editor.destroy();
  });
});
