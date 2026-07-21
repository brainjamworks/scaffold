// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { Toolbar } from "./Toolbar";

function makeEditor() {
  return new Editor({
    extensions: [StarterKit.configure({ link: false, underline: false, undoRedo: false })],
    content: "<p>Plain text</p>",
  });
}

describe("Toolbar", () => {
  it("exposes a labelled vertical toolbar with grouped controls", () => {
    const editor = makeEditor();

    render(<Toolbar editor={editor} />);

    const toolbar = screen.getByRole("toolbar", {
      name: "Editor formatting",
    });
    expect(toolbar.getAttribute("aria-orientation")).toBe("vertical");

    for (const label of ["History", "Block style", "Formatting cleanup", "Blocks"]) {
      expect(screen.getByRole("group", { name: label })).toBeInTheDocument();
    }

    editor.destroy();
  });

  it("exposes the supported rich-text controls", () => {
    const editor = makeEditor();

    render(<Toolbar editor={editor} />);

    for (const label of [
      "Undo",
      "Redo",
      "Paragraph",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Clear formatting",
      "Bullet list",
      "Numbered list",
      "Quote",
      "Code block",
      "Horizontal rule",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }

    for (const migratedLabel of [
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Inline code",
      "Link",
      "Font size",
      "Text color",
      "Text colour",
      "Highlight",
      "Subscript",
      "Superscript",
      "Inline math",
      "Vocabulary term",
      "Text alignment",
    ]) {
      expect(screen.queryByRole("button", { name: migratedLabel })).toBeNull();
    }

    editor.destroy();
  });

  it("applies block structure controls to the current block", async () => {
    const user = userEvent.setup();
    const editor = makeEditor();

    render(<Toolbar editor={editor} />);

    await user.click(screen.getByRole("button", { name: "Heading 2" }));
    expect(editor.getHTML()).toContain("<h2>Plain text</h2>");

    await user.click(screen.getByRole("button", { name: "Paragraph" }));
    expect(editor.getHTML()).toContain("<p>Plain text</p>");

    await user.click(screen.getByRole("button", { name: "Bullet list" }));
    expect(editor.getHTML()).toContain("<ul>");
    expect(editor.getHTML()).toContain("<li>");

    editor.destroy();
  });

  it("inserts a horizontal rule", async () => {
    const user = userEvent.setup();
    const editor = makeEditor();

    render(<Toolbar editor={editor} />);
    await user.click(screen.getByRole("button", { name: "Horizontal rule" }));

    expect(editor.getHTML()).toContain("<hr>");

    editor.destroy();
  });
});
