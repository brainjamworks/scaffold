// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import type { AuthoringFrameDescriptor } from "@/editor/interactions/dom/authoring-frame";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import { InteractionTargetKind } from "../../model/interaction-owner-state";
import {
  projectInteractionOwnerTargetRefFromAuthoringFrame as projectInteractionOwnerTargetRefFromAuthoringFrameWithLookup,
  projectInteractionTargetRefFromAuthoringFrame as projectInteractionTargetRefFromAuthoringFrameWithLookup,
  projectSectionParentLayoutOwnerTargetRef,
} from "./dom-target-ref-projection";

const BLOCK = "v2_dom_ref_block";
const DELEGATE_PARENT = "v2_dom_ref_delegate_parent";
const EMBEDDED_CHILD = "v2_dom_ref_embedded_child";

const blockDefinition = defineBlock({
  nodeType: BLOCK,
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
  delegateParentDefinition,
  embeddedChildDefinition,
]);

const projectInteractionTargetRefFromAuthoringFrame = (
  ...args: Parameters<typeof projectInteractionTargetRefFromAuthoringFrameWithLookup> extends [
    infer TState,
    infer TDescriptor,
    ...unknown[],
  ]
    ? [TState, TDescriptor]
    : never
) => projectInteractionTargetRefFromAuthoringFrameWithLookup(...args, testBlockRegistry);

const projectInteractionOwnerTargetRefFromAuthoringFrame = (
  ...args: Parameters<typeof projectInteractionOwnerTargetRefFromAuthoringFrameWithLookup> extends [
    infer TState,
    infer TDescriptor,
    ...unknown[],
  ]
    ? [TState, TDescriptor]
    : never
) => projectInteractionOwnerTargetRefFromAuthoringFrameWithLookup(...args, testBlockRegistry);

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
      return [{ tag: `div[data-v2-dom-ref-${name}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, [`data-v2-dom-ref-${name}`]: "" }, 0];
    },
  });
}

const TestSurfaceNode = identifiedNode("surface", "region+");
const TestRegionNode = identifiedNode("region", "(layout | grid | paragraph)+");
const TestLayoutNode = identifiedNode("layout", "section+");
const TestSectionNode = identifiedNode(
  "section",
  `(grid | paragraph | ${BLOCK} | ${DELEGATE_PARENT})+`,
);
const TestGridNode = identifiedNode("grid", "cell+");
const TestCellNode = identifiedNode("cell", "paragraph+");
const TestBlockNode = identifiedNode(BLOCK, "paragraph+");
const TestDelegateParentNode = identifiedNode(DELEGATE_PARENT, `${EMBEDDED_CHILD}+`);
const TestEmbeddedChildNode = identifiedNode(EMBEDDED_CHILD, "paragraph+");

function makeEditor(content: JSONContent) {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestSurfaceNode,
      TestRegionNode,
      TestLayoutNode,
      TestSectionNode,
      TestGridNode,
      TestCellNode,
      TestBlockNode,
      TestDelegateParentNode,
      TestEmbeddedChildNode,
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
        type: "surface",
        attrs: { id: "surface-a" },
        content: [
          {
            type: "region",
            attrs: { id: "region-a" },
            content: [
              {
                type: "layout",
                attrs: { id: "layout-a" },
                content: [
                  {
                    type: "section",
                    attrs: { id: "section-a" },
                    content: [
                      {
                        type: "grid",
                        attrs: { id: "grid-a" },
                        content: [
                          {
                            type: "cell",
                            attrs: { id: "cell-a" },
                            content: [paragraph("cell text")],
                          },
                        ],
                      },
                      {
                        type: BLOCK,
                        attrs: { id: "block-a" },
                        content: [paragraph("block text")],
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
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function descriptor(
  frameKind: AuthoringFrameDescriptor["frameKind"],
  id: string,
  nodeType: string | null = null,
): AuthoringFrameDescriptor {
  return { definition: null, frameKind, id, nodeType };
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

describe("projectInteractionTargetRefFromAuthoringFrame", () => {
  it("projects registered block frames to block refs", () => {
    const editor = makeEditor(fullContent());

    const ref = projectInteractionTargetRefFromAuthoringFrame(
      editor.state,
      descriptor("block", "block-a", BLOCK),
    );

    expect(ref).toEqual({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: nodePosById(editor, "block-a"),
    });
    editor.destroy();
  });

  it("projects managed embedded child frames to the raw child target", () => {
    const editor = makeEditor(fullContent());

    const ref = projectInteractionTargetRefFromAuthoringFrame(
      editor.state,
      descriptor("block", "child-a", EMBEDDED_CHILD),
    );

    expect(ref).toEqual({
      id: "child-a",
      kind: InteractionTargetKind.Block,
      pos: nodePosById(editor, "child-a"),
    });
    editor.destroy();
  });

  it("projects managed embedded child owner refs to the delegating owner", () => {
    const editor = makeEditor(fullContent());

    const ref = projectInteractionOwnerTargetRefFromAuthoringFrame(
      editor.state,
      descriptor("block", "child-a", EMBEDDED_CHILD),
    );

    expect(ref).toEqual({
      id: "parent-a",
      kind: InteractionTargetKind.Block,
      pos: nodePosById(editor, "parent-a"),
    });
    editor.destroy();
  });

  it("keeps independent block frames as their own ref", () => {
    const editor = makeEditor(fullContent());

    const ref = projectInteractionTargetRefFromAuthoringFrame(
      editor.state,
      descriptor("block", "parent-a", DELEGATE_PARENT),
    );

    expect(ref).toEqual({
      id: "parent-a",
      kind: InteractionTargetKind.Block,
      pos: nodePosById(editor, "parent-a"),
    });
    editor.destroy();
  });

  it("projects every structural frame kind by id and position", () => {
    const editor = makeEditor(fullContent());

    for (const [frameKind, id, kind] of [
      ["cell", "cell-a", InteractionTargetKind.Cell],
      ["grid", "grid-a", InteractionTargetKind.Grid],
      ["layout", "layout-a", InteractionTargetKind.Layout],
      ["region", "region-a", InteractionTargetKind.Region],
      ["section", "section-a", InteractionTargetKind.Section],
      ["surface", "surface-a", InteractionTargetKind.Surface],
    ] as const) {
      expect(
        projectInteractionTargetRefFromAuthoringFrame(editor.state, descriptor(frameKind, id)),
      ).toEqual({
        id,
        kind,
        pos: nodePosById(editor, id),
      });
    }
    editor.destroy();
  });

  it("returns null for stale ids, schema mismatches, and unknown kinds", () => {
    const editor = makeEditor(fullContent());

    expect(
      projectInteractionTargetRefFromAuthoringFrame(editor.state, descriptor("grid", "grid-gone")),
    ).toBeNull();

    expect(
      projectInteractionTargetRefFromAuthoringFrame(editor.state, descriptor("grid", "cell-a")),
    ).toBeNull();

    expect(
      projectInteractionTargetRefFromAuthoringFrame(
        editor.state,
        descriptor("block", "block-a", "paragraph"),
      ),
    ).toBeNull();

    expect(
      projectInteractionTargetRefFromAuthoringFrame(editor.state, descriptor("block", "block-a")),
    ).toBeNull();

    expect(
      projectInteractionTargetRefFromAuthoringFrame(editor.state, {
        definition: null,
        frameKind: "field" as never,
        id: "block-a",
        nodeType: null,
      }),
    ).toBeNull();

    editor.destroy();
  });
});

describe("projectSectionParentLayoutOwnerTargetRef", () => {
  it("projects a section frame to its parent layout owner ref", () => {
    const editor = makeEditor(fullContent());

    const ref = projectSectionParentLayoutOwnerTargetRef(
      editor.state,
      descriptor("section", "section-a"),
    );

    expect(ref).toEqual({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: nodePosById(editor, "layout-a"),
    });
    editor.destroy();
  });

  it("returns null for non-section descriptors and stale section ids", () => {
    const editor = makeEditor(fullContent());

    expect(
      projectSectionParentLayoutOwnerTargetRef(editor.state, descriptor("layout", "layout-a")),
    ).toBeNull();

    expect(
      projectSectionParentLayoutOwnerTargetRef(editor.state, descriptor("section", "section-gone")),
    ).toBeNull();

    editor.destroy();
  });
});
