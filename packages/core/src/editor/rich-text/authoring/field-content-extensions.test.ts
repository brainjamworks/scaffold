// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vite-plus/test";

import { createFieldContentEditorExtensions } from "./field-content-extensions";

function makeEditor(content?: JSONContent) {
  return new Editor({
    extensions: createFieldContentEditorExtensions(),
    ...(content ? { content } : {}),
  });
}

describe("createFieldContentEditorExtensions", () => {
  it("includes the rich-text node surface needed by content-backed hints", () => {
    const editor = makeEditor();

    expect(editor.schema.nodes["paragraph"]).toBeDefined();
    expect(editor.schema.nodes["heading"]).toBeDefined();
    expect(editor.schema.nodes["bulletList"]).toBeDefined();
    expect(editor.schema.nodes["listItem"]).toBeDefined();
    expect(editor.schema.nodes["blockMath"]).toBeDefined();
    expect(editor.schema.nodes["inlineMath"]).toBeDefined();
    expect(editor.schema.nodes["vocabTerm"]).toBeDefined();
    expect(editor.schema.nodes["inlineIcon"]).toBeDefined();

    editor.destroy();
  });

  it("accepts representative field-content nodes used by assessment hints", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Try " },
            { type: "inlineMath", attrs: { latex: "x>0" } },
            { type: "text", text: " with " },
            {
              type: "vocabTerm",
              attrs: { term: "domain", definition: "Allowed input values" },
            },
            { type: "text", text: " " },
            {
              type: "inlineIcon",
              attrs: {
                value: { kind: "catalog", name: "lightbulb" },
                size: "sm",
              },
            },
          ],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Hint heading" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Check the units" }],
                },
              ],
            },
          ],
        },
        {
          type: "blockMath",
          attrs: { id: "hint-math", latex: "a^2+b^2=c^2" },
        },
      ],
    });

    const json = editor.getJSON();
    const types = JSON.stringify(json);

    expect(types).toContain("paragraph");
    expect(types).toContain("heading");
    expect(types).toContain("bulletList");
    expect(types).toContain("blockMath");
    expect(types).toContain("inlineMath");
    expect(types).toContain("vocabTerm");
    expect(types).toContain("inlineIcon");

    editor.destroy();
  });

  it("shares semantic alignment across nested paragraphs and headings", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        ...(["left", "center", "right", "justify"] as const).map((textAlign) => ({
          type: "paragraph",
          attrs: { textAlign },
          content: [{ type: "text", text: textAlign }],
        })),
        {
          type: "heading",
          attrs: { level: 2, textAlign: "right" },
          content: [{ type: "text", text: "Heading" }],
        },
      ],
    });

    const html = editor.getHTML();
    for (const textAlign of ["left", "center", "right", "justify"]) {
      expect(html).toContain(`data-text-align="${textAlign}"`);
      expect(html).toContain(`text-align: ${textAlign}`);
    }
    expect(editor.schema.nodes["slide_title"]).toBeUndefined();
    editor.destroy();
  });

  it("preserves paragraph alignment when splitting the textblock", () => {
    const editor = makeEditor({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "center" },
          content: [{ type: "text", text: "Before after" }],
        },
      ],
    });

    editor.commands.setTextSelection(7);
    expect(editor.commands.splitBlock()).toBe(true);
    expect(editor.getJSON().content?.map((node) => node.attrs?.["textAlign"])).toEqual([
      "center",
      "center",
    ]);
    editor.destroy();
  });
});
