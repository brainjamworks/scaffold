// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  AUTHORING_FRAME_ATTR,
  authoringFrameAttributes,
  courseBlockAuthoringFrameAttributes,
  type AuthoringFrameKind,
} from "@/editor/interactions/dom/authoring-frame";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import { InteractionTargetKind } from "../../model/interaction-owner-state";
import { resolveInteractionContextOwnerFromMouseDown as resolveInteractionContextOwnerFromMouseDownWithLookup } from "./interaction-context-owner";

const BLOCK = "v2_context_owner_block";
const DELEGATE_PARENT = "v2_context_owner_delegate_parent";
const EMBEDDED_CHILD = "v2_context_owner_embedded_child";

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

const resolveInteractionContextOwnerFromMouseDown = (
  view: Parameters<typeof resolveInteractionContextOwnerFromMouseDownWithLookup>[0],
  event: Parameters<typeof resolveInteractionContextOwnerFromMouseDownWithLookup>[1],
) => resolveInteractionContextOwnerFromMouseDownWithLookup(view, event, testBlockRegistry);

function framedNode(name: string, content: string, frameKind: AuthoringFrameKind) {
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
      return [{ tag: `div[data-v2-context-owner-${name}]` }];
    },

    renderHTML({ node, HTMLAttributes }) {
      const frameAttributes =
        frameKind === "block"
          ? courseBlockAuthoringFrameAttributes({
              blockId: node.attrs["id"],
              nodeType: name,
            })
          : authoringFrameAttributes({
              frameKind,
              id: node.attrs["id"],
              nodeType: frameKind,
            });
      return [
        "div",
        {
          ...HTMLAttributes,
          ...frameAttributes,
          [`data-v2-context-owner-${name}`]: "",
        },
        0,
      ];
    },
  });
}

const TestSurfaceNode = framedNode("surface", "region+", "surface");
const TestRegionNode = framedNode("region", "(layout | grid | paragraph)+", "region");
const TestLayoutNode = framedNode("layout", "section+", "layout");
const TestSectionNode = framedNode(
  "section",
  `(grid | paragraph | ${BLOCK} | ${DELEGATE_PARENT})+`,
  "section",
);
const TestGridNode = framedNode("grid", "cell+", "grid");
const TestCellNode = framedNode("cell", "paragraph+", "cell");
const TestBlockNode = framedNode(BLOCK, "paragraph+", "block");
const TestDelegateParentNode = framedNode(DELEGATE_PARENT, `${EMBEDDED_CHILD}+`, "block");
const TestEmbeddedChildNode = framedNode(EMBEDDED_CHILD, "paragraph+", "block");

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

function makeEditor(): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
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
    content: fullContent(),
  });
}

afterEach(() => {
  document.body.innerHTML = "";
});

function frameElement(editor: Editor, id: string): Element {
  const found = editor.view.dom.querySelector(`[${AUTHORING_FRAME_ATTR}][data-id="${id}"]`);
  if (!found) throw new Error(`missing frame element ${id}`);
  return found;
}

function buttonInside(frame: Element): HTMLButtonElement {
  const button = frame.ownerDocument.createElement("button");
  frame.appendChild(button);
  return button;
}

function mouseDown(target: EventTarget | null, overrides: Partial<MouseEvent> = {}): MouseEvent {
  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target,
    ...overrides,
  } as unknown as MouseEvent;
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

describe("resolveInteractionContextOwnerFromMouseDown", () => {
  it("returns null for non-primary, modified, missing, and outside-editor targets", () => {
    const editor = makeEditor();
    const blockButton = buttonInside(frameElement(editor, "block-a"));
    const outside = document.createElement("button");
    document.body.appendChild(outside);

    expect(
      resolveInteractionContextOwnerFromMouseDown(
        editor.view,
        mouseDown(blockButton, { button: 2 }),
      ),
    ).toBeNull();
    expect(
      resolveInteractionContextOwnerFromMouseDown(
        editor.view,
        mouseDown(blockButton, { metaKey: true }),
      ),
    ).toBeNull();
    expect(resolveInteractionContextOwnerFromMouseDown(editor.view, mouseDown(null))).toBeNull();
    expect(resolveInteractionContextOwnerFromMouseDown(editor.view, mouseDown(outside))).toBeNull();
    editor.destroy();
  });

  it("resolves an interactive descendant inside a block frame to the block owner", () => {
    const editor = makeEditor();
    const blockButton = buttonInside(frameElement(editor, "block-a"));

    expect(
      resolveInteractionContextOwnerFromMouseDown(editor.view, mouseDown(blockButton)),
    ).toEqual({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: nodePosById(editor, "block-a"),
    });
    editor.destroy();
  });

  it("resolves a managed embedded child descendant to the declaring parent owner", () => {
    const editor = makeEditor();
    const childButton = buttonInside(frameElement(editor, "child-a"));

    expect(
      resolveInteractionContextOwnerFromMouseDown(editor.view, mouseDown(childButton)),
    ).toEqual({
      id: "parent-a",
      kind: InteractionTargetKind.Block,
      pos: nodePosById(editor, "parent-a"),
    });
    editor.destroy();
  });

  it("resolves structural frame descendants to structural owner refs", () => {
    const editor = makeEditor();

    for (const [id, kind] of [
      ["cell-a", InteractionTargetKind.Cell],
      ["grid-a", InteractionTargetKind.Grid],
      ["layout-a", InteractionTargetKind.Layout],
      ["surface-a", InteractionTargetKind.Surface],
    ] as const) {
      expect(
        resolveInteractionContextOwnerFromMouseDown(
          editor.view,
          mouseDown(buttonInside(frameElement(editor, id))),
        ),
      ).toEqual({
        id,
        kind,
        pos: nodePosById(editor, id),
      });
    }
    editor.destroy();
  });

  it("resolves section descendants to the parent layout owner for passive context", () => {
    const editor = makeEditor();
    const sectionButton = buttonInside(frameElement(editor, "section-a"));

    expect(
      resolveInteractionContextOwnerFromMouseDown(editor.view, mouseDown(sectionButton)),
    ).toEqual({
      id: "layout-a",
      kind: InteractionTargetKind.Layout,
      pos: nodePosById(editor, "layout-a"),
    });
    editor.destroy();
  });

  it("returns null for stale or idless frame descriptors", () => {
    const editor = makeEditor();
    const cellFrame = frameElement(editor, "cell-a");

    const staleFrame = document.createElement("div");
    staleFrame.setAttribute(AUTHORING_FRAME_ATTR, "grid");
    staleFrame.setAttribute("data-id", "grid-gone");
    cellFrame.appendChild(staleFrame);

    expect(
      resolveInteractionContextOwnerFromMouseDown(editor.view, mouseDown(staleFrame)),
    ).toBeNull();

    const idlessFrame = document.createElement("div");
    idlessFrame.setAttribute(AUTHORING_FRAME_ATTR, "grid");
    cellFrame.appendChild(idlessFrame);

    expect(
      resolveInteractionContextOwnerFromMouseDown(editor.view, mouseDown(idlessFrame)),
    ).toBeNull();
    editor.destroy();
  });

  it("returns null for targets with no frame ancestor", () => {
    const editor = makeEditor();
    const loose = document.createElement("div");
    editor.view.dom.appendChild(loose);

    expect(resolveInteractionContextOwnerFromMouseDown(editor.view, mouseDown(loose))).toBeNull();
    editor.destroy();
  });
});
