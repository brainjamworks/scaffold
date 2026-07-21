// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import {
  InteractionChromeSlotReason,
  InteractionTargetKind,
  createInteractionChromeSlot,
  createInteractionOwnerSnapshot,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import {
  blockChromeTargetKey,
  resolveBlockChromeFrameElement,
  resolveBlockChromeTargetDescriptor as resolveBlockChromeTargetDescriptorWithLookup,
  resolveBlockChromeTargetFromSnapshot as resolveBlockChromeTargetFromSnapshotWithLookup,
} from "./block-chrome-target-projection";

const BLOCK = "v2_chrome_desc_block";
const RESIZABLE_BLOCK = "v2_chrome_desc_resizable_block";
const DELEGATE_PARENT = "v2_chrome_desc_delegate_parent";
const EMBEDDED_CHILD = "v2_chrome_desc_embedded_child";

const blockDefinition = defineBlock({
  nodeType: BLOCK,
});

const resizableBlockDefinition = defineBlock({
  nodeType: RESIZABLE_BLOCK,
  frame: { resizable: true },
});

const delegateParentDefinition = defineBlock({
  nodeType: DELEGATE_PARENT,
  interaction: {
    embeddedChildSelection: "delegate-to-parent",
  },
});

const embeddedChildDefinition = defineBlock({
  nodeType: EMBEDDED_CHILD,
});

const testBlockRegistry = createBlockRegistry([
  blockDefinition,
  resizableBlockDefinition,
  delegateParentDefinition,
  embeddedChildDefinition,
]);

const resolveBlockChromeTargetDescriptor = (
  ...args: Parameters<typeof resolveBlockChromeTargetDescriptorWithLookup> extends [
    infer TState,
    infer TTarget,
    ...unknown[],
  ]
    ? [TState, TTarget]
    : never
) => resolveBlockChromeTargetDescriptorWithLookup(...args, testBlockRegistry);

const resolveBlockChromeTargetFromSnapshot = (
  ...args: Parameters<typeof resolveBlockChromeTargetFromSnapshotWithLookup> extends [
    infer TState,
    infer TSnapshot,
    infer TSlot,
    ...unknown[],
  ]
    ? [TState, TSnapshot, TSlot]
    : never
) => resolveBlockChromeTargetFromSnapshotWithLookup(...args, testBlockRegistry);

function identifiedNode(name: string, content: string) {
  return Node.create({
    name,
    content,
    defining: true,
    group: "block",

    addAttributes() {
      return {
        id: { default: null },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-v2-chrome-desc-${name}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, [`data-v2-chrome-desc-${name}`]: "" }, 0];
    },
  });
}

const TestBlockNode = identifiedNode(BLOCK, "paragraph+");
const TestResizableBlockNode = identifiedNode(RESIZABLE_BLOCK, "paragraph+");
const TestDelegateParentNode = identifiedNode(DELEGATE_PARENT, `${EMBEDDED_CHILD}+`);
const TestEmbeddedChildNode = identifiedNode(EMBEDDED_CHILD, "paragraph+");
const TestUnregisteredNode = identifiedNode("v2_chrome_desc_plain", "paragraph+");

function makeEditor(content: JSONContent) {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestBlockNode,
      TestResizableBlockNode,
      TestDelegateParentNode,
      TestEmbeddedChildNode,
      TestUnregisteredNode,
    ],
    content,
  });
}

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function fullContent(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: BLOCK,
        attrs: { id: "block-a" },
        content: [paragraph("block text")],
      },
      {
        type: RESIZABLE_BLOCK,
        attrs: { id: "resizable-a" },
        content: [paragraph("resizable text")],
      },
      {
        type: DELEGATE_PARENT,
        attrs: { id: "parent-a" },
        content: [
          {
            type: EMBEDDED_CHILD,
            attrs: { id: "child-a" },
            content: [paragraph("child text")],
          },
        ],
      },
      {
        type: "v2_chrome_desc_plain",
        attrs: { id: "plain-a" },
        content: [paragraph("plain text")],
      },
    ],
  };
}

function nodePosById(editor: Editor, id: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.attrs["id"] === id) {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`missing node ${id}`);
  return found;
}

function blockRef(input: {
  id?: string;
  pos?: number;
  kind?: InteractionTargetRef["kind"];
}): InteractionTargetRef {
  return {
    ...(input.id ? { id: input.id } : {}),
    kind: input.kind ?? InteractionTargetKind.Block,
    ...(Number.isInteger(input.pos) ? { pos: input.pos } : {}),
  };
}

describe("resolveBlockChromeTargetDescriptor", () => {
  it("resolves a registered block ref by id", () => {
    const editor = makeEditor(fullContent());
    const pos = nodePosById(editor, "block-a");

    const descriptor = resolveBlockChromeTargetDescriptor(
      editor.state,
      blockRef({ id: "block-a" }),
    );

    expect(descriptor).toMatchObject({
      blockId: "block-a",
      nodeType: BLOCK,
      pos,
      target: { id: "block-a", kind: InteractionTargetKind.Block, pos },
    });
    expect(descriptor?.node).toBe(editor.state.doc.nodeAt(pos));
    expect(descriptor?.definition.nodeType).toBe(BLOCK);
    editor.destroy();
  });

  it("resolves a registered block ref by position", () => {
    const editor = makeEditor(fullContent());
    const pos = nodePosById(editor, "block-a");

    const descriptor = resolveBlockChromeTargetDescriptor(editor.state, blockRef({ pos }));

    expect(descriptor?.blockId).toBe("block-a");
    expect(descriptor?.nodeType).toBe(BLOCK);
    editor.destroy();
  });

  it("derives resize and settings capabilities from the registry definition", () => {
    const editor = makeEditor(fullContent());

    const plain = resolveBlockChromeTargetDescriptor(editor.state, blockRef({ id: "block-a" }));
    const resizable = resolveBlockChromeTargetDescriptor(
      editor.state,
      blockRef({ id: "resizable-a" }),
    );

    expect(plain?.capabilities.supportsResize).toBe(false);
    expect(resizable?.capabilities.supportsResize).toBe(true);
    editor.destroy();
  });

  it("returns null for a stale id", () => {
    const editor = makeEditor(fullContent());

    expect(
      resolveBlockChromeTargetDescriptor(editor.state, blockRef({ id: "block-gone" })),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null for out-of-range positions", () => {
    const editor = makeEditor(fullContent());

    expect(resolveBlockChromeTargetDescriptor(editor.state, blockRef({ pos: -1 }))).toBeNull();
    expect(
      resolveBlockChromeTargetDescriptor(
        editor.state,
        blockRef({ pos: editor.state.doc.content.size + 1 }),
      ),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null when id and position disagree", () => {
    const editor = makeEditor(fullContent());
    const wrongPos = nodePosById(editor, "resizable-a");

    expect(
      resolveBlockChromeTargetDescriptor(editor.state, blockRef({ id: "block-a", pos: wrongPos })),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null for structural target kinds", () => {
    const editor = makeEditor(fullContent());

    expect(
      resolveBlockChromeTargetDescriptor(
        editor.state,
        blockRef({ id: "block-a", kind: InteractionTargetKind.Section }),
      ),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null for unregistered node types", () => {
    const editor = makeEditor(fullContent());

    expect(
      resolveBlockChromeTargetDescriptor(editor.state, blockRef({ id: "plain-a" })),
    ).toBeNull();
    editor.destroy();
  });

  it("resolves the delegated parent and the raw child separately", () => {
    const editor = makeEditor(fullContent());

    const parent = resolveBlockChromeTargetDescriptor(editor.state, blockRef({ id: "parent-a" }));
    const child = resolveBlockChromeTargetDescriptor(editor.state, blockRef({ id: "child-a" }));

    expect(parent?.nodeType).toBe(DELEGATE_PARENT);
    expect(child?.nodeType).toBe(EMBEDDED_CHILD);
    expect(parent?.targetKey).not.toBe(child?.targetKey);
    editor.destroy();
  });
});

describe("resolveBlockChromeTargetFromSnapshot", () => {
  function snapshotWithSlot(input: {
    slot: "blockBubble" | "movementHandle" | "resizeHandles";
    target: InteractionTargetRef | null;
    visible: boolean;
  }) {
    return createInteractionOwnerSnapshot({
      chromeSlots: {
        [input.slot]: createInteractionChromeSlot({
          reason: input.visible
            ? InteractionChromeSlotReason.Allowed
            : InteractionChromeSlotReason.SuppressedByExplicitOwner,
          target: input.target,
          visible: input.visible,
        }),
      },
    });
  }

  it("resolves a visible blockBubble slot to a live descriptor", () => {
    const editor = makeEditor(fullContent());
    const snapshot = snapshotWithSlot({
      slot: "blockBubble",
      target: blockRef({ id: "block-a" }),
      visible: true,
    });

    const descriptor = resolveBlockChromeTargetFromSnapshot(editor.state, snapshot, "blockBubble");

    expect(descriptor?.blockId).toBe("block-a");
    editor.destroy();
  });

  it("resolves visible resizeHandles and movementHandle slots", () => {
    const editor = makeEditor(fullContent());

    const resize = resolveBlockChromeTargetFromSnapshot(
      editor.state,
      snapshotWithSlot({
        slot: "resizeHandles",
        target: blockRef({ id: "resizable-a" }),
        visible: true,
      }),
      "resizeHandles",
    );
    const movement = resolveBlockChromeTargetFromSnapshot(
      editor.state,
      snapshotWithSlot({
        slot: "movementHandle",
        target: blockRef({ id: "block-a" }),
        visible: true,
      }),
      "movementHandle",
    );

    expect(resize?.blockId).toBe("resizable-a");
    expect(movement?.blockId).toBe("block-a");
    editor.destroy();
  });

  it("returns null for a suppressed slot even when the target is live", () => {
    const editor = makeEditor(fullContent());
    const snapshot = snapshotWithSlot({
      slot: "blockBubble",
      target: blockRef({ id: "block-a" }),
      visible: false,
    });

    expect(resolveBlockChromeTargetFromSnapshot(editor.state, snapshot, "blockBubble")).toBeNull();
    editor.destroy();
  });

  it("returns null when the visible slot target is stale", () => {
    const editor = makeEditor(fullContent());
    const snapshot = snapshotWithSlot({
      slot: "blockBubble",
      target: blockRef({ id: "block-gone" }),
      visible: true,
    });

    expect(resolveBlockChromeTargetFromSnapshot(editor.state, snapshot, "blockBubble")).toBeNull();
    editor.destroy();
  });
});

describe("blockChromeTargetKey", () => {
  it("builds a stable key from descriptor facts", () => {
    const editor = makeEditor(fullContent());
    const pos = nodePosById(editor, "block-a");

    const descriptor = resolveBlockChromeTargetDescriptor(
      editor.state,
      blockRef({ id: "block-a" }),
    );

    expect(descriptor?.targetKey).toBe(`block:${BLOCK}:${pos}:block-a`);
    expect(blockChromeTargetKey(descriptor!)).toBe(descriptor?.targetKey);
    editor.destroy();
  });
});

describe("resolveBlockChromeFrameElement", () => {
  it("finds the block authoring frame element by neutral marker lookup", () => {
    const editor = makeEditor(fullContent());
    const root = document.createElement("div");
    root.innerHTML = [
      '<div data-authoring-frame="block" data-id="block-a">frame</div>',
      '<div data-authoring-frame="block" data-id="other">other</div>',
    ].join("");

    const descriptor = resolveBlockChromeTargetDescriptor(
      editor.state,
      blockRef({ id: "block-a" }),
    );

    const element = resolveBlockChromeFrameElement(root, descriptor);

    expect(element?.getAttribute("data-id")).toBe("block-a");
    editor.destroy();
  });

  it("returns null without a stable block id", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: BLOCK,
          attrs: { id: null },
          content: [paragraph("anonymous block")],
        },
      ],
    });
    const root = document.createElement("div");

    const descriptor = resolveBlockChromeTargetDescriptor(editor.state, {
      kind: InteractionTargetKind.Block,
      pos: 0,
    });

    expect(descriptor?.blockId).toBeNull();
    expect(resolveBlockChromeFrameElement(root, descriptor)).toBeNull();
    editor.destroy();
  });
});
