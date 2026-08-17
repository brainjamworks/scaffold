// @vitest-environment happy-dom

import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
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
import {
  applyInteractionActivationIntent,
  createInteractionTargetActivationTransaction,
  createStructuralInteractionTargetActivationTransaction,
} from "./interaction-activation-dispatch";
import { InteractionDomActivationIntentKind } from "./interaction-activation-intent";
import type {
  StructuralActivationPlacementResolution,
  StructuralActivationPlacementResolver,
} from "./structural-activation-placement";

const BLOCK = "v2_activation_dispatch_block";
const RETAINED_CELL_ID = EmbeddedNodeIdSchema.parse("cell-target1");
const RETAINED_BLOCK_ID = EmbeddedNodeIdSchema.parse("block-targ01");
const ACTIVE_CHILD_ID = EmbeddedNodeIdSchema.parse("active-child");
const UNAVAILABLE_TARGET_ID = EmbeddedNodeIdSchema.parse("target-miss1");
const INVALID_RETAINED_TARGET_IDS = [
  { label: "missing", targetId: null },
  { label: "malformed", targetId: "cell-a" },
] as const;

const testBlockRegistry = createBlockRegistry([
  defineBlock({ nodeType: BLOCK, title: "Activation dispatch block" }),
]);

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

function twoParagraphCellDocument(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "cell",
        attrs: { id: RETAINED_CELL_ID },
        content: [paragraph("active text"), paragraph("withheld text")],
      },
      {
        type: BLOCK,
        attrs: { id: RETAINED_BLOCK_ID },
        content: [paragraph("block text")],
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

function paragraphRangeByText(editor: Editor, text: string): { from: number; to: number } {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range) return false;
    if (node.type.name === "paragraph" && node.textContent === text) {
      range = { from: pos, to: pos + node.nodeSize };
      return false;
    }
    return true;
  });
  if (!range) throw new Error(`missing paragraph ${text}`);
  return range;
}

function retainedActiveParagraphPlacement(
  editor: Editor,
  selectionTarget: Extract<
    StructuralActivationPlacementResolution,
    { readonly kind: "retain-active-child" }
  >["selectionTarget"] = {
    kind: "text",
    from: paragraphRangeByText(editor, "active text").from + 1,
    to: paragraphRangeByText(editor, "active text").from + 1,
  },
): Extract<StructuralActivationPlacementResolution, { readonly kind: "retain-active-child" }> {
  return {
    kind: "retain-active-child",
    activeChildId: ACTIVE_CHILD_ID,
    activeRange: paragraphRangeByText(editor, "active text"),
    selectionTarget,
  };
}

function cellRef(editor: Editor, id = "cell-a"): InteractionTargetRef {
  return {
    id,
    kind: InteractionTargetKind.Cell,
    pos: nodePosById(editor, id),
  };
}

function retainedTargetWithId(editor: Editor, targetId: string | null): InteractionTargetRef {
  const pos = nodePosById(editor, RETAINED_CELL_ID);
  return targetId === null
    ? { kind: InteractionTargetKind.Cell, pos }
    : { id: targetId, kind: InteractionTargetKind.Cell, pos };
}

function blockRef(editor: Editor): InteractionTargetRef {
  return {
    id: "block-a",
    kind: InteractionTargetKind.Block,
    pos: nodePosById(editor, "block-a"),
  };
}

function fieldRef(): InteractionTargetRef {
  return {
    id: "field-target1",
    kind: InteractionTargetKind.Field,
    pos: 0,
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

  it("keeps pointer placement on the bounded posAtCoords path", () => {
    const editor = makeEditor(twoParagraphCellDocument());
    const activeRange = paragraphRangeByText(editor, "active text");
    editor.commands.setTextSelection(textEndPos(editor, "withheld text"));
    const event = mouseDown({ clientX: 12, clientY: 34 });
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords").mockReturnValue({
      inside: activeRange.from,
      pos: activeRange.from + 2,
    });
    const resolveStructuralActivationPlacement = vi.fn<StructuralActivationPlacementResolver>(
      () => ({ kind: "pointer-within-target" }),
    );

    const handled = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: cellRef(editor, RETAINED_CELL_ID),
      },
      event,
      { resolveStructuralActivationPlacement },
    );

    expect(handled).toBe(true);
    expect(resolveStructuralActivationPlacement).toHaveBeenCalledOnce();
    expect(posAtCoords).toHaveBeenCalledWith({ left: 12, top: 34 });
    expect(editor.state.selection.from).toBe(activeRange.from + 2);
    expect(editor.state.selection.to).toBe(activeRange.from + 2);
    posAtCoords.mockRestore();
    editor.destroy();
  });

  it("retains an existing text selection inside the active child", () => {
    const editor = makeEditor(twoParagraphCellDocument());
    editor.commands.setTextSelection(textEndPos(editor, "active text"));
    const selectionBefore = editor.state.selection;
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords");

    const handled = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: cellRef(editor, RETAINED_CELL_ID),
      },
      mouseDown({ clientX: 12, clientY: 34 }),
      {
        resolveStructuralActivationPlacement: () => retainedActiveParagraphPlacement(editor),
      },
    );

    expect(handled).toBe(true);
    expect(editor.state.selection.eq(selectionBefore)).toBe(true);
    expect(posAtCoords).not.toHaveBeenCalled();
    posAtCoords.mockRestore();
    editor.destroy();
  });

  it("retains an existing node selection on the active child", () => {
    const editor = makeEditor(twoParagraphCellDocument());
    const activeRange = paragraphRangeByText(editor, "active text");
    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, activeRange.from)),
    );
    const selectionBefore = editor.state.selection;
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords");

    const handled = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: cellRef(editor, RETAINED_CELL_ID),
      },
      mouseDown({ clientX: 12, clientY: 34 }),
      {
        resolveStructuralActivationPlacement: () => retainedActiveParagraphPlacement(editor),
      },
    );

    expect(handled).toBe(true);
    expect(editor.state.selection.eq(selectionBefore)).toBe(true);
    expect(posAtCoords).not.toHaveBeenCalled();
    posAtCoords.mockRestore();
    editor.destroy();
  });

  it.each(["from", "to"] as const)(
    "does not preserve a text selection at the active child %s boundary",
    (boundary) => {
      const editor = makeEditor(twoParagraphCellDocument());
      const activeRange = paragraphRangeByText(editor, "active text");
      editor.view.dispatch(
        editor.state.tr.setSelection(TextSelection.create(editor.state.doc, activeRange[boundary])),
      );

      const handled = applyInteractionActivationIntent(
        editor.view,
        {
          kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
          target: cellRef(editor, RETAINED_CELL_ID),
        },
        mouseDown(),
        {
          resolveStructuralActivationPlacement: () => retainedActiveParagraphPlacement(editor),
        },
      );

      expect(handled).toBe(true);
      expect(editor.state.selection.toJSON()).toEqual({
        type: "text",
        anchor: activeRange.from + 1,
        head: activeRange.from + 1,
      });
      editor.destroy();
    },
  );

  it.each(["from", "to"] as const)(
    "refuses a supplied text selection at the active child %s boundary",
    (boundary) => {
      const editor = makeEditor(twoParagraphCellDocument());
      const activeRange = paragraphRangeByText(editor, "active text");
      editor.commands.setTextSelection(textEndPos(editor, "withheld text"));
      const selectionBefore = editor.state.selection;

      const outcome = applyInteractionActivationIntent(
        editor.view,
        {
          kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
          target: cellRef(editor, RETAINED_CELL_ID),
        },
        mouseDown(),
        {
          resolveStructuralActivationPlacement: () =>
            retainedActiveParagraphPlacement(editor, {
              kind: "text",
              from: activeRange[boundary],
              to: activeRange[boundary],
            }),
        },
      );

      expect(outcome).toEqual({
        kind: "placement-unavailable",
        issue: {
          kind: "retained-child-selection-unavailable",
          targetId: RETAINED_CELL_ID,
          activeChildId: ACTIVE_CHILD_ID,
        },
      });
      expect(editor.state.selection.eq(selectionBefore)).toBe(true);
      editor.destroy();
    },
  );

  it.each([
    {
      kind: "node",
      selectionTarget: (range: { from: number; to: number }) => ({
        kind: "node" as const,
        pos: range.from,
      }),
      expectedSelection: (range: { from: number; to: number }) => ({
        type: "node",
        anchor: range.from,
      }),
    },
    {
      kind: "text",
      selectionTarget: (range: { from: number; to: number }) => ({
        kind: "text" as const,
        from: range.from + 1,
        to: range.from + 1,
      }),
      expectedSelection: (range: { from: number; to: number }) => ({
        type: "text",
        anchor: range.from + 1,
        head: range.from + 1,
      }),
    },
    {
      kind: "near",
      selectionTarget: (range: { from: number; to: number }) => ({
        kind: "near" as const,
        pos: range.from,
      }),
      expectedSelection: (range: { from: number; to: number }) => ({
        type: "text",
        anchor: range.from + 1,
        head: range.from + 1,
      }),
    },
  ])(
    "applies the supplied $kind selection target inside the active child",
    ({ expectedSelection, selectionTarget }) => {
      const editor = makeEditor(twoParagraphCellDocument());
      const activeRange = paragraphRangeByText(editor, "active text");
      editor.commands.setTextSelection(textEndPos(editor, "withheld text"));
      const posAtCoords = vi.spyOn(editor.view, "posAtCoords");

      const handled = applyInteractionActivationIntent(
        editor.view,
        {
          kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
          target: cellRef(editor, RETAINED_CELL_ID),
        },
        mouseDown({ clientX: 12, clientY: 34 }),
        {
          resolveStructuralActivationPlacement: () =>
            retainedActiveParagraphPlacement(editor, selectionTarget(activeRange)),
        },
      );

      expect(handled).toBe(true);
      expect(editor.state.selection.toJSON()).toEqual(expectedSelection(activeRange));
      expect(posAtCoords).not.toHaveBeenCalled();
      posAtCoords.mockRestore();
      editor.destroy();
    },
  );

  it("refuses a retained-child selection that resolves outside the active range", () => {
    const editor = makeEditor(twoParagraphCellDocument());
    editor.commands.setTextSelection(textEndPos(editor, "withheld text"));
    const selectionBefore = editor.state.selection;
    const docBefore = editor.state.doc;
    const ownerBefore = pluginState(editor);
    const activeElementBefore = document.activeElement;
    const withheldRange = paragraphRangeByText(editor, "withheld text");
    const focus = vi.spyOn(editor.view, "focus");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords");

    const outcome = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: cellRef(editor, RETAINED_CELL_ID),
      },
      mouseDown({ clientX: 12, clientY: 34 }),
      {
        resolveStructuralActivationPlacement: () =>
          retainedActiveParagraphPlacement(editor, {
            kind: "near",
            pos: withheldRange.from + 1,
          }),
      },
    );

    expect(outcome).toEqual({
      kind: "placement-unavailable",
      issue: {
        kind: "retained-child-selection-unavailable",
        targetId: RETAINED_CELL_ID,
        activeChildId: ACTIVE_CHILD_ID,
      },
    });
    expect(editor.state.doc).toBe(docBefore);
    expect(editor.state.selection.eq(selectionBefore)).toBe(true);
    expect(pluginState(editor)).toBe(ownerBefore);
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(activeElementBefore);
    expect(posAtCoords).not.toHaveBeenCalled();
    focus.mockRestore();
    posAtCoords.mockRestore();
    editor.destroy();
  });

  it.each(INVALID_RETAINED_TARGET_IDS)(
    "rejects a $label retained-child target before preserving an in-range selection",
    ({ targetId }) => {
      const editor = makeEditor(twoParagraphCellDocument());
      editor.commands.setTextSelection(textEndPos(editor, "active text"));
      const documentBefore = editor.state.doc;
      const selectionBefore = editor.state.selection;
      const ownerBefore = pluginState(editor);

      expect(() =>
        applyInteractionActivationIntent(
          editor.view,
          {
            kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
            target: retainedTargetWithId(editor, targetId),
          },
          mouseDown(),
          {
            resolveStructuralActivationPlacement: () => retainedActiveParagraphPlacement(editor),
          },
        ),
      ).toThrowError("Retained-child structural activation requires a valid embedded node ID.");

      expect(editor.state.doc).toBe(documentBefore);
      expect(editor.state.selection.eq(selectionBefore)).toBe(true);
      expect(pluginState(editor)).toBe(ownerBefore);
      editor.destroy();
    },
  );

  it.each(INVALID_RETAINED_TARGET_IDS)(
    "rejects a $label retained-child target before applying a valid semantic selection",
    ({ targetId }) => {
      const editor = makeEditor(twoParagraphCellDocument());
      editor.commands.setTextSelection(textEndPos(editor, "withheld text"));
      const documentBefore = editor.state.doc;
      const selectionBefore = editor.state.selection;
      const ownerBefore = pluginState(editor);

      expect(() =>
        applyInteractionActivationIntent(
          editor.view,
          {
            kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
            target: retainedTargetWithId(editor, targetId),
          },
          mouseDown(),
          {
            resolveStructuralActivationPlacement: () => retainedActiveParagraphPlacement(editor),
          },
        ),
      ).toThrowError("Retained-child structural activation requires a valid embedded node ID.");

      expect(editor.state.doc).toBe(documentBefore);
      expect(editor.state.selection.eq(selectionBefore)).toBe(true);
      expect(pluginState(editor)).toBe(ownerBefore);
      editor.destroy();
    },
  );

  it.each(INVALID_RETAINED_TARGET_IDS)(
    "rejects a $label retained-child target at the direct transaction boundary",
    ({ targetId }) => {
      const editor = makeEditor(twoParagraphCellDocument());
      editor.commands.setTextSelection(textEndPos(editor, "active text"));

      expect(() =>
        createStructuralInteractionTargetActivationTransaction(
          editor.state,
          retainedTargetWithId(editor, targetId),
          retainedActiveParagraphPlacement(editor),
        ),
      ).toThrowError("Retained-child structural activation requires a valid embedded node ID.");
      editor.destroy();
    },
  );

  it("returns the exact retained-child selection refusal at the direct transaction boundary", () => {
    const editor = makeEditor(twoParagraphCellDocument());
    const withheldRange = paragraphRangeByText(editor, "withheld text");
    editor.commands.setTextSelection(textEndPos(editor, "withheld text"));

    const outcome = createStructuralInteractionTargetActivationTransaction(
      editor.state,
      cellRef(editor, RETAINED_CELL_ID),
      retainedActiveParagraphPlacement(editor, {
        kind: "near",
        pos: withheldRange.from + 1,
      }),
    );

    expect(outcome).toEqual({
      kind: "placement-unavailable",
      issue: {
        kind: "retained-child-selection-unavailable",
        targetId: RETAINED_CELL_ID,
        activeChildId: ACTIVE_CHILD_ID,
      },
    });
    editor.destroy();
  });

  it.each([
    { label: "Block", target: blockRef },
    { label: "Field", target: () => fieldRef() },
  ])("keeps legacy structural activation nullable for a $label target", ({ target }) => {
    const editor = makeEditor();

    expect(
      createInteractionTargetActivationTransaction(editor.state, target(editor), "structural"),
    ).toBeNull();
    editor.destroy();
  });

  it.each([
    { label: "Block", target: blockRef },
    { label: "Field", target: () => fieldRef() },
  ])("rejects a $label target as an explicit structural invariant defect", ({ target }) => {
    const editor = makeEditor();

    expect(() =>
      createStructuralInteractionTargetActivationTransaction(editor.state, target(editor), {
        kind: "pointer-within-target",
      }),
    ).toThrowError("Explicit structural activation requires a structural interaction target.");
    editor.destroy();
  });

  it.each(INVALID_RETAINED_TARGET_IDS)(
    "keeps a $label retained-child target ID failure observable",
    ({ targetId }) => {
      const editor = makeEditor(twoParagraphCellDocument());
      const withheldRange = paragraphRangeByText(editor, "withheld text");
      editor.commands.setTextSelection(textEndPos(editor, "withheld text"));

      expect(() =>
        applyInteractionActivationIntent(
          editor.view,
          {
            kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
            target: retainedTargetWithId(editor, targetId),
          },
          mouseDown(),
          {
            resolveStructuralActivationPlacement: () =>
              retainedActiveParagraphPlacement(editor, {
                kind: "near",
                pos: withheldRange.from + 1,
              }),
          },
        ),
      ).toThrowError("Retained-child structural activation requires a valid embedded node ID.");
      editor.destroy();
    },
  );

  it.each([
    {
      kind: "target-unavailable",
      resolution: {
        kind: "placement-unavailable",
        issue: {
          kind: "target-unavailable",
          targetId: UNAVAILABLE_TARGET_ID,
        },
      } satisfies StructuralActivationPlacementResolution,
    },
    {
      kind: "retained-child-unavailable",
      resolution: {
        kind: "placement-unavailable",
        issue: {
          kind: "retained-child-unavailable",
          targetId: UNAVAILABLE_TARGET_ID,
          activeChildId: ACTIVE_CHILD_ID,
        },
      } satisfies StructuralActivationPlacementResolution,
    },
    {
      kind: "retained-child-selection-unavailable",
      resolution: {
        kind: "placement-unavailable",
        issue: {
          kind: "retained-child-selection-unavailable",
          targetId: UNAVAILABLE_TARGET_ID,
          activeChildId: ACTIVE_CHILD_ID,
        },
      } satisfies StructuralActivationPlacementResolution,
    },
  ])("returns the exact $kind issue without changing editor state", ({ resolution }) => {
    const editor = makeEditor(twoParagraphCellDocument());
    editor.commands.setTextSelection(textEndPos(editor, "active text"));
    const selectionBefore = editor.state.selection;
    const docBefore = editor.state.doc;
    const ownerBefore = pluginState(editor);
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const focus = vi.spyOn(editor.view, "focus");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords");
    const event = mouseDown({ clientX: 12, clientY: 34 });
    const resolveStructuralActivationPlacement = vi.fn(() => resolution);

    const outcome = applyInteractionActivationIntent(
      editor.view,
      {
        kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
        target: cellRef(editor, RETAINED_CELL_ID),
      },
      event,
      { resolveStructuralActivationPlacement },
    );

    expect(outcome).toBe(resolution);
    expect(event.preventDefaultMock).toHaveBeenCalledOnce();
    expect(resolveStructuralActivationPlacement).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(editor.state.doc).toBe(docBefore);
    expect(editor.state.selection.eq(selectionBefore)).toBe(true);
    expect(pluginState(editor)).toBe(ownerBefore);
    expect(posAtCoords).not.toHaveBeenCalled();
    dispatch.mockRestore();
    focus.mockRestore();
    posAtCoords.mockRestore();
    editor.destroy();
  });

  it("keeps a resolver programming defect observable", () => {
    const editor = makeEditor(twoParagraphCellDocument());
    const defect = new Error("structural placement resolver defect");
    const sequence: string[] = [];
    const resolveStructuralActivationPlacement = vi.fn(() => {
      sequence.push("resolver");
      throw defect;
    });
    const event = mouseDown({
      preventDefault: vi.fn(() => sequence.push("preventDefault")),
    });
    const documentBefore = editor.state.doc;
    const selectionBefore = editor.state.selection;
    const ownerBefore = pluginState(editor);
    const activeElementBefore = document.activeElement;
    const dispatch = vi.spyOn(editor.view, "dispatch");
    const focus = vi.spyOn(editor.view, "focus");
    const posAtCoords = vi.spyOn(editor.view, "posAtCoords");

    expect(() =>
      applyInteractionActivationIntent(
        editor.view,
        {
          kind: InteractionDomActivationIntentKind.BlankStructuralSpace,
          target: cellRef(editor, RETAINED_CELL_ID),
        },
        event,
        { resolveStructuralActivationPlacement },
      ),
    ).toThrowError(defect);

    expect(sequence).toEqual(["preventDefault", "resolver"]);
    expect(event.preventDefaultMock).toHaveBeenCalledOnce();
    expect(resolveStructuralActivationPlacement).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    expect(posAtCoords).not.toHaveBeenCalled();
    expect(editor.state.doc).toBe(documentBefore);
    expect(editor.state.selection.eq(selectionBefore)).toBe(true);
    expect(pluginState(editor)).toBe(ownerBefore);
    expect(document.activeElement).toBe(activeElementBefore);
    dispatch.mockRestore();
    focus.mockRestore();
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

// oxlint-disable-next-line no-constant-condition -- compile-time port contract assertion.
if (false) {
  const placement = {} as Extract<
    StructuralActivationPlacementResolution,
    { readonly kind: "retain-active-child" }
  >;
  // @ts-expect-error validated placement range facts remain readonly at the port boundary.
  placement.activeRange.from = 1;
}
