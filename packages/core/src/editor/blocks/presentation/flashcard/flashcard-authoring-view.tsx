import { TrashIcon as Trash } from "@phosphor-icons/react";
import { useEffect, useId, type ReactNode } from "react";
import { NodeViewContent, useEditorState, type NodeViewProps } from "@tiptap/react";

import { ContainedMovementHandle } from "@/editor/drag/view/ContainedMovementHandle";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { FlashcardCardView, FlashcardDeckAuthoring } from "./FlashcardComponents";
import { useFlashcardAuthoringDeckController } from "./flashcard-authoring-controller";
import { FLASHCARD_CARD_NODE, FLASHCARD_NODE, createFlashcardCard } from "./content";
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
        card.classList.toggle("sc-course-flashcard-card", isCurrent);
        card.classList.toggle("sc-course-flashcard-card--inactive", !isCurrent);
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
    <FlashcardDeckAuthoring
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
      renderContent={() => <NodeViewContent className="sc-course-flashcard-content" />}
    />
  );
}

export function FlashcardCardAuthoringView(props: NodeViewProps) {
  const parent = resolveParentFlashcardBlock(props);
  const cardId = readRequiredNodeId(props.node.attrs["id"], "flashcard card");
  const cardIndex = useEditorState({
    editor: props.editor,
    selector: () => resolveCardIndex(props),
  });
  const cardCount = useEditorState({
    editor: props.editor,
    selector: () => resolveCardCount(props),
  });
  const deleteExplanationId = useId();
  const cardPos = readNodeViewPos(props.getPos);
  const canDelete = cardCount > 1;

  const deleteCard = () => {
    const pos = readNodeViewPos(props.getPos);
    if (!canDelete || !isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== FLASHCARD_CARD_NODE) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  return (
    <FlashcardCardView
      editable
      cardId={cardId}
      mountSurface
      authoringChrome={
        <div className="sc-app-flashcard-card-chrome" contentEditable={false}>
          <ContainedMovementHandle
            label={`flashcard card ${cardIndex + 1}`}
            sourcePos={cardPos ?? null}
            getSourcePos={() => readNodeViewPos(props.getPos) ?? null}
            sourceKey={cardId}
            className="sc-app-flashcard-card-movement"
          />
          <button
            type="button"
            contentEditable={false}
            aria-disabled={!canDelete || undefined}
            aria-describedby={!canDelete ? deleteExplanationId : undefined}
            aria-label={`Delete flashcard card ${cardIndex + 1}`}
            onClick={deleteCard}
            className="sc-app-flashcard-card-delete"
          >
            <Trash size={16} aria-hidden />
            {!canDelete ? (
              <span
                id={deleteExplanationId}
                className="sc-app-flashcard-card-delete__explanation"
              >
                A flashcard deck must contain at least one card.
              </span>
            ) : null}
          </button>
        </div>
      }
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
    className: "sc-app-flashcard-add-card",
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

function resolveCardIndex(props: NodeViewProps): number {
  const pos = readNodeViewPos(props.getPos);
  if (!isValidEditorDocPos(props.editor, pos)) return 0;
  return props.editor.state.doc.resolve(pos).index();
}

function resolveCardCount(props: NodeViewProps): number {
  const pos = readNodeViewPos(props.getPos);
  if (!isValidEditorDocPos(props.editor, pos)) return 1;
  return Math.max(props.editor.state.doc.resolve(pos).parent.childCount, 1);
}
