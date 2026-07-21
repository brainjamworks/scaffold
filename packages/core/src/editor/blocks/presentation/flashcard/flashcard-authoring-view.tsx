import { useEffect, type ReactNode } from "react";
import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { FlashcardCardView, FlashcardDeckReader } from "./FlashcardComponents";
import { useFlashcardAuthoringDeckController } from "./flashcard-authoring-controller";
import { FLASHCARD_NODE, createFlashcardCard } from "./content";
import {
  readNodeViewPos,
  readRequiredNodeId,
  resolveParentFlashcardBlock,
} from "./flashcard-node-view";

export interface FlashcardAddControlProps {
  className: string;
  label: string;
  onClick: () => void;
}

export type FlashcardAddControlRenderer = (props: FlashcardAddControlProps) => ReactNode;

export interface FlashcardAuthoringViewProps extends NodeViewProps {
  renderAddControl?: FlashcardAddControlRenderer;
}

export function FlashcardAuthoringView(props: FlashcardAuthoringViewProps) {
  const deckController = useFlashcardAuthoringDeckController({
    deckNode: props.node,
  });

  useEffect(() => {
    const root = resolveNodeViewElement(props);
    if (!root) return;

    const syncCards = () => {
      for (const card of root.querySelectorAll<HTMLElement>('[data-node="flashcard-card"]')) {
        const isCurrent = card.dataset["id"] === deckController.currentCardId;
        card.classList.toggle("sc-flashcard-card", isCurrent);
        card.classList.toggle("sc-flashcard-card--inactive", !isCurrent);
        if (isCurrent) {
          card.dataset["flashcardFlipped"] = deckController.currentFlipped ? "true" : "false";
        }
      }
    };
    const handleCardFlip = () => deckController.flipCurrent();

    syncCards();
    root.addEventListener(AUTHORING_CARD_FLIP_EVENT, handleCardFlip);
    return () => root.removeEventListener(AUTHORING_CARD_FLIP_EVENT, handleCardFlip);
  }, [deckController, props]);

  return (
    <FlashcardDeckReader
      controller={{
        ...deckController,
        allMastered: false,
      }}
      addCard={
        props.renderAddControl ? (
          <FlashcardAddCard
            props={props}
            onCardAdded={deckController.setCurrentCard}
            renderAddControl={props.renderAddControl}
          />
        ) : null
      }
      renderContent={() => <NodeViewContent className="sc-flashcard-content" />}
    />
  );
}

export function FlashcardCardAuthoringView(props: NodeViewProps) {
  const parent = resolveParentFlashcardBlock(props);
  const cardId = readRequiredNodeId(props.node.attrs["id"], "flashcard card");
  return (
    <FlashcardCardView
      editable
      cardId={cardId}
      controller={{
        flipped: false,
        mastery: undefined,
        isCurrent: parent?.node.firstChild?.attrs["id"] === cardId,
        flip: () => {
          resolveNodeViewElement(props)?.dispatchEvent(
            new CustomEvent(AUTHORING_CARD_FLIP_EVENT, { bubbles: true }),
          );
        },
      }}
    />
  );
}

function FlashcardAddCard({
  onCardAdded,
  props,
  renderAddControl,
}: {
  onCardAdded: (cardId: string | null | undefined) => void;
  props: NodeViewProps;
  renderAddControl: FlashcardAddControlRenderer;
}) {
  const addCard = () => {
    const pos = readNodeViewPos(props.getPos);
    if (!isValidEditorDocPos(props.editor, pos)) return;

    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== FLASHCARD_NODE) return;

    const card = createFlashcardCard();
    const cardId = typeof card.attrs?.["id"] === "string" ? card.attrs["id"] : null;

    const inserted = props.editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize - 1, card)
      .run();

    if (inserted) onCardAdded(cardId);
  };

  return renderAddControl({
    className: "sc-flashcard-add-card",
    label: "Add card",
    onClick: addCard,
  });
}

const AUTHORING_CARD_FLIP_EVENT = "scaffold:flashcard-authoring-flip";

function resolveNodeViewElement(props: NodeViewProps): HTMLElement | null {
  const pos = readNodeViewPos(props.getPos);
  if (!isValidEditorDocPos(props.editor, pos)) return null;
  const node = props.editor.view.nodeDOM(pos);
  return node instanceof HTMLElement ? node : null;
}
