// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it, vi } from "vite-plus/test";

import { preventNativeSelectedBlockDragStart } from "./native-drag-guard";
import { setObjectSelectionInTransaction } from "./selection-transactions";

const TestSelectableBlock = Node.create({
  name: "v2_drag_guard_block",
  group: "block",
  content: "paragraph+",
  defining: true,
  selectable: true,

  parseHTML() {
    return [{ tag: "section[data-v2-drag-guard-block]" }];
  },

  renderHTML() {
    return ["section", { "data-v2-drag-guard-block": "" }, 0];
  },
});

function mountedEditor(): Editor {
  const host = document.createElement("div");
  document.body.appendChild(host);

  return new Editor({
    element: host,
    extensions: [StarterKit.configure({ undoRedo: false }), TestSelectableBlock],
    content: {
      type: "doc",
      content: [
        {
          type: "v2_drag_guard_block",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Inner text" }],
            },
          ],
        },
      ],
    },
  });
}

function blockPos(editor: Editor): number {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (node.type.name === "v2_drag_guard_block") {
      found = pos;
      return false;
    }
    return true;
  });
  if (found < 0) throw new Error("block not found");
  return found;
}

function selectBlock(editor: Editor): void {
  const tr = editor.state.tr;
  if (!setObjectSelectionInTransaction(tr, blockPos(editor))) {
    throw new Error("could not object-select block");
  }
  editor.view.dispatch(tr);
}

function dragEvent(target: EventTarget | null): {
  event: DragEvent;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  return {
    event: { preventDefault, stopPropagation, target } as unknown as DragEvent,
    preventDefault,
    stopPropagation,
  };
}

describe("preventNativeSelectedBlockDragStart", () => {
  it("prevents native drag from the selected block body", () => {
    const editor = mountedEditor();
    selectBlock(editor);
    const surface = editor.view.dom.querySelector("section[data-v2-drag-guard-block]");
    if (!surface) throw new Error("block DOM not found");
    const { event, preventDefault, stopPropagation } = dragEvent(surface);

    expect(preventNativeSelectedBlockDragStart(editor.view, event)).toBe(true);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    editor.destroy();
  });

  it("allows drag started from an explicit drag handle", () => {
    const editor = mountedEditor();
    selectBlock(editor);
    const surface = editor.view.dom.querySelector("section[data-v2-drag-guard-block]");
    if (!surface) throw new Error("block DOM not found");
    const handle = document.createElement("button");
    handle.setAttribute("data-drag-handle", "");
    surface.prepend(handle);
    const { event, preventDefault } = dragEvent(handle);

    expect(preventNativeSelectedBlockDragStart(editor.view, event)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("allows native drag when no object selection is active", () => {
    const editor = mountedEditor();
    const surface = editor.view.dom.querySelector("section[data-v2-drag-guard-block]");
    if (!surface) throw new Error("block DOM not found");
    const { event, preventDefault } = dragEvent(surface);

    expect(preventNativeSelectedBlockDragStart(editor.view, event)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("allows drag events targeting DOM outside the selected node", () => {
    const editor = mountedEditor();
    selectBlock(editor);
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    const { event, preventDefault } = dragEvent(outside);

    expect(preventNativeSelectedBlockDragStart(editor.view, event)).toBe(false);
    expect(preventDefault).not.toHaveBeenCalled();
    editor.destroy();
  });
});
