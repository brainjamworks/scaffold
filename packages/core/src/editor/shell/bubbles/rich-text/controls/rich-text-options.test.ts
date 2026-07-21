// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  FONT_SIZE_OPTIONS,
  RICH_TEXT_INLINE_COMMANDS,
  isRichTextInlineCommandActive,
  isRichTextInlineCommandAvailable,
  runRichTextInlineCommand,
} from "./rich-text-options";

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor() {
  editor = new Editor({
    extensions: [StarterKit.configure({ underline: false }), Underline, Subscript, Superscript],
    content: "<p>Plain text</p>",
  });
  return editor;
}

function selectText(currentEditor: Editor, text: string) {
  let from: number | null = null;

  currentEditor.state.doc.descendants((node, pos) => {
    if (from !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;
    from = pos + index;
    return false;
  });

  if (from === null) throw new Error(`Text not found: ${text}`);
  currentEditor.commands.setTextSelection({ from, to: from + text.length });
}

describe("rich text control options", () => {
  it("defines the inline command set expected by toolbar and bubble controls", () => {
    expect(RICH_TEXT_INLINE_COMMANDS.map((command) => command.id)).toEqual([
      "bold",
      "italic",
      "underline",
      "strike",
      "code",
      "subscript",
      "superscript",
    ]);
  });

  it("keeps author-facing font size choices in one shared place", () => {
    expect(FONT_SIZE_OPTIONS.map((option) => option.value)).toContain("18px");
  });

  it("runs inline commands against the current ProseMirror selection", () => {
    const currentEditor = makeEditor();
    selectText(currentEditor, "Plain");

    expect(isRichTextInlineCommandAvailable(currentEditor, "bold")).toBe(true);
    expect(runRichTextInlineCommand(currentEditor, "bold")).toBe(true);
    expect(isRichTextInlineCommandActive(currentEditor, "bold")).toBe(true);
    expect(currentEditor.getHTML()).toContain("<strong>Plain</strong>");

    expect(runRichTextInlineCommand(currentEditor, "underline")).toBe(true);
    expect(currentEditor.getHTML()).toContain("<u>");
  });
});
