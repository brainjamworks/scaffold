import { useEffect } from "react";

import type { LearnerActivityData } from "@scaffold/contracts";
import { useLearnerActivityRuntime } from "@/runtime/learner-activity";

import type { FlashcardCardController, FlashcardDeckController } from "./FlashcardComponents";
import {
  EMPTY_FLASHCARD_DATA,
  FLASHCARD_INITIAL_ACTIVITY,
  getRelativeFlashcardCardId,
  isCurrentFlashcardCard,
  rateFlashcardDeck,
  readCardSummaries,
  readFlashcardData,
  resolveFlashcardDeckState,
  resolveFlashcardKeyboardAction,
  toggleFlashcardFlipped,
  type FlashcardActivityData,
  type FlashcardDeckNodeLike,
  type FlashcardMasteryStatus,
} from "./flashcard-shared";

export function useFlashcardDeckController({
  blockId,
  deckNode,
}: {
  blockId: string;
  deckNode: FlashcardDeckNodeLike;
}): FlashcardDeckController {
  const cardSummaries = readCardSummaries(deckNode);
  const activity = useLearnerActivityRuntime({
    activityKind: "flashcard",
    blockId,
    initial: {
      data: flashcardDataForPersistence(FLASHCARD_INITIAL_ACTIVITY.data, cardSummaries.length),
      completed: FLASHCARD_INITIAL_ACTIVITY.completed,
    },
  });
  const deck = readFlashcardData(activity.activity?.data);
  const deckState = resolveFlashcardDeckState(cardSummaries, deck);
  const { currentCardId, currentIndex } = deckState;

  const setCurrentCard = (cardId: string | null | undefined) => {
    if (cardId) activity.patchData({ currentCardId: cardId });
  };

  const goNext = () => {
    setCurrentCard(getRelativeFlashcardCardId(cardSummaries, currentIndex, 1));
  };

  const goPrev = () => {
    setCurrentCard(getRelativeFlashcardCardId(cardSummaries, currentIndex, -1));
  };

  const resetDeck = () => {
    activity.setData(flashcardDataForPersistence(EMPTY_FLASHCARD_DATA, cardSummaries.length));
    activity.setCompleted(false);
  };

  const flipCurrent = () => {
    if (!currentCardId) return;
    const flipped = toggleFlashcardFlipped(deck, currentCardId);
    activity.updateActivity({
      data: flashcardDataForPersistence({ ...deck, flipped }, cardSummaries.length),
      completed: activity.activity?.completed ?? false,
      xapiEvent: {
        kind: "flashcard-flipped",
        cardId: currentCardId,
        face: flipped[currentCardId] ? "back" : "front",
      },
    });
  };

  const rateCurrent = (status: FlashcardMasteryStatus) => {
    if (!currentCardId) return;
    const result = rateFlashcardDeck(cardSummaries, deck, currentCardId, currentIndex, status);
    const masteredCount = cardSummaries.filter(
      (card) => result.data.mastery[card.id] === "gotIt",
    ).length;
    activity.updateActivity({
      data: flashcardDataForPersistence(result.data, cardSummaries.length),
      completed: result.completed,
      xapiEvent: {
        kind: "flashcard-rated",
        cardId: currentCardId,
        rating: status === "gotIt" ? "got-it" : "not-yet",
        masteredCount,
        total: cardSummaries.length,
      },
    });
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const action = resolveFlashcardKeyboardAction(event);
      if (!action) return;

      switch (action) {
        case "next":
          event.preventDefault();
          goNext();
          break;
        case "previous":
          event.preventDefault();
          goPrev();
          break;
        case "flip":
          event.preventDefault();
          flipCurrent();
          break;
        case "gotIt":
          event.preventDefault();
          rateCurrent("gotIt");
          break;
        case "notYet":
          event.preventDefault();
          rateCurrent("notYet");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return {
    ...deckState,
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

export function useFlashcardCardController({
  blockId,
  deckNode,
  cardId,
}: {
  blockId: string | null;
  deckNode: FlashcardDeckNodeLike | null | undefined;
  cardId: string;
}): FlashcardCardController {
  const activity = useLearnerActivityRuntime({
    activityKind: "flashcard",
    blockId,
    initial: {
      data: flashcardDataForPersistence(FLASHCARD_INITIAL_ACTIVITY.data, deckNode?.childCount),
      completed: FLASHCARD_INITIAL_ACTIVITY.completed,
    },
  });
  const deck = readFlashcardData(activity.activity?.data);
  const flipped = Boolean(deck.flipped[cardId]);
  const mastery = deck.mastery[cardId];
  const isCurrent = isCurrentFlashcardCard({
    deck,
    deckNode,
    cardId,
  });

  const flip = () => {
    const flipped = toggleFlashcardFlipped(deck, cardId);
    activity.updateActivity({
      data: flashcardDataForPersistence({ ...deck, flipped }, deckNode?.childCount),
      completed: activity.activity?.completed ?? false,
      xapiEvent: {
        kind: "flashcard-flipped",
        cardId,
        face: flipped[cardId] ? "back" : "front",
      },
    });
  };

  return {
    flipped,
    mastery,
    isCurrent,
    flip,
  };
}

function flashcardDataForPersistence(
  data: FlashcardActivityData,
  total?: number,
): LearnerActivityData {
  return {
    currentCardId: data.currentCardId,
    flipped: data.flipped,
    mastery: data.mastery,
    ...(total === undefined ? {} : { total }),
  };
}
