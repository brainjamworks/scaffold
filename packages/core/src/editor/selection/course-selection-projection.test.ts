// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import { AllSelection, NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import {
  isObjectSelectedBlockInsideRange,
  isSelectionOwnerBlockInsideRange,
  resolveCourseSelectionProjection,
} from "./course-selection-projection";

const BLOCK = "v2_cs_projection_block";
const DELEGATE_PARENT = "v2_cs_projection_delegate_parent";
const EMBEDDED_CHILD = "v2_cs_projection_embedded_child";
const FIELD = "v2_cs_projection_field";
const INLINE_ATOM = "v2_cs_projection_inline_atom";

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

const TestFieldNode = Node.create({
  name: FIELD,
  content: "paragraph+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-v2-cs-projection-field]" }];
  },

  renderHTML() {
    return ["div", { "data-v2-cs-projection-field": "" }, 0];
  },
});

const TestInlineAtom = Node.create({
  name: INLINE_ATOM,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "span[data-v2-cs-projection-inline-atom]" }];
  },

  renderHTML() {
    return ["span", { "data-v2-cs-projection-inline-atom": "" }];
  },
});

const TestBlockNode = Node.create({
  name: BLOCK,
  group: "block",
  content: FIELD,
  defining: true,
  isolating: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "section[data-v2-cs-projection-block]" }];
  },

  renderHTML() {
    return ["section", { "data-v2-cs-projection-block": "" }, 0];
  },
});

const TestEmbeddedChildNode = Node.create({
  name: EMBEDDED_CHILD,
  group: "block",
  content: FIELD,
  defining: true,
  isolating: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "section[data-v2-cs-projection-embedded-child]" }];
  },

  renderHTML() {
    return ["section", { "data-v2-cs-projection-embedded-child": "" }, 0];
  },
});

const TestDelegateParentNode = Node.create({
  name: DELEGATE_PARENT,
  group: "block",
  content: EMBEDDED_CHILD,
  defining: true,
  isolating: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "section[data-v2-cs-projection-delegate-parent]" }];
  },

  renderHTML() {
    return ["section", { "data-v2-cs-projection-delegate-parent": "" }, 0];
  },
});

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestFieldNode,
      TestInlineAtom,
      TestBlockNode,
      TestEmbeddedChildNode,
      TestDelegateParentNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Before" }],
        },
        {
          type: BLOCK,
          content: [
            {
              type: FIELD,
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Prompt " },
                    { type: INLINE_ATOM },
                    { type: "text", text: " text" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  });
}

function makeEmbeddedEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestFieldNode,
      TestEmbeddedChildNode,
      TestDelegateParentNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: DELEGATE_PARENT,
          content: [
            {
              type: EMBEDDED_CHILD,
              content: [
                {
                  type: FIELD,
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Embedded prompt" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: EMBEDDED_CHILD,
          content: [
            {
              type: FIELD,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Standalone prompt" }],
                },
              ],
            },
          ],
        },
      ],
    },
  });
}

function nodePos(editor: Editor, type: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    found = pos;
    return false;
  });

  if (found === null) throw new Error(`Node not found: ${type}`);
  return found;
}

function textPos(editor: Editor, text: string): number {
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (!node.isText) return true;

    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;

    found = pos + index;
    return false;
  });

  if (found === null) throw new Error(`Text not found: ${text}`);
  return found;
}

describe("resolveCourseSelectionProjection", () => {
  it("projects a directly node-selected block as object-selected and owner", () => {
    const editor = makeEditor();
    const pos = nodePos(editor, BLOCK);

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    expect(
      resolveCourseSelectionProjection(editor.state.selection, testBlockRegistry),
    ).toMatchObject({
      facts: {
        selectionMode: "nodeSelection",
      },
      objectSelectedBlock: {
        definition: blockDefinition,
        nodeType: BLOCK,
        pos,
      },
      selectionOwnerBlock: {
        definition: blockDefinition,
        nodeType: BLOCK,
        pos,
      },
      embeddedChildBlock: null,
    });

    editor.destroy();
  });

  it("projects a text caret inside a block as owner without object selection", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(textPos(editor, "Prompt") + 2);

    expect(
      resolveCourseSelectionProjection(editor.state.selection, testBlockRegistry),
    ).toMatchObject({
      facts: {
        empty: true,
        selectionMode: "textCaret",
      },
      objectSelectedBlock: null,
      selectionOwnerBlock: {
        nodeType: BLOCK,
      },
      embeddedChildBlock: null,
    });

    editor.destroy();
  });

  it("treats inline atom NodeSelections as owner context, not object-selected blocks", () => {
    const editor = makeEditor();
    const inlinePos = nodePos(editor, INLINE_ATOM);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, inlinePos)),
    );

    expect(
      resolveCourseSelectionProjection(editor.state.selection, testBlockRegistry),
    ).toMatchObject({
      facts: {
        selectionMode: "nodeSelection",
      },
      objectSelectedBlock: null,
      selectionOwnerBlock: {
        nodeType: BLOCK,
      },
    });

    editor.destroy();
  });

  it("normalizes whole-document selections without inventing an owner", () => {
    const editor = makeEditor();

    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));

    expect(
      resolveCourseSelectionProjection(editor.state.selection, testBlockRegistry),
    ).toMatchObject({
      facts: {
        selectionMode: "allSelection",
      },
      objectSelectedBlock: null,
      selectionOwnerBlock: null,
      embeddedChildBlock: null,
    });

    editor.destroy();
  });

  it("delegates text selections inside managed embedded children to the parent owner", () => {
    const editor = makeEmbeddedEditor();

    editor.commands.setTextSelection(textPos(editor, "Embedded") + 2);

    expect(
      resolveCourseSelectionProjection(editor.state.selection, testBlockRegistry),
    ).toMatchObject({
      facts: {
        selectionMode: "textCaret",
      },
      objectSelectedBlock: null,
      selectionOwnerBlock: {
        definition: delegateParentDefinition,
        nodeType: DELEGATE_PARENT,
      },
      embeddedChildBlock: {
        definition: embeddedChildDefinition,
        nodeType: EMBEDDED_CHILD,
      },
    });

    editor.destroy();
  });

  it("keeps a node-selected managed child raw while delegating ownership", () => {
    const editor = makeEmbeddedEditor();
    const childPos = nodePos(editor, EMBEDDED_CHILD);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, childPos)),
    );

    expect(
      resolveCourseSelectionProjection(editor.state.selection, testBlockRegistry),
    ).toMatchObject({
      facts: {
        selectionMode: "nodeSelection",
      },
      objectSelectedBlock: {
        definition: embeddedChildDefinition,
        nodeType: EMBEDDED_CHILD,
        pos: childPos,
      },
      selectionOwnerBlock: {
        definition: delegateParentDefinition,
        nodeType: DELEGATE_PARENT,
      },
      embeddedChildBlock: {
        definition: embeddedChildDefinition,
        nodeType: EMBEDDED_CHILD,
        pos: childPos,
      },
    });

    editor.destroy();
  });

  it("keeps standalone child selections targeting the child block", () => {
    const editor = makeEmbeddedEditor();

    editor.commands.setTextSelection(textPos(editor, "Standalone") + 2);

    expect(
      resolveCourseSelectionProjection(editor.state.selection, testBlockRegistry),
    ).toMatchObject({
      objectSelectedBlock: null,
      selectionOwnerBlock: {
        definition: embeddedChildDefinition,
        nodeType: EMBEDDED_CHILD,
      },
      embeddedChildBlock: null,
    });

    editor.destroy();
  });
});

describe("isObjectSelectedBlockInsideRange", () => {
  it("matches an object-selected block strictly inside a parent range", () => {
    const editor = makeEditor();
    const pos = nodePos(editor, BLOCK);
    const node = editor.state.doc.nodeAt(pos);
    if (!node) throw new Error("Expected block node");

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    expect(
      isObjectSelectedBlockInsideRange(editor.state.selection, testBlockRegistry, {
        from: pos - 1,
        to: pos + node.nodeSize,
      }),
    ).toBe(true);

    expect(
      isObjectSelectedBlockInsideRange(editor.state.selection, testBlockRegistry, {
        from: pos,
        to: pos + node.nodeSize,
      }),
    ).toBe(false);

    editor.destroy();
  });

  it("does not treat inline atom NodeSelections as object-selected blocks", () => {
    const editor = makeEditor();
    const inlinePos = nodePos(editor, INLINE_ATOM);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, inlinePos)),
    );

    expect(
      isObjectSelectedBlockInsideRange(editor.state.selection, testBlockRegistry, {
        from: 0,
        to: editor.state.doc.content.size,
      }),
    ).toBe(false);

    editor.destroy();
  });

  it("does not match text selections inside a block", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(textPos(editor, "Prompt") + 2);

    expect(
      isObjectSelectedBlockInsideRange(editor.state.selection, testBlockRegistry, {
        from: 0,
        to: editor.state.doc.content.size,
      }),
    ).toBe(false);

    editor.destroy();
  });
});

describe("isSelectionOwnerBlockInsideRange", () => {
  it("matches text selections inside a block within the range", () => {
    const editor = makeEditor();
    const pos = nodePos(editor, BLOCK);
    const node = editor.state.doc.nodeAt(pos);
    if (!node) throw new Error("Expected block node");

    editor.commands.setTextSelection(textPos(editor, "Prompt") + 2);

    expect(
      isSelectionOwnerBlockInsideRange(editor.state.selection, testBlockRegistry, {
        from: pos - 1,
        to: pos + node.nodeSize,
      }),
    ).toBe(true);

    editor.destroy();
  });

  it("matches inline atom NodeSelections inside a block within the range", () => {
    const editor = makeEditor();
    const pos = nodePos(editor, BLOCK);
    const node = editor.state.doc.nodeAt(pos);
    const inlinePos = nodePos(editor, INLINE_ATOM);
    if (!node) throw new Error("Expected block node");

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, inlinePos)),
    );

    expect(
      isSelectionOwnerBlockInsideRange(editor.state.selection, testBlockRegistry, {
        from: pos - 1,
        to: pos + node.nodeSize,
      }),
    ).toBe(true);

    editor.destroy();
  });

  it("does not match whole-document selections", () => {
    const editor = makeEditor();

    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));

    expect(
      isSelectionOwnerBlockInsideRange(editor.state.selection, testBlockRegistry, {
        from: 0,
        to: editor.state.doc.content.size,
      }),
    ).toBe(false);

    editor.destroy();
  });
});
