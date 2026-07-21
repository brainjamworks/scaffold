import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { FlashcardDataSchema, type FlashcardData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { FLASHCARD_CARD_NODE, FLASHCARD_NODE, emptyFlashcardData } from "./content";

export interface FlashcardNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createFlashcardNode(options: FlashcardNodeOptions = {}) {
  return Node.create({
    name: FLASHCARD_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${FLASHCARD_CARD_NODE}+`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyFlashcardData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-flashcard");
            if (!raw) return emptyFlashcardData();
            try {
              const parsed = FlashcardDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyFlashcardData();
            } catch {
              return emptyFlashcardData();
            }
          },
          renderHTML: (attrs: { data: FlashcardData }) => ({
            "data-flashcard": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="flashcard"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-node": "flashcard" }), 0];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export const FlashcardNode = createFlashcardNode();
