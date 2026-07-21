// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import { AllSelection, NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import {
  InteractionSelectionMode,
  InteractionTargetKind,
} from "../../model/interaction-owner-state";
import {
  projectInteractionSelectionInput as projectInteractionSelectionInputWithLookup,
  projectSelectionOwnerTarget as projectSelectionOwnerTargetWithLookup,
} from "./selection-input-projection";

const BLOCK = "v2_selection_input_block";
const DELEGATE_PARENT = "v2_selection_input_delegate_parent";
const EMBEDDED_CHILD = "v2_selection_input_embedded_child";
const FIELD = "v2_selection_input_field";
const INLINE_ATOM = "v2_selection_input_inline_atom";

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

const projectInteractionSelectionInput = (
  selection: Parameters<typeof projectInteractionSelectionInputWithLookup>[0],
) => projectInteractionSelectionInputWithLookup(selection, testBlockRegistry);

const projectSelectionOwnerTarget = (
  selection: Parameters<typeof projectSelectionOwnerTargetWithLookup>[0],
) => projectSelectionOwnerTargetWithLookup(selection, testBlockRegistry);

const TestFieldNode = Node.create({
  name: FIELD,
  content: "paragraph+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: "div[data-v2-selection-input-field]" }];
  },

  renderHTML() {
    return ["div", { "data-v2-selection-input-field": "" }, 0];
  },
});

const TestInlineAtom = Node.create({
  name: INLINE_ATOM,
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "span[data-v2-selection-input-inline-atom]" }];
  },

  renderHTML() {
    return ["span", { "data-v2-selection-input-inline-atom": "" }];
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
    return [{ tag: "section[data-v2-selection-input-block]" }];
  },

  renderHTML() {
    return ["section", { "data-v2-selection-input-block": "" }, 0];
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
    return [{ tag: "section[data-v2-selection-input-embedded-child]" }];
  },

  renderHTML() {
    return ["section", { "data-v2-selection-input-embedded-child": "" }, 0];
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
    return [{ tag: "section[data-v2-selection-input-delegate-parent]" }];
  },

  renderHTML() {
    return ["section", { "data-v2-selection-input-delegate-parent": "" }, 0];
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

function nodePos(editor: Editor, type: string, occurrence = 0): number {
  let seen = 0;
  let found: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== type) return true;
    if (seen !== occurrence) {
      seen += 1;
      return true;
    }
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

describe("projectInteractionSelectionInput", () => {
  it("projects text caret and text range selection facts without object targets", () => {
    const editor = makeEditor();
    const promptPos = textPos(editor, "Prompt");

    editor.commands.setTextSelection(promptPos + 2);

    expect(projectInteractionSelectionInput(editor.state.selection)).toEqual({
      mode: InteractionSelectionMode.TextCaret,
      objectSelectedTarget: null,
      range: {
        empty: true,
        from: promptPos + 2,
        to: promptPos + 2,
      },
    });
    expect(projectSelectionOwnerTarget(editor.state.selection)).toEqual({
      kind: InteractionTargetKind.Block,
      pos: nodePos(editor, BLOCK),
    });

    editor.commands.setTextSelection({
      from: promptPos + 1,
      to: promptPos + 4,
    });

    expect(projectInteractionSelectionInput(editor.state.selection)).toMatchObject({
      mode: InteractionSelectionMode.TextRange,
      objectSelectedTarget: null,
      range: {
        empty: false,
        from: promptPos + 1,
        to: promptPos + 4,
      },
    });

    editor.destroy();
  });

  it("projects direct block NodeSelections as both object target and owner", () => {
    const editor = makeEditor();
    const blockPos = nodePos(editor, BLOCK);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, blockPos)),
    );

    const target = {
      kind: InteractionTargetKind.Block,
      pos: blockPos,
    };

    expect(projectInteractionSelectionInput(editor.state.selection)).toMatchObject({
      mode: InteractionSelectionMode.NodeSelection,
      objectSelectedTarget: target,
    });
    expect(projectSelectionOwnerTarget(editor.state.selection)).toEqual(target);

    editor.destroy();
  });

  it("keeps managed child object selection raw while delegating owner to parent", () => {
    const editor = makeEditor();
    const parentPos = nodePos(editor, DELEGATE_PARENT);
    const childPos = nodePos(editor, EMBEDDED_CHILD);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, childPos)),
    );

    expect(projectInteractionSelectionInput(editor.state.selection)).toMatchObject({
      mode: InteractionSelectionMode.NodeSelection,
      objectSelectedTarget: {
        kind: InteractionTargetKind.Block,
        pos: childPos,
      },
    });
    expect(projectSelectionOwnerTarget(editor.state.selection)).toEqual({
      kind: InteractionTargetKind.Block,
      pos: parentPos,
    });

    editor.destroy();
  });

  it("does not invent object targets for inline atom NodeSelections", () => {
    const editor = makeEditor();
    const inlinePos = nodePos(editor, INLINE_ATOM);

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, inlinePos)),
    );

    const selection = projectInteractionSelectionInput(editor.state.selection);

    expect(selection).toMatchObject({
      mode: InteractionSelectionMode.NodeSelection,
      objectSelectedTarget: null,
    });
    expect("owner" in selection).toBe(false);
    expect(projectSelectionOwnerTarget(editor.state.selection)).toEqual({
      kind: InteractionTargetKind.Block,
      pos: nodePos(editor, BLOCK),
    });

    editor.destroy();
  });

  it("maps all selections without object target or selection owner", () => {
    const editor = makeEditor();

    editor.view.dispatch(editor.state.tr.setSelection(new AllSelection(editor.state.doc)));

    expect(projectInteractionSelectionInput(editor.state.selection)).toEqual({
      mode: InteractionSelectionMode.AllSelection,
      objectSelectedTarget: null,
      range: {
        empty: false,
        from: 0,
        to: editor.state.doc.content.size,
      },
    });
    expect(projectSelectionOwnerTarget(editor.state.selection)).toBeNull();

    editor.destroy();
  });
});
