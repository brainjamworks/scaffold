// @vitest-environment happy-dom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { VocabularyTermStaticNode } from "./VocabularyTermStaticNode";

describe("VocabularyTermStaticNode", () => {
  it("preserves the persisted node name, attributes, and visible static term", () => {
    const editor = new Editor({
      extensions: [StarterKit, VocabularyTermStaticNode],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "vocabTerm",
                attrs: {
                  term: "schema",
                  definition: "A structural contract for content.",
                },
              },
            ],
          },
        ],
      },
    });

    expect(editor.schema.nodes["vocabTerm"]?.spec).toMatchObject({
      atom: true,
      inline: true,
      selectable: true,
    });
    expect(editor.getHTML()).toContain('data-type="vocab-term"');
    expect(editor.getHTML()).toContain('data-vocab-term="schema"');
    expect(editor.getHTML()).toContain(
      'data-vocab-definition="A structural contract for content."',
    );
    expect(editor.getHTML()).toContain('title="A structural contract for content."');
    expect(editor.getHTML()).toContain('class="sc-vocabulary-term-static"');
    expect(editor.getHTML()).toContain(">schema</span>");

    editor.destroy();
  });
});
