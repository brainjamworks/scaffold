// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { currentNodeViewPos, safeGetPos } from "./node-view-position";

function makeEditor() {
  return new Editor({
    extensions: [StarterKit.configure({ undoRedo: false })],
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
    },
  });
}

describe("safeGetPos", () => {
  it("returns undefined when getPos is unavailable or throws", () => {
    expect(safeGetPos(() => undefined)).toBeUndefined();
    expect(
      safeGetPos(() => {
        throw new Error("detached node view");
      }),
    ).toBeUndefined();
  });
});

describe("currentNodeViewPos", () => {
  it("returns the current position only when the node type matches", () => {
    const editor = makeEditor();

    expect(currentNodeViewPos(editor, () => 0, "paragraph")).toBe(0);
    expect(currentNodeViewPos(editor, () => 0, "heading")).toBeNull();

    editor.destroy();
  });

  it("rejects unavailable and boundary positions without a matching node", () => {
    const editor = makeEditor();
    const end = editor.state.doc.content.size;

    expect(currentNodeViewPos(editor, () => undefined, "paragraph")).toBeNull();
    expect(
      currentNodeViewPos(
        editor,
        () => {
          throw new Error("detached node view");
        },
        "paragraph",
      ),
    ).toBeNull();
    expect(currentNodeViewPos(editor, () => end, "paragraph")).toBeNull();

    editor.destroy();
  });
});
