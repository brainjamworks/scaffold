// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import {
  resolveClosestScaffoldBlockContext,
  resolveScaffoldBlockContext,
  resolveEmbeddedChildBlock,
  resolveObjectSelectedBlock,
  resolveSelectionOwnerBlock,
} from "./block-context";

const BLOCK_A = "v2_block_ctx_block_a";
const BLOCK_B = "v2_block_ctx_block_b";
const DELEGATE_PARENT = "v2_block_ctx_delegate_parent";
const EMBEDDED_CHILD = "v2_block_ctx_embedded_child";
const PLAIN_PARENT = "v2_block_ctx_plain_parent";
const FIELD = "v2_block_ctx_field";
const FEEDBACK = "v2_block_ctx_feedback";

const blockADefinition = defineBlock({
  nodeType: BLOCK_A,
});

const blockBDefinition = defineBlock({
  nodeType: BLOCK_B,
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

const plainParentDefinition = defineBlock({
  nodeType: PLAIN_PARENT,
});

const testBlockRegistry = createBlockRegistry([
  blockADefinition,
  blockBDefinition,
  delegateParentDefinition,
  embeddedChildDefinition,
  plainParentDefinition,
]);

const TestFieldNode = Node.create({
  name: FIELD,
  content: "paragraph+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-v2-block-ctx-field]" }];
  },

  renderHTML() {
    return ["div", { "data-v2-block-ctx-field": "" }, 0];
  },
});

const TestFeedbackNode = Node.create({
  name: FEEDBACK,
  content: "paragraph+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-v2-block-ctx-feedback]" }];
  },

  renderHTML() {
    return ["div", { "data-v2-block-ctx-feedback": "" }, 0];
  },
});

const TestBlockANode = Node.create({
  name: BLOCK_A,
  group: "block",
  content: `${FIELD} ${FEEDBACK}`,
  defining: true,
  isolating: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-v2-block-ctx-block-a]" }];
  },

  renderHTML() {
    return ["div", { "data-v2-block-ctx-block-a": "" }, 0];
  },
});

const TestBlockBNode = Node.create({
  name: BLOCK_B,
  group: "block",
  content: FIELD,
  defining: true,
  isolating: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-v2-block-ctx-block-b]" }];
  },

  renderHTML() {
    return ["div", { "data-v2-block-ctx-block-b": "" }, 0];
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
    return [{ tag: "div[data-v2-block-ctx-embedded-child]" }];
  },

  renderHTML() {
    return ["div", { "data-v2-block-ctx-embedded-child": "" }, 0];
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
    return [{ tag: "section[data-v2-block-ctx-delegate-parent]" }];
  },

  renderHTML() {
    return ["section", { "data-v2-block-ctx-delegate-parent": "" }, 0];
  },
});

const TestPlainParentNode = Node.create({
  name: PLAIN_PARENT,
  group: "block",
  content: EMBEDDED_CHILD,
  defining: true,
  isolating: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "section[data-v2-block-ctx-plain-parent]" }];
  },

  renderHTML() {
    return ["section", { "data-v2-block-ctx-plain-parent": "" }, 0];
  },
});

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestFieldNode,
      TestFeedbackNode,
      TestBlockANode,
      TestBlockBNode,
      TestEmbeddedChildNode,
      TestDelegateParentNode,
      TestPlainParentNode,
    ],
    content: {
      type: "doc",
      content: [
        {
          type: BLOCK_A,
          content: [
            {
              type: FIELD,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Prompt text" }],
                },
              ],
            },
            {
              type: FEEDBACK,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Feedback text" }],
                },
              ],
            },
          ],
        },
        {
          type: BLOCK_B,
          content: [
            {
              type: FIELD,
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Other text" }],
                },
              ],
            },
          ],
        },
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
                      content: [{ type: "text", text: "Embedded text" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: PLAIN_PARENT,
          content: [
            {
              type: EMBEDDED_CHILD,
              content: [
                {
                  type: FIELD,
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Nested text" }],
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
                  content: [{ type: "text", text: "Standalone child text" }],
                },
              ],
            },
          ],
        },
      ],
    },
  });
}

function findNodePosition(editor: Editor, nodeType: string, occurrence = 0): number {
  let found: number | null = null;
  let seen = 0;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== nodeType) return true;
    if (seen === occurrence) {
      found = pos;
      return false;
    }
    seen += 1;
    return true;
  });

  if (found === null) throw new Error(`Node not found: ${nodeType}`);
  return found;
}

function findTextPosition(editor: Editor, text: string): number {
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

describe("resolveScaffoldBlockContext", () => {
  it("resolves a registered block node to its context", () => {
    const editor = makeEditor();
    const pos = findNodePosition(editor, BLOCK_A);
    const node = editor.state.doc.nodeAt(pos);
    if (!node) throw new Error("Expected block node");

    expect(resolveScaffoldBlockContext(node, pos, testBlockRegistry)).toMatchObject({
      nodeType: BLOCK_A,
      pos,
      definition: blockADefinition,
    });

    editor.destroy();
  });

  it("returns null for unregistered nodes", () => {
    const editor = makeEditor();
    const pos = findNodePosition(editor, FIELD);
    const node = editor.state.doc.nodeAt(pos);
    if (!node) throw new Error("Expected field node");

    expect(resolveScaffoldBlockContext(node, pos, testBlockRegistry)).toBeNull();

    editor.destroy();
  });
});

describe("resolveClosestScaffoldBlockContext", () => {
  it("resolves the nearest registered ancestor block with its depth", () => {
    const editor = makeEditor();
    const cursorPos = findTextPosition(editor, "Nested") + 2;
    const $pos = editor.state.doc.resolve(cursorPos);

    const context = resolveClosestScaffoldBlockContext($pos, testBlockRegistry);

    expect(context).toMatchObject({
      nodeType: EMBEDDED_CHILD,
      definition: embeddedChildDefinition,
    });
    expect(context?.depth).toBeTypeOf("number");

    editor.destroy();
  });

  it("returns null when no registered ancestor exists", () => {
    const editor = new Editor({
      extensions: [StarterKit.configure({ undoRedo: false })],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Standalone text" }],
          },
        ],
      },
    });

    expect(
      resolveClosestScaffoldBlockContext(editor.state.doc.resolve(3), testBlockRegistry),
    ).toBeNull();

    editor.destroy();
  });
});

describe("resolveSelectionOwnerBlock", () => {
  it("resolves a caret inside a registered block to that block", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(findTextPosition(editor, "Prompt") + 2);

    expect(resolveSelectionOwnerBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: BLOCK_A,
      definition: blockADefinition,
    });

    editor.destroy();
  });

  it("resolves a range across internal fields of the same block", () => {
    const editor = makeEditor();
    const from = findTextPosition(editor, "Prompt");
    const to = findTextPosition(editor, "Feedback") + "Feedback".length;

    editor.commands.setTextSelection({ from, to });

    expect(resolveSelectionOwnerBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: BLOCK_A,
    });

    editor.destroy();
  });

  it("returns null for a range spanning two registered blocks", () => {
    const editor = makeEditor();
    const from = findTextPosition(editor, "Prompt");
    const to = findTextPosition(editor, "Other") + "Other".length;

    editor.commands.setTextSelection({ from, to });

    expect(resolveSelectionOwnerBlock(editor.state.selection, testBlockRegistry)).toBeNull();

    editor.destroy();
  });

  it("delegates a caret inside a managed embedded child to the parent", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(findTextPosition(editor, "Embedded") + 2);

    expect(resolveSelectionOwnerBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: DELEGATE_PARENT,
      definition: delegateParentDefinition,
    });

    editor.destroy();
  });

  it("keeps a caret inside a non-delegated nested child on the child", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(findTextPosition(editor, "Nested") + 2);

    expect(resolveSelectionOwnerBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: EMBEDDED_CHILD,
      definition: embeddedChildDefinition,
    });

    editor.destroy();
  });

  it("resolves a node-selected unregistered field to its registered ancestor", () => {
    const editor = makeEditor();
    const fieldPos = findNodePosition(editor, FIELD);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, fieldPos)),
    );

    expect(resolveSelectionOwnerBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: BLOCK_A,
    });

    editor.destroy();
  });
});

describe("resolveObjectSelectedBlock", () => {
  it("resolves a node-selected registered block", () => {
    const editor = makeEditor();
    const pos = findNodePosition(editor, BLOCK_A);

    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));

    expect(resolveObjectSelectedBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: BLOCK_A,
      pos,
      definition: blockADefinition,
    });

    editor.destroy();
  });

  it("keeps a node-selected independent embedded child as the object-selected block", () => {
    const editor = makeEditor();
    const childPos = findNodePosition(editor, EMBEDDED_CHILD, 1);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, childPos)),
    );

    expect(resolveObjectSelectedBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: EMBEDDED_CHILD,
      pos: childPos,
    });
    expect(resolveSelectionOwnerBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: EMBEDDED_CHILD,
      pos: childPos,
    });

    editor.destroy();
  });

  it("does not delegate a node-selected managed child to the parent", () => {
    const editor = makeEditor();
    const childPos = findNodePosition(editor, EMBEDDED_CHILD);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, childPos)),
    );

    expect(resolveObjectSelectedBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: EMBEDDED_CHILD,
      pos: childPos,
      definition: embeddedChildDefinition,
    });

    editor.destroy();
  });

  it("returns null for text selections inside a block", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(findTextPosition(editor, "Prompt") + 2);

    expect(resolveObjectSelectedBlock(editor.state.selection, testBlockRegistry)).toBeNull();

    editor.destroy();
  });

  it("returns null for node-selected unregistered nodes", () => {
    const editor = makeEditor();
    const fieldPos = findNodePosition(editor, FIELD);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, fieldPos)),
    );

    expect(resolveObjectSelectedBlock(editor.state.selection, testBlockRegistry)).toBeNull();

    editor.destroy();
  });
});

describe("resolveEmbeddedChildBlock", () => {
  it("splits a node-selected managed child into object, owner, and embedded child", () => {
    const editor = makeEditor();
    const childPos = findNodePosition(editor, EMBEDDED_CHILD);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, childPos)),
    );

    expect(resolveObjectSelectedBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: EMBEDDED_CHILD,
      pos: childPos,
    });
    expect(resolveSelectionOwnerBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: DELEGATE_PARENT,
      definition: delegateParentDefinition,
    });
    expect(resolveEmbeddedChildBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: EMBEDDED_CHILD,
      pos: childPos,
    });

    editor.destroy();
  });

  it("exposes the managed child for carets inside its fields", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(findTextPosition(editor, "Embedded") + 2);

    expect(resolveEmbeddedChildBlock(editor.state.selection, testBlockRegistry)).toMatchObject({
      nodeType: EMBEDDED_CHILD,
      definition: embeddedChildDefinition,
    });

    editor.destroy();
  });

  it("returns null when no delegation happened", () => {
    const editor = makeEditor();

    editor.commands.setTextSelection(findTextPosition(editor, "Standalone child") + 2);

    expect(resolveEmbeddedChildBlock(editor.state.selection, testBlockRegistry)).toBeNull();

    editor.destroy();
  });

  it("returns null for a node-selected independent embedded child", () => {
    const editor = makeEditor();
    const childPos = findNodePosition(editor, EMBEDDED_CHILD, 1);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, childPos)),
    );

    expect(resolveEmbeddedChildBlock(editor.state.selection, testBlockRegistry)).toBeNull();

    editor.destroy();
  });
});
