// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { TEXT_CONTENT } from "@/document/model/content-model/content-groups";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";

import { MathBlockNode } from "../model/MathBlock";
import { MathInlineNode } from "./MathInlineNodeView";

function makeEditor() {
  return new Editor({
    extensions: [
      StarterKit.configure({ undoRedo: false, paragraph: false }),
      ExtendedParagraph,
      MathBlockNode,
      MathInlineNode,
    ],
  });
}

describe("math nodes", () => {
  it("marks block math as text content", () => {
    const editor = makeEditor();

    expect(editor.schema.nodes["blockMath"]?.spec.group).toBe(`block ${TEXT_CONTENT}`);

    editor.destroy();
  });

  it("blockMath round-trips latex attr", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "blockMath",
          attrs: { id: "block-math", latex: "a^2 + b^2 = c^2" },
        },
      ],
    });
    const top = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(top?.attrs?.["id"]).toBe("block-math");
    expect(top?.attrs?.["latex"]).toBe("a^2 + b^2 = c^2");
    editor.destroy();
  });

  it("inlineMath lives inside a paragraph", () => {
    const editor = makeEditor();
    editor.commands.setContent({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "when " },
            { type: "inlineMath", attrs: { latex: "x>0" } },
            { type: "text", text: " the function..." },
          ],
        },
      ],
    });
    const para = editor.getJSON().content?.[0] as JSONContent | undefined;
    expect(para?.type).toBe("paragraph");
    const types = (para?.content ?? []).map((c) => c.type);
    expect(types).toContain("inlineMath");
    editor.destroy();
  });
});
