// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  AUTHORING_FRAME_WRAPPER_ACTIVE_ATTR,
  AUTHORING_RESIZE_HANDLE_ATTR,
} from "@/editor/interactions/dom/authoring-chrome";
import { courseBlockAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { createScaffoldInteractionOwnerExtension } from "@/editor/interactions/targets/prosemirror/interaction-owner-extension";
import { InteractionOwnerCommandKind } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-command-model";
import { setInteractionOwnerCommandMeta } from "@/editor/interactions/targets/prosemirror/state/interaction-owner-plugin-state";

import { resolveNodeViewBlockElement, syncNodeViewResizeChrome } from "./resize-chrome";

const RESIZABLE = "v2_resize_chrome_block";
const FIXED = "v2_resize_chrome_fixed_block";
const PARENT = "v2_resize_chrome_parent";
const CHILD = "v2_resize_chrome_child";

const testBlockRegistry = createBlockRegistry([
  defineBlock({
    nodeType: RESIZABLE,
    frame: { resizable: true, resizeMode: "responsive" },
  }),
  defineBlock({ nodeType: FIXED }),
  defineBlock({
    nodeType: PARENT,
    frame: { resizable: true, resizeMode: "responsive" },
    interaction: { embeddedChildSelection: "delegate-to-parent" },
  }),
  defineBlock({
    nodeType: CHILD,
    frame: { resizable: true, resizeMode: "responsive" },
  }),
]);

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

const SectionNode = Node.create({
  name: "section",
  content: "block+",
  group: "block",

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-v2-resize-section]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", { ...HTMLAttributes, "data-v2-resize-section": "" }, 0];
  },
});

const ResizableNode = blockNode(RESIZABLE, "paragraph+");
const FixedNode = blockNode(FIXED, "paragraph+");
const ParentNode = blockNode(PARENT, `${CHILD}+`);
const ChildNode = blockNode(CHILD, "paragraph+");

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function makeEditor(content: JSONContent[]) {
  const element = document.createElement("div");
  document.body.append(element);

  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
      SectionNode,
      ResizableNode,
      FixedNode,
      ParentNode,
      ChildNode,
    ],
    content: { type: "doc", content },
  });
}

function defaultContent(): JSONContent[] {
  return [
    {
      type: "section",
      attrs: { id: "section-a" },
      content: [
        {
          type: RESIZABLE,
          attrs: { id: "resizable-a" },
          content: [paragraph("resizable text")],
        },
        {
          type: FIXED,
          attrs: { id: "fixed-a" },
          content: [paragraph("fixed text")],
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
  ];
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

function makeWrapper() {
  const wrapper = document.createElement("div");
  const handle = document.createElement("div");
  handle.setAttribute(AUTHORING_RESIZE_HANDLE_ATTR, "");
  wrapper.append(handle);

  return { handle, wrapper };
}

function activateAuthoringSession(editor: Editor) {
  editor.view.dom.focus();
  editor.view.dom.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
}

function placeCaretInside(editor: Editor, id: string) {
  activateAuthoringSession(editor);
  editor.commands.setTextSelection(nodePosById(editor, id) + 2);
}

function syncFor(
  editor: Editor,
  id: string,
  overrides: {
    editorHasFocus?: boolean;
    posOverride?: number;
  } = {},
) {
  const pos = overrides.posOverride ?? nodePosById(editor, id);
  const node = editor.state.doc.nodeAt(nodePosById(editor, id));
  if (!node) throw new Error(`missing node ${id}`);
  const { handle, wrapper } = makeWrapper();

  syncNodeViewResizeChrome({
    blockDefinitions: testBlockRegistry,
    editor,
    editorHasFocus: overrides.editorHasFocus ?? true,
    frameDefinition: testBlockRegistry.getByNodeType(node.type.name)?.frame,
    getPos: () => pos,
    node,
    wrapper,
  });

  return { handle, wrapper };
}

function expectVisible(result: { handle: HTMLElement; wrapper: HTMLElement }) {
  expect(result.wrapper.hasAttribute(AUTHORING_FRAME_WRAPPER_ACTIVE_ATTR)).toBe(true);
  expect(result.handle.style.display).toBe("block");
}

function expectHidden(result: { handle: HTMLElement; wrapper: HTMLElement }) {
  expect(result.wrapper.hasAttribute(AUTHORING_FRAME_WRAPPER_ACTIVE_ATTR)).toBe(false);
  expect(result.handle.style.display).toBe("none");
}

function activateStructuralSection(editor: Editor, id: string) {
  editor.view.dispatch(
    setInteractionOwnerCommandMeta(editor.state.tr, {
      kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
      target: {
        id,
        kind: InteractionTargetKind.Section,
        pos: nodePosById(editor, id),
      },
    }),
  );
}

function activateContextBlock(editor: Editor, id: string) {
  activateAuthoringSession(editor);
  editor.view.dispatch(
    setInteractionOwnerCommandMeta(editor.state.tr, {
      kind: InteractionOwnerCommandKind.ActivateContextOwner,
      target: {
        id,
        kind: InteractionTargetKind.Block,
        pos: nodePosById(editor, id),
      },
    }),
  );
}

function dispatchEditorGutterMouseDown(editor: Editor) {
  const editorGutter = document.createElement("section");
  editor.view.dom.append(editorGutter);
  editorGutter.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
}

describe("syncNodeViewResizeChrome", () => {
  it("shows handles for a caret inside the resizable block", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "resizable-a");

    expectVisible(syncFor(editor, "resizable-a"));
    editor.destroy();
  });

  it("hides child block handles while an explicit structural owner is active", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "resizable-a");
    activateStructuralSection(editor, "section-a");

    expectHidden(syncFor(editor, "resizable-a"));
    editor.destroy();
  });

  it("resolves managed child resize chrome to the delegating parent", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "child-a");

    expectHidden(syncFor(editor, "child-a"));
    expectVisible(syncFor(editor, "parent-a"));
    editor.destroy();
  });

  it("hides handles for non-resizable definitions", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "fixed-a");

    expectHidden(syncFor(editor, "fixed-a"));
    editor.destroy();
  });

  it("hides handles while a neutral gesture owner is active", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "resizable-a");
    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.BeginGesture,
        target: {
          id: "resizable-a",
          kind: InteractionTargetKind.Block,
          pos: nodePosById(editor, "resizable-a"),
        },
      }),
    );

    expectHidden(syncFor(editor, "resizable-a"));
    editor.destroy();
  });

  it("hides handles without editor focus", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "resizable-a");

    expectHidden(syncFor(editor, "resizable-a", { editorHasFocus: false }));
    editor.destroy();
  });

  it("hides handles after editor-local clicks outside authored frames", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "resizable-a");
    expectVisible(syncFor(editor, "resizable-a"));

    dispatchEditorGutterMouseDown(editor);

    expectHidden(syncFor(editor, "resizable-a"));
    editor.destroy();
  });

  it("shows handles without editor focus when the block is context-owned", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "fixed-a");
    activateContextBlock(editor, "resizable-a");

    expectVisible(syncFor(editor, "resizable-a", { editorHasFocus: false }));
    editor.destroy();
  });

  it("hides handles without editor focus when a different block is context-owned", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "resizable-a");
    activateContextBlock(editor, "fixed-a");

    expectHidden(syncFor(editor, "resizable-a", { editorHasFocus: false }));
    editor.destroy();
  });

  it("hides handles on a read-only editor", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "resizable-a");
    editor.setEditable(false);

    expectHidden(syncFor(editor, "resizable-a"));
    editor.destroy();
  });

  it("hides handles when the NodeView position is stale", () => {
    const editor = makeEditor(defaultContent());
    placeCaretInside(editor, "resizable-a");

    expectHidden(
      syncFor(editor, "resizable-a", {
        posOverride: nodePosById(editor, "fixed-a"),
      }),
    );
    editor.destroy();
  });
});

describe("resolveNodeViewBlockElement", () => {
  it("resolves the block frame element through the neutral marker", () => {
    const editor = makeEditor(defaultContent());
    const pos = nodePosById(editor, "resizable-a");
    const node = editor.state.doc.nodeAt(pos);
    if (!node) throw new Error("missing node");

    const element = resolveNodeViewBlockElement(editor.view.dom, {
      blockDefinitions: testBlockRegistry,
      getPos: () => pos,
      node,
    });

    expect(element?.getAttribute("data-authoring-frame")).toBe("block");
    expect(element?.getAttribute("data-id")).toBe("resizable-a");
    editor.destroy();
  });

  it("returns null without a stable block id", () => {
    const editor = makeEditor([
      {
        type: RESIZABLE,
        attrs: { id: null },
        content: [paragraph("anonymous")],
      },
    ]);
    const node = editor.state.doc.nodeAt(0);
    if (!node) throw new Error("missing node");

    expect(
      resolveNodeViewBlockElement(editor.view.dom, {
        blockDefinitions: testBlockRegistry,
        getPos: () => 0,
        node,
      }),
    ).toBeNull();
    editor.destroy();
  });
});
