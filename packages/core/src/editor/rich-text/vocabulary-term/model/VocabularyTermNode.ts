import { mergeAttributes, Node } from "@tiptap/core";

export const VOCABULARY_TERM_NODE_NAME = "vocabTerm";

export interface VocabularyTermAttrs {
  term: string;
  definition: string;
}

export function normalizeVocabularyText(value: unknown): string {
  return String(value ?? "").trim();
}

export function createVocabularyTermNode() {
  return Node.create({
    name: VOCABULARY_TERM_NODE_NAME,
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
      return {
        term: {
          default: "",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-vocab-term") ?? "",
          renderHTML: (attrs: { term: string }) =>
            attrs.term ? { "data-vocab-term": attrs.term } : {},
        },
        definition: {
          default: "",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-vocab-definition") ?? "",
          renderHTML: (attrs: { definition: string }) =>
            attrs.definition
              ? {
                  "data-vocab-definition": attrs.definition,
                  title: attrs.definition,
                }
              : {},
        },
      };
    },

    parseHTML() {
      return [{ tag: 'span[data-type="vocab-term"]' }];
    },

    renderHTML({ HTMLAttributes, node }) {
      return [
        "span",
        mergeAttributes(HTMLAttributes, {
          "data-type": "vocab-term",
          class: "sc-vocabulary-term-static",
        }),
        normalizeVocabularyText(node.attrs["term"]),
      ];
    },
  });
}
