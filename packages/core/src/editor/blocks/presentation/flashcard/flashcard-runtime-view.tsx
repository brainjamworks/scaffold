import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { useStatefulBlockSemanticActivationBinding } from "@/document/semantic-target-interaction/use-stateful-block-semantic-activation-binding";

import { FlashcardCardView, FlashcardDeckReader } from "./FlashcardComponents";
import { FLASHCARD_CARD_NODE, FLASHCARD_NODE } from "./content";
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

  useStatefulBlockSemanticActivationBinding({
    childNodeType: FLASHCARD_CARD_NODE,
    editor: props.editor,
    getPos: props.getPos,
    isVisible: (childId) => deckController.currentCardId === childId,
    node: props.node,
    ownerId: blockId,
    ownerNodeType: FLASHCARD_NODE,
    revealChild: (childId) =>
      deckController.setCurrentCard(childId, { origin: "semantic-activation" }),
  });

  return (
    <FlashcardDeckReader
      controller={deckController}
      renderContent={() => <NodeViewContent className="sc-course-flashcard-content" />}
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
