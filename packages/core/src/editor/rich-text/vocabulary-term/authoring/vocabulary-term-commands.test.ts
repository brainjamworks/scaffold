// @vitest-environment happy-dom

import { Editor, Node } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vite-plus/test";

import { VocabularyTermAuthoringNode } from "./VocabularyTermAuthoringNode";
import {
  applyVocabularyTermToEditor,
  canApplyVocabularyTermToEditor,
  resolveVocabularyTermTarget,
  selectedVocabularyTerm,
} from "./vocabulary-term-commands";

const NestedFieldNode = Node.create({
  name: "vocabulary_test_field",
  group: "block",
  content: "paragraph+",
  parseHTML() {
    return [{ tag: 'div[data-vocabulary-test-field="true"]' }];
  },
  renderHTML() {
    return ["div", { "data-vocabulary-test-field": "true" }, 0];
  },
});

function makeNestedFieldEditor() {
  return new Editor({
    extensions: [StarterKit, NestedFieldNode, VocabularyTermAuthoringNode],
    content: {
      type: "doc",
      content: [
        {
          type: "vocabulary_test_field",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Nested field text" }],
            },
          ],
        },
      ],
    },
  });
}

function selectText(editor: Editor, text: string) {
  let from: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (from !== null) return false;
    if (!node.isText) return true;
    const index = node.text?.indexOf(text) ?? -1;
    if (index === -1) return true;
    from = pos + index;
    return false;
  });

  if (from === null) throw new Error(`Text not found: ${text}`);
  editor.commands.setTextSelection({ from, to: from + text.length });
}

describe("vocabulary term authoring commands", () => {
  it("inserts and updates a vocabulary term inside nested field content", () => {
    const editor = makeNestedFieldEditor();

    selectText(editor, "field");
    expect(canApplyVocabularyTermToEditor(editor)).toBe(true);
    const target = resolveVocabularyTermTarget(editor);
    expect(
      applyVocabularyTermToEditor(editor, target, {
        term: "field",
        definition: "A nested rich-text authoring area.",
      }),
    ).toBe(true);

    const selected = selectedVocabularyTerm(editor);
    expect(selected).toMatchObject({
      mode: "update",
      term: "field",
      definition: "A nested rich-text authoring area.",
    });
    expect(
      selected
        ? applyVocabularyTermToEditor(editor, selected, {
            term: "nested field",
            definition: "Updated definition.",
          })
        : false,
    ).toBe(true);

    const field = editor.getJSON().content?.[0] as JSONContent | undefined;
    const paragraph = field?.content?.[0] as JSONContent | undefined;
    expect(paragraph?.content?.[1]).toMatchObject({
      type: "vocabTerm",
      attrs: {
        term: "nested field",
        definition: "Updated definition.",
      },
    });
    editor.destroy();
  });
});
