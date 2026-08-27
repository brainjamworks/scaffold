import { NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { useEffect } from "react";

import { useStatefulBlockSemanticActivationBinding } from "@/document/semantic-target-interaction/use-stateful-block-semantic-activation-binding";

import { FlashcardCardView, FlashcardDeckReader } from "./FlashcardComponents";
import { FLASHCARD_CARD_NODE, FLASHCARD_NODE } from "./content";
import { useFlashcardRuntimeControlBinding } from "./flashcard-control-binding";
import { readRequiredNodeId, resolveParentFlashcardBlock } from "./flashcard-node-view";
import {
  useFlashcardCardController,
  useFlashcardDeckController,
} from "./flashcard-runtime-controller";
import { useFlashcardRuntimePresentation } from "./flashcard-runtime-presentation";

export function FlashcardRuntimeView(props: NodeViewProps) {
  const blockId = readRequiredNodeId(props.node.attrs["id"], "flashcard block");
  const presentation = useFlashcardRuntimePresentation(props.editor, blockId);
  const deckController = useFlashcardDeckController({
    blockId,
    deckNode: props.node,
    editor: props.editor,
    presentation,
  });
  const clearPresentedCard = presentation.setCurrentCardId;

  useEffect(() => () => clearPresentedCard(null), [clearPresentedCard]);

  useFlashcardRuntimeControlBinding({
    editor: props.editor,
    getPos: props.getPos,
    blockId,
    node: props.node,
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
  const presentation = useFlashcardRuntimePresentation(props.editor, blockId ?? cardId);
  const controller = useFlashcardCardController({
    blockId,
    deckNode: parent?.node,
    cardId,
    editor: props.editor,
    presentation,
  });
  return <FlashcardCardView editable={false} cardId={cardId} controller={controller} />;
}
