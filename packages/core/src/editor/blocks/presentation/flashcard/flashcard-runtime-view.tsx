import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { FlashcardCardView, FlashcardDeckReader } from "./FlashcardComponents";
import { readRequiredNodeId, resolveParentFlashcardBlock } from "./flashcard-node-view";
import {
  useFlashcardCardController,
  useFlashcardDeckController,
} from "./flashcard-runtime-controller";

export function FlashcardRuntimeView(props: NodeViewProps) {
  const blockId = readRequiredNodeId(props.node.attrs["id"], "flashcard block");
  const deckController = useFlashcardDeckController({
    blockId,
    deckNode: props.node,
  });

  return (
    <FlashcardDeckReader
      controller={deckController}
      renderContent={() => <NodeViewContent className="sc-flashcard-content" />}
    />
  );
}

export function FlashcardCardRuntimeView(props: NodeViewProps) {
  const parent = resolveParentFlashcardBlock(props);
  const blockId = parent?.id ?? null;
  const cardId = readRequiredNodeId(props.node.attrs["id"], "flashcard card");
  const controller = useFlashcardCardController({
    blockId,
    deckNode: parent?.node,
    cardId,
  });
  return <FlashcardCardView editable={false} cardId={cardId} controller={controller} />;
}
