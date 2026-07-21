// @vitest-environment happy-dom

import { Editor, type Content } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import {
  SCAFFOLD_TEXT_ALIGNMENTS,
  createScaffoldTextAlignExtension,
  readTextBlockHorizontalAlignment,
  setTextBlockHorizontalAlignmentInTransaction,
} from "./text-alignment";

function makeEditor(content: Content): Editor {
  return new Editor({
    extensions: [StarterKit, createScaffoldTextAlignExtension(["paragraph", "heading"])],
    content,
  });
}

describe("Scaffold text alignment", () => {
  it("installs the native attr with Left as the default", () => {
    const editor = makeEditor({ type: "doc", content: [{ type: "paragraph" }] });

    expect(SCAFFOLD_TEXT_ALIGNMENTS).toEqual(["left", "center", "right", "justify"]);
    expect(editor.schema.nodes["paragraph"]?.create().attrs["textAlign"]).toBe("left");
    expect(editor.schema.nodes["heading"]?.create().attrs["textAlign"]).toBe("left");
    editor.destroy();
  });

  it("round-trips JSON and semantic HTML for all native values", () => {
    const editor = makeEditor({
      type: "doc",
      content: SCAFFOLD_TEXT_ALIGNMENTS.map((textAlign) => ({
        type: "paragraph",
        attrs: { textAlign },
        content: [{ type: "text", text: textAlign }],
      })),
    });

    const html = editor.getHTML();
    for (const textAlign of SCAFFOLD_TEXT_ALIGNMENTS) {
      expect(html).toContain(`data-text-align="${textAlign}"`);
      expect(html).toContain(`text-align: ${textAlign}`);
    }

    const reparsed = makeEditor(html);
    expect(reparsed.getJSON().content?.map((node) => node.attrs?.["textAlign"])).toEqual(
      SCAFFOLD_TEXT_ALIGNMENTS,
    );
    editor.destroy();
    reparsed.destroy();
  });

  it("reads native alignment and preserves Justify outside the common command set", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        { type: "paragraph", attrs: { textAlign: "justify" } },
        { type: "heading", attrs: { level: 2, textAlign: "center" } },
      ],
    });

    expect(readTextBlockHorizontalAlignment(editor.state.doc.nodeAt(0)!)).toBe("justify");
    expect(readTextBlockHorizontalAlignment(editor.state.doc.nodeAt(2)!)).toBe("center");
    editor.destroy();
  });

  it("composes common mutations while preserving unrelated textblock attrs", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Title" }],
        },
      ],
    });
    const tr = editor.state.tr;

    expect(setTextBlockHorizontalAlignmentInTransaction(tr, 0, "right")).toBe(tr);
    expect(tr.doc.nodeAt(0)?.attrs).toMatchObject({ level: 3, textAlign: "right" });
    editor.destroy();
  });

  it("rejects invalid positions, node types, values, and no-op mutations", () => {
    const editor = makeEditor({
      type: "doc",
      content: [{ type: "horizontalRule" }, { type: "paragraph", attrs: { textAlign: "left" } }],
    });

    expect(setTextBlockHorizontalAlignmentInTransaction(editor.state.tr, -1, "center")).toBeNull();
    expect(setTextBlockHorizontalAlignmentInTransaction(editor.state.tr, 0, "center")).toBeNull();
    expect(
      setTextBlockHorizontalAlignmentInTransaction(editor.state.tr, 1, "top" as "left"),
    ).toBeNull();
    expect(setTextBlockHorizontalAlignmentInTransaction(editor.state.tr, 1, "left")).toBeNull();
    expect(readTextBlockHorizontalAlignment(editor.state.doc.nodeAt(0)!)).toBeNull();
    editor.destroy();
  });
});
