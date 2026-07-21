// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import type { InteractionTargetRef } from "../../model/interaction-owner-state";
import { InteractionOwnerCommandKind } from "../state/interaction-owner-command-model";
import { setInteractionOwnerCommandMeta } from "../state/interaction-owner-plugin-state";
import { createScaffoldInteractionOwnerExtension } from "../interaction-owner-extension";
import { createInteractionStore } from "../../facade/interaction-store";
import { publishInteractionOwnerSnapshot } from "./interaction-owner-snapshot-publisher";

const TestCellNode = Node.create({
  name: "cell",
  group: "block",
  content: "paragraph+",
  defining: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-v2-snapshot-publisher-cell]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-v2-snapshot-publisher-cell": "" }, 0];
  },
});

const TestGridNode = Node.create({
  name: "grid",
  group: "block",
  content: "cell+",
  defining: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-v2-snapshot-publisher-grid]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-v2-snapshot-publisher-grid": "" }, 0];
  },
});

function makeEditor(): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestGridNode,
      TestCellNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: {
      type: "doc",
      content: [
        {
          type: "grid",
          attrs: { id: "grid-a" },
          content: [
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
          ],
        },
        { type: "paragraph" },
      ],
    },
  });
}

const CELL_REF: InteractionTargetRef = { id: "cell-a", kind: "cell" };

describe("publishInteractionOwnerSnapshot", () => {
  it("composes plugin state, engine input, and the owner engine", () => {
    const editor = makeEditor();
    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        target: CELL_REF,
      }),
    );

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null, {
      blockDefinitions: builtInBlockRegistry,
    });

    expect(snapshot.owners.explicitOwner.target).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    expect(snapshot.owners.effectiveOwner.target).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("publishes the computed snapshot to the facade store", () => {
    const editor = makeEditor();
    const facade = createInteractionStore();
    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.OpenSettings,
        target: CELL_REF,
      }),
    );

    const snapshot = publishInteractionOwnerSnapshot(editor.state, facade, {
      blockDefinitions: builtInBlockRegistry,
    });

    expect(facade.getState().snapshot).toBe(snapshot);
    expect(snapshot.owners.settingsOwner.target).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("publishes the plugin context owner as the effective owner over selection", () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(2);
    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.ActivateContextOwner,
        target: CELL_REF,
      }),
    );

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null, {
      blockDefinitions: builtInBlockRegistry,
    });

    expect(snapshot.owners.contextOwner.target).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    expect(snapshot.owners.effectiveOwner.target).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });
    editor.destroy();
  });

  it("resolves an empty snapshot when no interaction owner state exists", () => {
    const editor = new Editor({
      extensions: [StarterKit.configure({ undoRedo: false }), TestCellNode],
      content: { type: "doc", content: [{ type: "paragraph" }] },
    });

    const snapshot = publishInteractionOwnerSnapshot(editor.state, null, {
      blockDefinitions: builtInBlockRegistry,
    });

    expect(snapshot.owners.explicitOwner.target).toBeNull();
    expect(snapshot.owners.effectiveOwner.target).toBeNull();
    editor.destroy();
  });
});
