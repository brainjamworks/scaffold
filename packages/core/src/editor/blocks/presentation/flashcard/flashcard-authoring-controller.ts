import { useState } from "react";

import type { FlashcardDeckController } from "./FlashcardComponents";
import {
  EMPTY_FLASHCARD_DATA,
  getRelativeFlashcardCardId,
  rateFlashcardDeck,
  readCardSummaries,
  resolveFlashcardDeckState,
  toggleFlashcardFlipped,
  type FlashcardActivityData,
  type FlashcardDeckNodeLike,
  type FlashcardMasteryStatus,
} from "./flashcard-shared";

export function useFlashcardAuthoringDeckController({
  deckNode,
}: {
  deckNode: FlashcardDeckNodeLike;
}): FlashcardDeckController {
  const cardSummaries = readCardSummaries(deckNode);
  const [deck, setDeck] = useState<FlashcardActivityData>(EMPTY_FLASHCARD_DATA);
  const deckState = resolveFlashcardDeckState(cardSummaries, deck);
  const { currentCardId, currentIndex } = deckState;

  const setCurrentCard = (cardId: string | null | undefined) => {
    if (cardId) setDeck((current) => ({ ...current, currentCardId: cardId }));
  };

  const goNext = () => {
    setCurrentCard(getRelativeFlashcardCardId(cardSummaries, currentIndex, 1));
  };

  const goPrev = () => {
    setCurrentCard(getRelativeFlashcardCardId(cardSummaries, currentIndex, -1));
  };

  const resetDeck = () => {
    setDeck(EMPTY_FLASHCARD_DATA);
  };

  const flipCurrent = () => {
    if (!currentCardId) return;
    setDeck((current) => ({
      ...current,
      flipped: toggleFlashcardFlipped(current, currentCardId),
    }));
  };

  const rateCurrent = (status: FlashcardMasteryStatus) => {
    if (!currentCardId) return;
    setDeck(rateFlashcardDeck(cardSummaries, deck, currentCardId, currentIndex, status).data);
  };

  return {
    ...deckState,
    allMastered: false,
    deck,
    cardSummaries,
    resetDeck,
    setCurrentCard,
    flipCurrent,
    goNext,
    goPrev,
    rateCurrent,
  };
}
