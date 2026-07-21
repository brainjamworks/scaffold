// @vitest-environment happy-dom

import { Editor, Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { isNodeSelection, isTextSelection } from "./selection-facts";
import {
  clearObjectSelectionToNonDestructiveSelectionInTransaction,
  setNonDestructiveSelectionNearInTransaction,
  setNonDestructiveSelectionNearWithinRangeInTransaction,
  setObjectSelectionInTransaction,
} from "./selection-transactions";

const TestStructuralContainer = Node.create({
  name: "v2_tx_container",
  group: "block",
  content: "block+",
  defining: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "div[data-v2-tx-container]" }];
  },

  renderHTML() {
    return ["div", { "data-v2-tx-container": "" }, 0];
  },
});

function makeEditor(content?: JSONContent): Editor {
  return new Editor({
    extensions: [StarterKit.configure({ undoRedo: false }), TestStructuralContainer],
    content: content ?? {
      type: "doc",
      content: [
        {
          type: "v2_tx_container",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Inner text" }],
            },
          ],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "After text" }],
        },
      ],
    },
  });
}

function testDocWithNonTextContainer(): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "v2_tx_container",
        content: [{ type: "horizontalRule" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "After text" }],
      },
    ],
  };
}

function containerPos(editor: Editor): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === "v2_tx_container") {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error("container not found");
  return found;
}

function containerRange(editor: Editor): { from: number; to: number } {
  const from = containerPos(editor);
  const node = editor.state.doc.nodeAt(from);
  if (!node) throw new Error("container not found");
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
  if (found < 0) throw new Error(`text not found: ${text}`);
  return found;
}

describe("setObjectSelectionInTransaction", () => {
  it("sets a deliberate object selection on a selectable node", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    expect(setObjectSelectionInTransaction(tr, containerPos(editor))).toBe(true);
    expect(isNodeSelection(tr.selection)).toBe(true);
    editor.destroy();
  });

  it("rejects invalid object selection positions", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    expect(setObjectSelectionInTransaction(tr, editor.state.doc.content.size + 5)).toBe(false);
    expect(isNodeSelection(tr.selection)).toBe(false);
    editor.destroy();
  });
});

describe("setNonDestructiveSelectionNearInTransaction", () => {
  it("moves selection to a nearby text caret, never an object selection", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    expect(setNonDestructiveSelectionNearInTransaction(tr, containerPos(editor))).toBe(true);
    expect(isTextSelection(tr.selection)).toBe(true);
    expect(tr.selection.empty).toBe(true);
    editor.destroy();
  });

  it("supports backward bias", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    expect(setNonDestructiveSelectionNearInTransaction(tr, editor.state.doc.content.size, -1)).toBe(
      true,
    );
    expect(isTextSelection(tr.selection)).toBe(true);
    editor.destroy();
  });

  it("rejects out-of-range positions", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;

    expect(
      setNonDestructiveSelectionNearInTransaction(tr, editor.state.doc.content.size + 10),
    ).toBe(false);
    editor.destroy();
  });
});

describe("setNonDestructiveSelectionNearWithinRangeInTransaction", () => {
  it("keeps nearby caret repair inside the requested range", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;
    const range = containerRange(editor);

    expect(setNonDestructiveSelectionNearWithinRangeInTransaction(tr, range.to - 1, range)).toBe(
      true,
    );
    expect(isTextSelection(tr.selection)).toBe(true);
    expect(tr.selection.from).toBeGreaterThan(range.from);
    expect(tr.selection.to).toBeLessThan(range.to);
    editor.destroy();
  });

  it("rejects a nearby caret that escapes to a sibling range", () => {
    const editor = makeEditor(testDocWithNonTextContainer());
    const tr = editor.state.tr;
    const range = containerRange(editor);
    const before = tr.selection;

    expect(
      setNonDestructiveSelectionNearWithinRangeInTransaction(
        tr,
        textEndPos(editor, "After text"),
        range,
      ),
    ).toBe(false);
    expect(tr.selection).toBe(before);
    editor.destroy();
  });
});

describe("clearObjectSelectionToNonDestructiveSelectionInTransaction", () => {
  it("clears an object selection to a nearby text caret", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;
    expect(setObjectSelectionInTransaction(tr, containerPos(editor))).toBe(true);

    expect(clearObjectSelectionToNonDestructiveSelectionInTransaction(tr)).toBe(true);
    expect(isNodeSelection(tr.selection)).toBe(false);
    expect(isTextSelection(tr.selection)).toBe(true);
    expect(tr.selection.empty).toBe(true);
    editor.destroy();
  });

  it("leaves non-object selections untouched", () => {
    const editor = makeEditor();
    const tr = editor.state.tr;
    const before = tr.selection;

    expect(clearObjectSelectionToNonDestructiveSelectionInTransaction(tr)).toBe(false);
    expect(tr.selection).toBe(before);
    editor.destroy();
  });
});
