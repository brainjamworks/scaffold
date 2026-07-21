// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { Placeholder } from "@/editor/prosemirror/placeholder/Placeholder";

describe("Placeholder", () => {
  it("shows placeholders only on the textblock containing the cursor when scoped to current selection", () => {
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ undoRedo: false }),
        Placeholder.configure({
          showOnlyCurrent: true,
          includeChildren: true,
          placeholder: "Type / to insert a block",
        }),
      ],
      content: {
        type: "doc",
        content: [{ type: "paragraph" }, { type: "paragraph" }],
      },
    });

    document.body.append(editor.view.dom);
    editor.commands.setTextSelection(1);

    const emptyPlaceholders = editor.view.dom.querySelectorAll(
      'p.is-empty[data-placeholder="Type / to insert a block"]',
    );

    expect(emptyPlaceholders).toHaveLength(1);
    editor.destroy();
  });
});
