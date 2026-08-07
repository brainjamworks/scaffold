import { useId, type ReactNode } from "react";

import type { InteractionDragEvent } from "@/editor/interactions/drag/model/interaction-drag-event";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionSortable } from "@/editor/interactions/drag/react/use-interaction-sortable";

import "./FlashcardAuthoringControls.css";

export interface FlashcardFilmstripCard {
  readonly frontText: string;
  readonly id: string;
}

export function FlashcardFilmstrip({
  addCard,
  cards,
  currentCardId,
  onReorder,
  onSelect,
}: {
  readonly addCard?: ReactNode;
  readonly cards: readonly FlashcardFilmstripCard[];
  readonly currentCardId: string | null;
  readonly onReorder: (sourceId: string, targetId: string) => void;
  readonly onSelect: (cardId: string) => void;
}) {
  const sessionId = useId();
  const handleDragEnd = (
    event: InteractionDragEvent<FlashcardFilmstripDragData, FlashcardFilmstripDragData>,
  ) => {
    const targetIndex = event.active.sortable?.index ?? -1;
    const targetId = cards[targetIndex]?.id ?? null;
    const sourceId = event.active.data.id;
    if (!targetId || sourceId === targetId) return;
    onReorder(sourceId, targetId);
  };

  return (
    <InteractionDragSession<FlashcardFilmstripDragData, FlashcardFilmstripDragData>
      accessibilityMode="sortable"
      collisionPolicy="closest-center"
      labels={{
        draggable: "Flashcard",
        instructions: "Use the left and right arrow keys to reorder the flashcard.",
      }}
      onEnd={handleDragEnd}
      profile="sortable-horizontal"
      renderPreview={(active) => <FlashcardFilmstripPreview data={active} />}
      sessionId={`flashcard-filmstrip-${sessionId}`}
    >
      <div
        aria-label="Flashcard card order"
        className="sc-app-flashcard-filmstrip"
        contentEditable={false}
        data-flashcard-filmstrip=""
        role="list"
      >
        <div className="sc-app-flashcard-filmstrip__cards">
          {cards.map((card, index) => (
            <FlashcardFilmstripItem
              key={card.id}
              card={card}
              current={card.id === currentCardId}
              index={index}
              onSelect={onSelect}
            />
          ))}
        </div>
        {addCard ? <div className="sc-app-flashcard-filmstrip__add">{addCard}</div> : null}
      </div>
    </InteractionDragSession>
  );
}

interface FlashcardFilmstripDragData extends FlashcardFilmstripCard {
  readonly index: number;
}

function FlashcardFilmstripItem({
  card,
  current,
  index,
  onSelect,
}: {
  readonly card: FlashcardFilmstripCard;
  readonly current: boolean;
  readonly index: number;
  readonly onSelect: (cardId: string) => void;
}) {
  const data: FlashcardFilmstripDragData = { ...card, index };
  const sortable = useInteractionSortable<FlashcardFilmstripDragData>({
    data,
    id: card.id,
    index,
    label: `Drag flashcard ${index + 1}`,
  });

  return (
    <div
      ref={sortable.sourceRef}
      className="sc-app-flashcard-filmstrip__card"
      data-current={current ? "true" : undefined}
      data-dragging={sortable.isDragging ? "true" : undefined}
      data-flashcard-filmstrip-card={card.id}
      data-interaction-drag-placeholder={sortable.isPlaceholder ? "" : undefined}
      role="listitem"
    >
      <InteractionDragActivationArea
        ref={sortable.handleRef}
        aria-current={current ? "true" : undefined}
        aria-label={`Card ${index + 1}: ${previewText(card.frontText)}. Drag to reorder`}
        className="sc-app-flashcard-filmstrip__button"
        data-flashcard-filmstrip-drag-handle=""
        onClick={() => onSelect(card.id)}
        safeLocalHeight={44}
        safeLocalWidth={44}
      >
        <FlashcardFilmstripCardFace data={data} />
      </InteractionDragActivationArea>
    </div>
  );
}

function FlashcardFilmstripPreview({ data }: { readonly data: FlashcardFilmstripDragData }) {
  return (
    <div
      className="sc-app-flashcard-filmstrip__card sc-app-flashcard-filmstrip__card--preview"
      data-flashcard-filmstrip-preview={data.id}
    >
      <FlashcardFilmstripCardFace data={data} />
    </div>
  );
}

function FlashcardFilmstripCardFace({ data }: { readonly data: FlashcardFilmstripDragData }) {
  return (
    <>
      <span className="sc-app-flashcard-filmstrip__number" aria-hidden>
        {String(data.index + 1).padStart(2, "0")}
      </span>
      <span className="sc-app-flashcard-filmstrip__text">{previewText(data.frontText)}</span>
    </>
  );
}

function previewText(value: string): string {
  return value.trim() || "Blank front";
}
