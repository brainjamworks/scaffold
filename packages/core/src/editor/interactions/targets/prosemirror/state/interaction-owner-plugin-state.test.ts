// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import {
  InteractionActivationIntentKind,
  InteractionTargetKind,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import { InteractionOwnerCommandKind } from "./interaction-owner-command-model";
import {
  EMPTY_INTERACTION_OWNER_PLUGIN_STATE,
  applyInteractionOwnerCommandMeta,
  normalizeInteractionOwnerCommandMetaForTransaction as normalizeInteractionOwnerCommandMetaForTransactionWithLookup,
  normalizeInteractionOwnerPluginState as normalizeInteractionOwnerPluginStateWithLookup,
  readInteractionOwnerCommandMeta,
  setInteractionOwnerCommandMeta,
} from "./interaction-owner-plugin-state";

const BLOCK = "v2_owner_plugin_state_block";

const testBlockRegistry = createBlockRegistry([
  defineBlock({
    nodeType: BLOCK,
  }),
]);

const normalizeInteractionOwnerPluginState = (
  ...args: Parameters<typeof normalizeInteractionOwnerPluginStateWithLookup> extends [
    infer TState,
    infer TTransaction,
    ...unknown[],
  ]
    ? [TState, TTransaction]
    : never
) => normalizeInteractionOwnerPluginStateWithLookup(...args, testBlockRegistry);

const normalizeInteractionOwnerCommandMetaForTransaction = (
  ...args: Parameters<typeof normalizeInteractionOwnerCommandMetaForTransactionWithLookup> extends [
    infer TMeta,
    infer TTransaction,
    ...unknown[],
  ]
    ? [TMeta, TTransaction]
    : never
) => normalizeInteractionOwnerCommandMetaForTransactionWithLookup(...args, testBlockRegistry);

const TestBlockNode = Node.create({
  name: BLOCK,
  group: "block",
  content: "paragraph+",
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "section[data-v2-owner-plugin-state-block]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["section", { ...HTMLAttributes, "data-v2-owner-plugin-state-block": "" }, 0];
  },
});

const TestCellNode = Node.create({
  name: "cell",
  group: "block",
  content: "paragraph+",
  defining: true,

  addAttributes() {
    return {
      id: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-v2-owner-plugin-state-cell]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-v2-owner-plugin-state-cell": "" }, 0];
  },
});

function makeEditor(): Editor {
  return new Editor({
    extensions: [StarterKit.configure({ undoRedo: false }), TestBlockNode, TestCellNode],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Lead paragraph" }],
        },
        {
          type: "cell",
          attrs: { id: "cell-a" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Cell text" }],
            },
          ],
        },
        {
          type: BLOCK,
          attrs: { id: "block-a" },
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Block text" }],
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

const CELL_REF: InteractionTargetRef = { id: "cell-a", kind: "cell" };
const GRID_POS_REF: InteractionTargetRef = { kind: "grid", pos: 4 };
const BLOCK_REF: InteractionTargetRef = {
  id: "block-a",
  kind: InteractionTargetKind.Block,
};

describe("EMPTY_INTERACTION_OWNER_PLUGIN_STATE", () => {
  it("stores every owner and the activation intent as null", () => {
    expect(EMPTY_INTERACTION_OWNER_PLUGIN_STATE).toEqual({
      activationIntent: null,
      contextOwner: null,
      explicitOwner: null,
      gestureOwner: null,
      menuOwner: null,
      settingsOwner: null,
    });
  });
});

describe("applyInteractionOwnerCommandMeta", () => {
  it("activateStructuralTarget sets the explicit owner and intent", () => {
    const next = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
      target: CELL_REF,
    });

    expect(next.explicitOwner).toEqual({ id: "cell-a", kind: "cell" });
    expect(next.activationIntent).toEqual({
      kind: InteractionActivationIntentKind.ExplicitChrome,
      target: { id: "cell-a", kind: "cell" },
    });
  });

  it("enterEditableContent clears the explicit owner", () => {
    const withOwner = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
      target: CELL_REF,
    });

    const next = applyInteractionOwnerCommandMeta(withOwner, {
      kind: InteractionOwnerCommandKind.EnterEditableContent,
    });

    expect(next.explicitOwner).toBeNull();
    expect(next.activationIntent).toEqual({
      kind: InteractionActivationIntentKind.AuthoredEditableContent,
      target: null,
    });
  });

  it("selectObjectTarget clears the explicit owner and records object intent", () => {
    const withOwner = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
      target: CELL_REF,
    });

    const blockRef: InteractionTargetRef = {
      id: "block-a",
      kind: InteractionTargetKind.Block,
    };
    const next = applyInteractionOwnerCommandMeta(withOwner, {
      kind: InteractionOwnerCommandKind.SelectObjectTarget,
      target: blockRef,
    });

    expect(next.explicitOwner).toBeNull();
    expect(next.activationIntent).toEqual({
      kind: InteractionActivationIntentKind.ObjectShell,
      target: blockRef,
    });
  });

  it("beginGesture and endGesture own and release the gesture owner", () => {
    const during = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.BeginGesture,
      target: GRID_POS_REF,
    });
    expect(during.gestureOwner).toEqual({ kind: "grid", pos: 4 });

    const after = applyInteractionOwnerCommandMeta(during, {
      kind: InteractionOwnerCommandKind.EndGesture,
    });
    expect(after.gestureOwner).toBeNull();
  });

  it("openMenu promotes the menu owner without touching other owners", () => {
    const next = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });

    expect(next.menuOwner).toEqual({ id: "cell-a", kind: "cell" });
    expect(next.explicitOwner).toBeNull();
    expect(next.settingsOwner).toBeNull();
    expect(next.gestureOwner).toBeNull();
  });

  it("openMenu keeps the same menu owner open when called repeatedly", () => {
    const opened = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });

    const reopened = applyInteractionOwnerCommandMeta(opened, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });

    expect(reopened.menuOwner).toEqual({ id: "cell-a", kind: "cell" });
  });

  it("toggleMenu opens, closes, and switches menu owners", () => {
    const opened = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ToggleMenu,
      target: CELL_REF,
    });
    expect(opened.menuOwner).toEqual({ id: "cell-a", kind: "cell" });

    const closed = applyInteractionOwnerCommandMeta(opened, {
      kind: InteractionOwnerCommandKind.ToggleMenu,
      target: CELL_REF,
    });
    expect(closed.menuOwner).toBeNull();

    const switched = applyInteractionOwnerCommandMeta(opened, {
      kind: InteractionOwnerCommandKind.ToggleMenu,
      target: GRID_POS_REF,
    });
    expect(switched.menuOwner).toEqual({ kind: "grid", pos: 4 });
  });

  it("openSettings promotes the settings owner", () => {
    const next = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.OpenSettings,
      target: CELL_REF,
    });

    expect(next.settingsOwner).toEqual({ id: "cell-a", kind: "cell" });
  });

  it("enterEditableContent dismisses an open menu", () => {
    const withMenu = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });

    const next = applyInteractionOwnerCommandMeta(withMenu, {
      kind: InteractionOwnerCommandKind.EnterEditableContent,
    });

    expect(next.menuOwner).toBeNull();
  });

  it("selectObjectTarget dismisses an open menu", () => {
    const withMenu = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });

    const next = applyInteractionOwnerCommandMeta(withMenu, {
      kind: InteractionOwnerCommandKind.SelectObjectTarget,
      target: { id: "block-a", kind: InteractionTargetKind.Block },
    });

    expect(next.menuOwner).toBeNull();
  });

  it("activateStructuralTarget dismisses an open menu for a different target", () => {
    const withMenu = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });

    const next = applyInteractionOwnerCommandMeta(withMenu, {
      kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
      target: GRID_POS_REF,
    });

    expect(next.menuOwner).toBeNull();
    expect(next.explicitOwner).toEqual({ kind: "grid", pos: 4 });
  });

  it("activateContextOwner stores the context owner and clears explicit and menu owners", () => {
    let state = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
      target: CELL_REF,
    });
    state = applyInteractionOwnerCommandMeta(state, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });

    const next = applyInteractionOwnerCommandMeta(state, {
      kind: InteractionOwnerCommandKind.ActivateContextOwner,
      target: BLOCK_REF,
    });

    expect(next.contextOwner).toEqual({ id: "block-a", kind: "block" });
    expect(next.explicitOwner).toBeNull();
    expect(next.menuOwner).toBeNull();
    expect(next.activationIntent).toEqual({
      kind: InteractionActivationIntentKind.IgnoredInteractive,
      target: { id: "block-a", kind: "block" },
    });
  });

  it("activateContextOwner ignores unstable targets", () => {
    const next = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateContextOwner,
      target: { kind: "block" } as InteractionTargetRef,
    });

    expect(next).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
  });

  it("enterEditableContent carries a context owner in the same command", () => {
    const next = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      contextOwner: BLOCK_REF,
      kind: InteractionOwnerCommandKind.EnterEditableContent,
    });

    expect(next.contextOwner).toEqual({ id: "block-a", kind: "block" });
    expect(next.activationIntent).toEqual({
      kind: InteractionActivationIntentKind.AuthoredEditableContent,
      target: null,
    });
    expect(next.explicitOwner).toBeNull();
    expect(next.menuOwner).toBeNull();
  });

  it("enterEditableContent without a context owner clears a stale context owner", () => {
    const withContext = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateContextOwner,
      target: BLOCK_REF,
    });

    const next = applyInteractionOwnerCommandMeta(withContext, {
      kind: InteractionOwnerCommandKind.EnterEditableContent,
    });

    expect(next.contextOwner).toBeNull();
  });

  it("structural, object, and dismiss commands clear a stale context owner", () => {
    const withContext = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateContextOwner,
      target: BLOCK_REF,
    });

    expect(
      applyInteractionOwnerCommandMeta(withContext, {
        kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        target: CELL_REF,
      }).contextOwner,
    ).toBeNull();
    expect(
      applyInteractionOwnerCommandMeta(withContext, {
        kind: InteractionOwnerCommandKind.SelectObjectTarget,
        target: BLOCK_REF,
      }).contextOwner,
    ).toBeNull();
    expect(
      applyInteractionOwnerCommandMeta(withContext, {
        kind: InteractionOwnerCommandKind.DismissInteraction,
      }).contextOwner,
    ).toBeNull();
  });

  it("dismissInteraction clears every ephemeral owner", () => {
    let state = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
      target: CELL_REF,
    });
    state = applyInteractionOwnerCommandMeta(state, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });
    state = applyInteractionOwnerCommandMeta(state, {
      kind: InteractionOwnerCommandKind.OpenSettings,
      target: CELL_REF,
    });
    state = applyInteractionOwnerCommandMeta(state, {
      kind: InteractionOwnerCommandKind.BeginGesture,
      target: GRID_POS_REF,
    });

    const next = applyInteractionOwnerCommandMeta(state, {
      kind: InteractionOwnerCommandKind.DismissInteraction,
    });

    expect(next).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
  });

  it("canonicalizes stored refs and ignores unstable targets", () => {
    const withExtras = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: {
        id: "cell-a",
        kind: "cell",
        pos: 2.5,
      } as InteractionTargetRef,
    });
    expect(withExtras.menuOwner).toEqual({ id: "cell-a", kind: "cell" });

    const unstable = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: { kind: "cell" } as InteractionTargetRef,
    });
    expect(unstable).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
  });
});

describe("normalizeInteractionOwnerPluginState", () => {
  it("keeps stable-id refs while they still resolve and canonicalizes pos", () => {
    const editor = makeEditor();
    const state = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
      target: CELL_REF,
    });

    const tr = editor.state.tr.insertText("More ", 1);
    const next = normalizeInteractionOwnerPluginState(state, tr);

    expect(next.explicitOwner).toEqual({
      id: "cell-a",
      kind: "cell",
      pos: tr.mapping.map(nodePosById(editor, "cell-a")),
    });
    editor.destroy();
  });

  it("drops stable-id refs whose node no longer exists", () => {
    const editor = makeEditor();
    const cellPos = nodePosById(editor, "cell-a");
    const cellNode = editor.state.doc.nodeAt(cellPos);
    if (!cellNode) throw new Error("cell not found");

    const state = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });

    const tr = editor.state.tr.delete(cellPos, cellPos + cellNode.nodeSize);
    const next = normalizeInteractionOwnerPluginState(state, tr);

    expect(next.menuOwner).toBeNull();
    editor.destroy();
  });

  it("maps position-identity refs through the transaction mapping", () => {
    const editor = makeEditor();
    const blockPos = nodePosById(editor, "block-a");
    const state = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.BeginGesture,
      target: { kind: InteractionTargetKind.Block, pos: blockPos },
    });

    const tr = editor.state.tr.insertText("More ", 1);
    const next = normalizeInteractionOwnerPluginState(state, tr);

    expect(next.gestureOwner).toEqual({
      kind: InteractionTargetKind.Block,
      pos: tr.mapping.map(blockPos),
    });
    editor.destroy();
  });

  it("keeps the context owner resolving through document changes", () => {
    const editor = makeEditor();
    const state = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateContextOwner,
      target: BLOCK_REF,
    });

    const tr = editor.state.tr.insertText("More ", 1);
    const next = normalizeInteractionOwnerPluginState(state, tr);

    expect(next.contextOwner).toEqual({
      id: "block-a",
      kind: InteractionTargetKind.Block,
      pos: tr.mapping.map(nodePosById(editor, "block-a")),
    });
    editor.destroy();
  });

  it("drops the context owner when its node is deleted", () => {
    const editor = makeEditor();
    const blockPos = nodePosById(editor, "block-a");
    const blockNode = editor.state.doc.nodeAt(blockPos);
    if (!blockNode) throw new Error("block not found");

    const state = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.ActivateContextOwner,
      target: BLOCK_REF,
    });

    const tr = editor.state.tr.delete(blockPos, blockPos + blockNode.nodeSize);
    const next = normalizeInteractionOwnerPluginState(state, tr);

    expect(next.contextOwner).toBeNull();
    editor.destroy();
  });

  it("drops position-identity refs that no longer point at a matching node", () => {
    const editor = makeEditor();
    const blockPos = nodePosById(editor, "block-a");
    const blockNode = editor.state.doc.nodeAt(blockPos);
    if (!blockNode) throw new Error("block not found");

    const state = applyInteractionOwnerCommandMeta(EMPTY_INTERACTION_OWNER_PLUGIN_STATE, {
      kind: InteractionOwnerCommandKind.BeginGesture,
      target: { kind: InteractionTargetKind.Block, pos: blockPos },
    });

    const tr = editor.state.tr.delete(blockPos, blockPos + blockNode.nodeSize);
    const next = normalizeInteractionOwnerPluginState(state, tr);

    expect(next.gestureOwner).toBeNull();
    editor.destroy();
  });
});

describe("normalizeInteractionOwnerCommandMetaForTransaction", () => {
  it("resolves an enterEditableContent context owner against the live document", () => {
    const editor = makeEditor();

    const meta = normalizeInteractionOwnerCommandMetaForTransaction(
      {
        contextOwner: BLOCK_REF,
        kind: InteractionOwnerCommandKind.EnterEditableContent,
      },
      editor.state.tr,
    );

    expect(meta).toEqual({
      contextOwner: {
        id: "block-a",
        kind: InteractionTargetKind.Block,
        pos: nodePosById(editor, "block-a"),
      },
      kind: InteractionOwnerCommandKind.EnterEditableContent,
    });
    editor.destroy();
  });

  it("drops an unresolvable context owner but keeps the editable-content command", () => {
    const editor = makeEditor();

    const meta = normalizeInteractionOwnerCommandMetaForTransaction(
      {
        contextOwner: {
          id: "missing-block",
          kind: InteractionTargetKind.Block,
        },
        kind: InteractionOwnerCommandKind.EnterEditableContent,
      },
      editor.state.tr,
    );

    expect(meta).toEqual({
      kind: InteractionOwnerCommandKind.EnterEditableContent,
    });
    editor.destroy();
  });

  it("rejects activateContextOwner metas whose target does not resolve", () => {
    const editor = makeEditor();

    const meta = normalizeInteractionOwnerCommandMetaForTransaction(
      {
        kind: InteractionOwnerCommandKind.ActivateContextOwner,
        target: { id: "missing-block", kind: InteractionTargetKind.Block },
      },
      editor.state.tr,
    );

    expect(meta).toBeNull();
    editor.destroy();
  });
});

describe("command meta port", () => {
  it("round-trips command meta through a transaction", () => {
    const editor = makeEditor();
    const tr = setInteractionOwnerCommandMeta(editor.state.tr, {
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });

    expect(readInteractionOwnerCommandMeta(tr)).toEqual({
      kind: InteractionOwnerCommandKind.OpenMenu,
      target: CELL_REF,
    });
    expect(readInteractionOwnerCommandMeta(editor.state.tr)).toBeNull();
    editor.destroy();
  });
});
