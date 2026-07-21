import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { renderFlashcardAddControl } from "./flashcard-authoring-controls";
import { FlashcardAuthoringView, FlashcardCardAuthoringView } from "./flashcard-authoring-view";
import { createFlashcardNode } from "./node";
import { FlashcardCardBackNode, FlashcardCardFrontNode, createFlashcardCardNode } from "./slots";
import { flashcardBlockDefinition } from "./flashcard-definition";

function FlashcardAuthoringRootView(props: NodeViewProps) {
  return <FlashcardAuthoringView {...props} renderAddControl={renderFlashcardAddControl} />;
}

const FlashcardCardAuthoringNode = createFlashcardCardNode({
  addNodeView: () => ReactNodeViewRenderer(FlashcardCardAuthoringView),
});

const FlashcardAuthoringRootNode = createFlashcardNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-flashcard-block",
      definition: flashcardBlockDefinition,
      view: { component: FlashcardAuthoringRootView },
    }),
});

export const FlashcardAuthoringExtension = Extension.create({
  name: "flashcard_authoring_bundle",

  addExtensions() {
    return [
      FlashcardCardFrontNode,
      FlashcardCardBackNode,
      FlashcardCardAuthoringNode,
      FlashcardAuthoringRootNode,
    ];
  },
});
