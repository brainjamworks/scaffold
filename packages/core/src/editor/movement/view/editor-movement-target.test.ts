// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { courseBlockAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { resolveBlockChromeTargetDescriptor as resolveBlockChromeTargetDescriptorWithLookup } from "@/editor/interactions/targets/prosemirror/projection/block-chrome-target-projection";

import {
  resolveV2MovementTargetFromDescriptor as resolveV2MovementTargetFromDescriptorWithLookup,
  resolveV2MovementTargetFromRef as resolveV2MovementTargetFromRefWithLookup,
} from "./editor-movement-target";

const BLOCK = "v2_movement_block";
const PARENT = "v2_movement_parent";
const CHILD = "v2_movement_child";

const testBlockRegistry = createBlockRegistry([
  defineBlock({ nodeType: BLOCK }),
  defineBlock({
    nodeType: PARENT,
    interaction: { embeddedChildSelection: "delegate-to-parent" },
  }),
  defineBlock({ nodeType: CHILD }),
]);

const resolveBlockChromeTargetDescriptor = (
  state: Parameters<typeof resolveBlockChromeTargetDescriptorWithLookup>[0],
  target: Parameters<typeof resolveBlockChromeTargetDescriptorWithLookup>[1],
) => resolveBlockChromeTargetDescriptorWithLookup(state, target, testBlockRegistry);

const resolveV2MovementTargetFromRef = (
  editor: Parameters<typeof resolveV2MovementTargetFromRefWithLookup>[0],
  target: Parameters<typeof resolveV2MovementTargetFromRefWithLookup>[1],
) => resolveV2MovementTargetFromRefWithLookup(editor, target, testBlockRegistry);

const resolveV2MovementTargetFromDescriptor = (
  editor: Parameters<typeof resolveV2MovementTargetFromDescriptorWithLookup>[0],
  descriptor: Parameters<typeof resolveV2MovementTargetFromDescriptorWithLookup>[1],
) => resolveV2MovementTargetFromDescriptorWithLookup(editor, descriptor, testBlockRegistry);

function blockNode(name: string, content: string) {
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
        0,
      ];
    },
  });
}

const BlockNode = blockNode(BLOCK, "paragraph+");
const ParentNode = blockNode(PARENT, `${CHILD}+`);
const ChildNode = blockNode(CHILD, "paragraph+");

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function makeEditor(content?: JSONContent[]) {
  return new Editor({
    extensions: [StarterKit.configure({ undoRedo: false }), BlockNode, ParentNode, ChildNode],
    content: {
      type: "doc",
      content: content ?? [
        {
          type: BLOCK,
          attrs: { id: "block-a" },
          content: [paragraph("block text")],
        },
        {
          type: PARENT,
          attrs: { id: "parent-a" },
          content: [
            {
              type: CHILD,
              attrs: { id: "child-a" },
              content: [paragraph("child text")],
            },
          ],
        },
      ],
    },
  });
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

describe("resolveV2MovementTargetFromDescriptor", () => {
  it("resolves movement context, anchor element, and target ref for a block descriptor", () => {
    const editor = makeEditor();
    const descriptor = resolveBlockChromeTargetDescriptor(editor.state, {
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    if (!descriptor) throw new Error("missing descriptor");

    const target = resolveV2MovementTargetFromDescriptor(editor, descriptor);

    expect(target?.context.pos).toBe(nodePosById(editor, "block-a"));
    expect(target?.context.nodeType.name).toBe(BLOCK);
    expect(target?.targetRef).toEqual(descriptor.target);
    expect(target?.element.getAttribute("data-authoring-frame")).toBe("block");
    expect(target?.element.getAttribute("data-id")).toBe("block-a");
    expect(target?.rect).toBeInstanceOf(DOMRect);
    editor.destroy();
  });

  it("returns null when the block frame element is missing", () => {
    const editor = makeEditor();
    const descriptor = resolveBlockChromeTargetDescriptor(editor.state, {
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    if (!descriptor) throw new Error("missing descriptor");
    editor.view.dom
      .querySelector('[data-authoring-frame="block"][data-id="block-a"]')
      ?.removeAttribute("data-authoring-frame");

    expect(resolveV2MovementTargetFromDescriptor(editor, descriptor)).toBeNull();
    editor.destroy();
  });
});

describe("resolveV2MovementTargetFromRef", () => {
  it("resolves a block ref through the live descriptor", () => {
    const editor = makeEditor();

    const target = resolveV2MovementTargetFromRef(editor, {
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });

    expect(target?.context.nodeType.name).toBe(BLOCK);
    editor.destroy();
  });

  it("returns null for stale refs", () => {
    const editor = makeEditor();

    expect(
      resolveV2MovementTargetFromRef(editor, {
        id: "block-gone",
        kind: InteractionTargetKind.Block,
      }),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null for structural refs", () => {
    const editor = makeEditor();

    expect(
      resolveV2MovementTargetFromRef(editor, {
        id: "block-a",
        kind: InteractionTargetKind.Section,
      }),
    ).toBeNull();
    editor.destroy();
  });
});
