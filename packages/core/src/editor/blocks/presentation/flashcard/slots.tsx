import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import {
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_CARD_NODE,
} from "./content";

import "./flashcard.css";

const FLASHCARD_SIDE_CONTENT = "block+";

export interface FlashcardCardNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createFlashcardCardNode(options: FlashcardCardNodeOptions = {}) {
  return Node.create({
    name: FLASHCARD_CARD_NODE,
    content: `${FLASHCARD_CARD_FRONT_NODE} ${FLASHCARD_CARD_BACK_NODE}`,
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="flashcard-card"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-node": "flashcard-card",
        }),
        0,
      ];
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

export const FlashcardCardNode = createFlashcardCardNode();

export const FlashcardCardFrontNode = Node.create({
  name: FLASHCARD_CARD_FRONT_NODE,
  content: FLASHCARD_SIDE_CONTENT,
  defining: true,
  isolating: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="flashcard-card-front"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "flashcard-card-front",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlashcardCardFrontView);
  },
});

export const FlashcardCardBackNode = Node.create({
  name: FLASHCARD_CARD_BACK_NODE,
  content: FLASHCARD_SIDE_CONTENT,
  defining: true,
  isolating: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="flashcard-card-back"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "flashcard-card-back",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlashcardCardBackView);
  },
});

function FlashcardCardFrontView() {
  return (
    <NodeViewWrapper
      data-slot="flashcard-card-front"
      className="sc-flashcard-side sc-flashcard-side--front"
    >
      <FaceCaption side="Front" />
      <div className="sc-flashcard-side__inner">
        <div className="sc-flashcard-side__content sc-flashcard-side__content--front">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function FlashcardCardBackView() {
  return (
    <NodeViewWrapper
      data-slot="flashcard-card-back"
      className="sc-flashcard-side sc-flashcard-side--back"
    >
      <FaceCaption side="Back" />
      <div className="sc-flashcard-side__inner">
        <div className="sc-flashcard-side__content sc-flashcard-side__content--back">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function FaceCaption({ side }: { side: "Front" | "Back" }) {
  return (
    <span
      contentEditable={false}
      aria-hidden
      data-scaffold-card-no-flip
      className="sc-flashcard-side__caption"
    >
      {side}
    </span>
  );
}
