// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { NodeSelection } from "@tiptap/pm/state";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { setObjectSelectionInTransaction } from "@/editor/selection/selection-transactions";
import { defineBlock } from "@/editor/blocks/block-definition";
import { createBlockRegistry } from "@/editor/blocks/block-registry";

import { createScaffoldInteractionOwnerExtension } from "../interaction-owner-extension";
import {
  InteractionActivationIntentKind,
  InteractionTargetKind,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import {
  EMPTY_INTERACTION_OWNER_PLUGIN_STATE,
  interactionOwnerPluginKey,
  setInteractionOwnerCommandMeta,
} from "../state/interaction-owner-plugin-state";
import { InteractionOwnerCommandKind } from "../state/interaction-owner-command-model";
import { applyInteractionActivationIntent } from "./interaction-activation-dispatch";
import { InteractionDomActivationIntentKind } from "./interaction-activation-intent";

const BLOCK = "v2_activation_dispatch_block";

const testBlockRegistry = createBlockRegistry([defineBlock({ nodeType: BLOCK })]);

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
      return [{ tag: `div[data-v2-activation-dispatch-${name}]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, [`data-v2-activation-dispatch-${name}`]: "" }, 0];
    },
  });
}

const TestCellNode = identifiedNode("cell", "paragraph+");
const TestBlockNode = identifiedNode(BLOCK, "paragraph+");

function paragraph(text: string): JSONContent {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function makeEditor(content?: JSONContent): Editor {
  const element = document.createElement("div");
  document.body.appendChild(element);
  return new Editor({
    element,
    extensions: [
      StarterKit.configure({ undoRedo: false }),
      TestCellNode,
      TestBlockNode,
      createScaffoldInteractionOwnerExtension(testBlockRegistry),
    ],
    content: content ?? {
      type: "doc",
      content: [
        {
          type: "cell",
          attrs: { id: "cell-a" },
          content: [paragraph("cell text")],
        },
        {
          type: BLOCK,
          attrs: { id: "block-a" },
          content: [paragraph("block text")],
        },
        { type: "paragraph" },
      ],
    },
  });
}

function twoCellDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "cell",
        attrs: { id: "cell-a" },
        content: [{ type: "paragraph" }],
      },
      {
        type: "cell",
        attrs: { id: "cell-b" },
        content: [paragraph("right cell text")],
      },
      { type: "paragraph" },
    ],
  };
}

afterEach(() => {
  document.body.innerHTML = "";
});

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

function nodeRangeById(editor: Editor, id: string): { from: number; to: number } {
  const from = nodePosById(editor, id);
  const node = editor.state.doc.nodeAt(from);
  if (!node) throw new Error(`missing node ${id}`);
  return { from, to: from + node.nodeSize };
}

function textEndPos(editor: Editor, text: string): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.isText && node.text === text) {
      found = pos + text.length;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error(`missing text ${text}`);
  return found;
}

function cellRef(editor: Editor): InteractionTargetRef {
  return {
    id: "cell-a",
    kind: InteractionTargetKind.Cell,
    pos: nodePosById(editor, "cell-a"),
  };
}

function blockRef(editor: Editor): InteractionTargetRef {
  return {
    id: "block-a",
    kind: InteractionTargetKind.Block,
    pos: nodePosById(editor, "block-a"),
  };
}

type MockMouseEvent = MouseEvent & {
  readonly preventDefaultMock: ReturnType<typeof vi.fn>;
};

type MockMouseEventOverrides = Omit<Partial<MouseEvent>, "preventDefault"> & {
  preventDefault?: ReturnType<typeof vi.fn>;
};

function mouseDown(overrides: MockMouseEventOverrides = {}): MockMouseEvent {
  const preventDefaultMock = overrides.preventDefault ?? vi.fn();

  return {
    altKey: false,
    button: 0,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
    preventDefault: preventDefaultMock,
    preventDefaultMock,
  } as unknown as MockMouseEvent;
}

function objectSelectBlock(editor: Editor): void {
  const tr = editor.state.tr;
  if (!setObjectSelectionInTransaction(tr, nodePosById(editor, "block-a"))) {
    throw new Error("failed to object-select block");
  }
  editor.view.dispatch(tr);
  if (!(editor.state.selection instanceof NodeSelection)) {
    throw new Error("block object selection missing");
  }
}

function pluginState(editor: Editor) {
  const state = interactionOwnerPluginKey.getState(editor.state);
  if (!state) throw new Error("missing interaction owner plugin state");
  return state;
}

describe("applyInteractionActivationIntent", () => {
  it("does nothing for ignored interactive intents", () => {
    const editor = makeEditor();
    const event = mouseDown();
    const before = editor.state;

    const handled = applyInteractionActivationIntent(
      editor.view,
      { kind: InteractionDomActivationIntentKind.IgnoredInteractive },
      event,
    );

    expect(handled).toBe(false);
    expect(editor.state).toBe(before);
    expect(event.preventDefaultMock).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("activates the context owner for ignored interactive intents without blocking", () => {
    const editor = makeEditor();
    const event = mouseDown();
    const selectionBefore = editor.state.selection;

    const handled = applyInteractionActivationIntent(
      editor.view,
      { kind: InteractionDomActivationIntentKind.IgnoredInteractive },
      event,
      { contextOwner: blockRef(editor) },
    );

    expect(handled).toBe(false);
    expect(event.preventDefaultMock).not.toHaveBeenCalled();
    expect(pluginState(editor).contextOwner).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    expect(editor.state.selection.eq(selectionBefore)).toBe(true);
    editor.destroy();
  });

  it("clears stale explicit and menu owners when a context owner activates", () => {
    const editor = makeEditor();
    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        target: cellRef(editor),
      }),
    );
    expect(pluginState(editor).explicitOwner).not.toBeNull();

    applyInteractionActivationIntent(
      editor.view,
      { kind: InteractionDomActivationIntentKind.IgnoredInteractive },
      mouseDown(),
      { contextOwner: blockRef(editor) },
    );

    expect(pluginState(editor).explicitOwner).toBeNull();
    expect(pluginState(editor).contextOwner).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    editor.destroy();
  });

  it("carries the context owner in the enterEditableContent transaction", () => {
    const editor = makeEditor();
    const event = mouseDown();
    const dispatchSpy = vi.spyOn(editor.view, "dispatch");

    const handled = applyInteractionActivationIntent(
      editor.view,
      { kind: InteractionDomActivationIntentKind.AuthoredEditableContent },
      event,
      { contextOwner: blockRef(editor) },
    );

    expect(handled).toBe(false);
    expect(event.preventDefaultMock).not.toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(pluginState(editor).contextOwner).toMatchObject({
      id: "block-a",
      kind: InteractionTargetKind.Block,
    });
    expect(pluginState(editor).activationIntent?.kind).toBe(
      InteractionActivationIntentKind.AuthoredEditableContent,
    );
    dispatchSpy.mockRestore();
    editor.destroy();
  });

  it("clears the context owner on structural activation and outside dismissal", () => {
    const editor = makeEditor();
    applyInteractionActivationIntent(
      editor.view,
      { kind: InteractionDomActivationIntentKind.IgnoredInteractive },
      mouseDown(),
      { contextOwner: blockRef(editor) },
    );
    expect(pluginState(editor).contextOwner).not.toBeNull();

    applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: cellRef(editor),
      },
      mouseDown(),
    );
    expect(pluginState(editor).contextOwner).toBeNull();

    applyInteractionActivationIntent(
      editor.view,
      { kind: InteractionDomActivationIntentKind.IgnoredInteractive },
      mouseDown(),
      { contextOwner: blockRef(editor) },
    );
    expect(pluginState(editor).contextOwner).not.toBeNull();

    applyInteractionActivationIntent(editor.view, {
      kind: InteractionDomActivationIntentKind.OutsideEditor,
    });
    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    editor.destroy();
  });

  it("dispatches enterEditableContent for authored editable content without blocking PM", () => {
    const editor = makeEditor();
    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        target: cellRef(editor),
      }),
    );
    expect(pluginState(editor).explicitOwner).not.toBeNull();

    const event = mouseDown();
    const handled = applyInteractionActivationIntent(
      editor.view,
      { kind: InteractionDomActivationIntentKind.AuthoredEditableContent },
      event,
    );

    expect(handled).toBe(false);
    expect(event.preventDefaultMock).not.toHaveBeenCalled();
    expect(pluginState(editor).explicitOwner).toBeNull();
    expect(pluginState(editor).activationIntent?.kind).toBe(
      InteractionActivationIntentKind.AuthoredEditableContent,
    );
    editor.destroy();
  });

  it("activates structural targets non-destructively from an existing block object selection", () => {
    const editor = makeEditor();
    objectSelectBlock(editor);

    const event = mouseDown();
    const handled = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: cellRef(editor),
      },
      event,
    );

    expect(handled).toBe(true);
    expect(event.preventDefaultMock).toHaveBeenCalled();
    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
    });
    expect(pluginState(editor).activationIntent?.kind).toBe(
      InteractionActivationIntentKind.ExplicitChrome,
    );
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
    editor.destroy();
  });

  it("focuses before building the structural activation transaction", () => {
    const editor = makeEditor();
    const sequence: string[] = [];
    const event = mouseDown({
      preventDefault: vi.fn(() => sequence.push("preventDefault")),
    });
    const focusSpy = vi.spyOn(editor.view, "focus").mockImplementation(() => {
      sequence.push("focus");
      editor.view.dispatch(
        editor.state.tr.insertText(" after focus", textEndPos(editor, "block text")),
      );
    });

    expect(() =>
      applyInteractionActivationIntent(
        editor.view,
        {
          kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
          target: cellRef(editor),
        },
        event,
      ),
    ).not.toThrow();

    expect(sequence).toEqual(["preventDefault", "focus"]);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
    });
    focusSpy.mockRestore();
    editor.destroy();
  });

  it("ignores pointer positions that resolve outside the structural target", () => {
    const editor = makeEditor();
    const event = mouseDown({
      clientX: 12,
      clientY: 34,
    });
    const blockPos = textEndPos(editor, "block text");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue({
      inside: -1,
      pos: blockPos,
    });

    const handled = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: cellRef(editor),
      },
      event,
    );

    const cellRange = nodeRangeById(editor, "cell-a");
    const blockRange = nodeRangeById(editor, "block-a");
    expect(handled).toBe(true);
    expect(posAtCoords).toHaveBeenCalledWith({ left: 12, top: 34 });
    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
    });
    expect(editor.state.selection.from).toBeGreaterThanOrEqual(cellRange.from);
    expect(editor.state.selection.from).toBeLessThan(cellRange.to);
    expect(
      editor.state.selection.from >= blockRange.from && editor.state.selection.from < blockRange.to,
    ).toBe(false);
    posAtCoords.mockRestore();
    editor.destroy();
  });

  it("keeps structural activation selection inside an empty target when nearest search would escape", () => {
    const editor = makeEditor(twoCellDocument());
    const event = mouseDown({
      clientX: 12,
      clientY: 34,
    });
    const cellRange = nodeRangeById(editor, "cell-a");
    const rightCellRange = nodeRangeById(editor, "cell-b");
    const escapedRightCellPos = textEndPos(editor, "right cell text");
    editor.commands.setTextSelection(escapedRightCellPos);
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue({
      inside: cellRange.from,
      pos: cellRange.to - 1,
    });

    const handled = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: cellRef(editor),
      },
      event,
    );

    expect(handled).toBe(true);
    expect(posAtCoords).toHaveBeenCalledWith({ left: 12, top: 34 });
    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
    });
    expect(editor.state.selection.from).toBeGreaterThan(cellRange.from);
    expect(editor.state.selection.to).toBeLessThan(cellRange.to);
    expect(
      editor.state.selection.from >= rightCellRange.from &&
        editor.state.selection.from < rightCellRange.to,
    ).toBe(false);
    posAtCoords.mockRestore();
    editor.destroy();
  });

  it("activates explicit chrome targets and reconciles PM selection non-destructively", () => {
    const editor = makeEditor();
    objectSelectBlock(editor);

    const event = mouseDown();
    const handled = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.ExplicitChrome,
        target: cellRef(editor),
      },
      event,
    );

    expect(handled).toBe(true);
    expect(event.preventDefaultMock).toHaveBeenCalled();
    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
    });
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
    editor.destroy();
  });

  it("object-selects real block targets for object-shell intents", () => {
    const editor = makeEditor();

    const event = mouseDown();
    const handled = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.ObjectShell,
        target: blockRef(editor),
      },
      event,
    );

    expect(handled).toBe(true);
    expect(event.preventDefaultMock).toHaveBeenCalled();
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect((editor.state.selection as NodeSelection).node.attrs["id"]).toBe("block-a");
    expect(pluginState(editor).activationIntent?.kind).toBe(
      InteractionActivationIntentKind.ObjectShell,
    );
    expect(pluginState(editor).explicitOwner).toBeNull();
    editor.destroy();
  });

  it("focuses before object-shell activation sets PM selection", () => {
    const editor = makeEditor();
    const sequence: string[] = [];
    const event = mouseDown({
      preventDefault: vi.fn(() => sequence.push("preventDefault")),
    });
    const focusSpy = vi.spyOn(editor.view, "focus").mockImplementation(() => {
      sequence.push("focus");
    });

    const handled = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.ObjectShell,
        target: blockRef(editor),
      },
      event,
    );

    expect(handled).toBe(true);
    expect(sequence).toEqual(["preventDefault", "focus"]);
    expect(focusSpy).toHaveBeenCalledTimes(1);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    focusSpy.mockRestore();
    editor.destroy();
  });

  it("refuses to object-select structural targets", () => {
    const editor = makeEditor();
    const before = editor.state;

    const event = mouseDown();
    const handled = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.ObjectShell,
        target: cellRef(editor),
      },
      event,
    );

    expect(handled).toBe(false);
    expect(editor.state).toBe(before);
    expect(event.preventDefaultMock).not.toHaveBeenCalled();
    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    editor.destroy();
  });

  it("dismisses v2 owners and clears object selection for outside-editor intents", () => {
    const editor = makeEditor();
    editor.view.dispatch(
      setInteractionOwnerCommandMeta(editor.state.tr, {
        kind: InteractionOwnerCommandKind.ActivateStructuralTarget,
        target: cellRef(editor),
      }),
    );
    objectSelectBlock(editor);

    const event = mouseDown();
    const handled = applyInteractionActivationIntent(
      editor.view,
      { kind: InteractionDomActivationIntentKind.OutsideEditor },
      event,
    );

    expect(handled).toBe(true);
    expect(event.preventDefaultMock).not.toHaveBeenCalled();
    expect(pluginState(editor)).toEqual(EMPTY_INTERACTION_OWNER_PLUGIN_STATE);
    expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
    editor.destroy();
  });

  it("handles intents without an event object", () => {
    const editor = makeEditor();

    const handled = applyInteractionActivationIntent(editor.view, {
      kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
      target: cellRef(editor),
    });

    expect(handled).toBe(true);
    expect(pluginState(editor).explicitOwner).toMatchObject({
      id: "cell-a",
      kind: InteractionTargetKind.Cell,
    });
    editor.destroy();
  });
});
