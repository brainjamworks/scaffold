// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import type { InteractionTargetRef } from "../../model/interaction-owner-state";
import {
  EMPTY_INTERACTION_OWNER_PLUGIN_STATE,
  interactionOwnerPluginKey,
} from "../state/interaction-owner-plugin-state";
import { createScaffoldInteractionOwnerExtension } from "../interaction-owner-extension";
import { createInteractionOwnerCommandPorts } from "./interaction-facade-command-ports";

const TestCellNode = Node.create({
  name: "cell",
  group: "block",
  content: "paragraph+",
  defining: true,

  addAttributes() {
    return { id: { default: null } };
  },

  parseHTML() {
    return [{ tag: "div[data-v2-command-ports-cell]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-v2-command-ports-cell": "" }, 0];
  },
});

function makeEditor(): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestCellNode,
      createScaffoldInteractionOwnerExtension(builtInBlockRegistry),
    ],
    content: {
      type: "doc",
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
        { type: "paragraph" },
      ],
    },
  });
}

const CELL_REF: InteractionTargetRef = { id: "cell-a", kind: "cell" };

describe("createInteractionOwnerCommandPorts", () => {
  it("dispatches interaction command meta through the transaction boundary", () => {
    const editor = makeEditor();
    const ports = createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry);

    expect(ports.openMenu(CELL_REF)).toBe(true);
    expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });

    expect(ports.toggleMenu(CELL_REF)).toBe(true);
    expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toBeNull();

    expect(ports.toggleMenu(CELL_REF)).toBe(true);
    expect(interactionOwnerPluginKey.getState(editor.state)?.menuOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });

    expect(ports.activateStructuralTarget(CELL_REF)).toBe(true);
    expect(interactionOwnerPluginKey.getState(editor.state)?.explicitOwner).toMatchObject({
      id: "cell-a",
      kind: "cell",
    });

    expect(ports.enterEditableContent()).toBe(true);
    expect(interactionOwnerPluginKey.getState(editor.state)?.explicitOwner).toBeNull();

    expect(ports.beginGesture(CELL_REF)).toBe(true);
    expect(ports.endGesture()).toBe(true);
    expect(ports.openSettings(CELL_REF)).toBe(true);
    expect(ports.selectObjectTarget(CELL_REF)).toBe(true);

    expect(ports.dismissInteraction()).toBe(true);
    expect(interactionOwnerPluginKey.getState(editor.state)).toEqual(
      EMPTY_INTERACTION_OWNER_PLUGIN_STATE,
    );
    editor.destroy();
  });

  it("rejects unstable targets without dispatching", () => {
    const editor = makeEditor();
    const ports = createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry);
    const before = editor.state;

    expect(ports.openMenu({ kind: "cell" } as InteractionTargetRef)).toBe(false);
    expect(editor.state).toBe(before);

    expect(ports.openMenu({ id: "missing-cell", kind: "cell" })).toBe(false);
    expect(editor.state).toBe(before);

    expect(ports.toggleMenu({ kind: "cell" } as InteractionTargetRef)).toBe(false);
    expect(editor.state).toBe(before);
    editor.destroy();
  });

  it("does not change the document", () => {
    const editor = makeEditor();
    const ports = createInteractionOwnerCommandPorts(editor.view, builtInBlockRegistry);
    const docBefore = editor.state.doc;

    ports.activateStructuralTarget(CELL_REF);
    ports.dismissInteraction();

    expect(editor.state.doc.eq(docBefore)).toBe(true);
    editor.destroy();
  });
});
