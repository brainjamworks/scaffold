import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { createFlashcardNode } from "./node";
import { FlashcardCardBackNode, FlashcardCardFrontNode, createFlashcardCardNode } from "./slots";
import { flashcardBlockDefinition } from "./flashcard-definition";
import { FlashcardCardRuntimeView, FlashcardRuntimeView } from "./flashcard-runtime-view";

const FlashcardCardRuntimeNode = createFlashcardCardNode({
  addNodeView: () => ReactNodeViewRenderer(FlashcardCardRuntimeView),
});

const FlashcardRuntimeRootNode = createFlashcardNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-flashcard-block",
      definition: flashcardBlockDefinition,
      view: { component: FlashcardRuntimeView },
    }),
});

export const FlashcardRuntimeExtension = Extension.create({
  name: "flashcard_runtime_bundle",

  addExtensions() {
    return [
      FlashcardCardFrontNode,
      FlashcardCardBackNode,
      FlashcardCardRuntimeNode,
      FlashcardRuntimeRootNode,
    ];
  },
});
