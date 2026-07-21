// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { isValidDocPos, isValidEditorDocPos } from "./document-position";

function makeEditor() {
  return new Editor({
    extensions: [StarterKit.configure({ undoRedo: false })],
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }],
    },
  });
}

describe("document position validation", () => {
  it("accepts both document boundaries", () => {
    const editor = makeEditor();
    const end = editor.state.doc.content.size;

    expect(isValidDocPos(editor.state.doc, 0)).toBe(true);
    expect(isValidDocPos(editor.state.doc, end)).toBe(true);
    expect(isValidEditorDocPos(editor, 0)).toBe(true);
    expect(isValidEditorDocPos(editor, end)).toBe(true);

    editor.destroy();
  });

  it.each([null, undefined, -1, 0.5])("rejects invalid position %s", (pos) => {
    const editor = makeEditor();

    expect(isValidDocPos(editor.state.doc, pos)).toBe(false);
    expect(isValidEditorDocPos(editor, pos)).toBe(false);

    editor.destroy();
  });

  it("rejects a position past the end of the document", () => {
    const editor = makeEditor();
    const pastEnd = editor.state.doc.content.size + 1;

    expect(isValidDocPos(editor.state.doc, pastEnd)).toBe(false);
    expect(isValidEditorDocPos(editor, pastEnd)).toBe(false);

    editor.destroy();
  });
});
