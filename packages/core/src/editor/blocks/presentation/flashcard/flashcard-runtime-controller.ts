import { useEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";

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
  readFlashcardShuffle,
  reconcileFlashcardCardOrder,
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
  const shuffle = readFlashcardShuffle(deckNode);
  const initialOrder = reconcileFlashcardCardOrder(cardSummaries, [], shuffle, blockId).map(
    (card) => card.id,
  );
  const activity = useLearnerActivityRuntime({
    activityKind: "flashcard",
    blockId,
    initial: {
      data: flashcardDataForPersistence(
        {
          ...FLASHCARD_INITIAL_ACTIVITY.data,
          ...(shuffle ? { order: initialOrder } : {}),
        },
        cardSummaries.length,
      ),
      completed: FLASHCARD_INITIAL_ACTIVITY.completed,
    },
  });
  const deck = readFlashcardData(activity.activity?.data);
  const orderedCards = reconcileFlashcardCardOrder(
    cardSummaries,
    deck.order ?? [],
    shuffle,
    blockId,
  );
  const orderedCardIds = orderedCards.map((card) => card.id);
  const deckState = resolveFlashcardDeckState(orderedCards, deck);
  const { currentCardId, currentIndex } = deckState;

  const setCurrentCard: FlashcardDeckController["setCurrentCard"] = (cardId, input) => {
    if (!cardId) return;
    if (input?.origin === "semantic-activation") {
      activity.updateActivity({
        data: flashcardDataForPersistence({ ...deck, currentCardId: cardId }, cardSummaries.length),
        completed: activity.activity?.completed ?? false,
        learningEvent: null,
      });
      return;
    }
    activity.patchData({ currentCardId: cardId });
  };

  const goNext = () => {
    setCurrentCard(getRelativeFlashcardCardId(orderedCards, currentIndex, 1));
  };

  const goPrev = () => {
    setCurrentCard(getRelativeFlashcardCardId(orderedCards, currentIndex, -1));
  };

  const resetDeck = () => {
    activity.setData(
      flashcardDataForPersistence(
        { ...EMPTY_FLASHCARD_DATA, ...(shuffle ? { order: orderedCardIds } : {}) },
        cardSummaries.length,
      ),
    );
    activity.setCompleted(false);
  };

  const flipCurrent = () => {
    if (!currentCardId) return;
    const flipped = toggleFlashcardFlipped(deck, currentCardId);
    activity.updateActivity({
      data: flashcardDataForPersistence({ ...deck, flipped }, cardSummaries.length),
      completed: activity.activity?.completed ?? false,
      learningEvent: {
        kind: "flashcard-flipped",
        cardId: currentCardId,
        face: flipped[currentCardId] ? "back" : "front",
      },
    });
  };

  const rateCurrent = (status: FlashcardMasteryStatus) => {
    if (!currentCardId) return;
    const result = rateFlashcardDeck(orderedCards, deck, currentCardId, currentIndex, status);
    const masteredCount = orderedCards.filter(
      (card) => result.data.mastery[card.id] === "gotIt",
    ).length;
    activity.updateActivity({
      data: flashcardDataForPersistence(
        { ...result.data, ...(shuffle ? { order: orderedCardIds } : {}) },
        cardSummaries.length,
      ),
      completed: result.completed,
      learningEvent: {
        kind: "flashcard-rated",
        cardId: currentCardId,
        rating: status === "gotIt" ? "got-it" : "not-yet",
        masteredCount,
        total: orderedCards.length,
      },
    });
  };

  useEffect(() => {
    if (!shuffle || arraysEqual(deck.order ?? [], orderedCardIds)) return;
    activity.patchData({ order: orderedCardIds });
  }, [activity, deck.order, orderedCardIds, shuffle]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const action = resolveFlashcardKeyboardAction(event);
    if (!action) return;
    const deckElement = event.currentTarget;

    event.preventDefault();
    switch (action) {
      case "next":
        goNext();
        break;
      case "previous":
        goPrev();
        break;
      case "flip":
        flipCurrent();
        break;
      case "gotIt":
        rateCurrent("gotIt");
        break;
      case "notYet":
        rateCurrent("notYet");
        break;
    }
    focusFlashcardAfterShortcut(deckElement);
  };

  return {
    ...deckState,
    deck,
    cardSummaries: orderedCards,
    handleKeyDown,
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
  const authoredCards = deckNode ? readCardSummaries(deckNode) : [];
  const orderedCards = deckNode
    ? reconcileFlashcardCardOrder(
        authoredCards,
        deck.order ?? [],
        readFlashcardShuffle(deckNode),
        blockId ?? "flashcard",
      )
    : [];
  const flipped = Boolean(deck.flipped[cardId]);
  const mastery = deck.mastery[cardId];
  const isCurrent = isCurrentFlashcardCard({
    deck,
    deckNode,
    cardId,
    cardSummaries: orderedCards,
  });

  const flip = () => {
    const flipped = toggleFlashcardFlipped(deck, cardId);
    activity.updateActivity({
      data: flashcardDataForPersistence({ ...deck, flipped }, deckNode?.childCount),
      completed: activity.activity?.completed ?? false,
      learningEvent: {
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
    ...(data.order ? { order: data.order } : {}),
    ...(total === undefined ? {} : { total }),
  };
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function focusFlashcardAfterShortcut(deck: HTMLElement): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const target = deck.querySelector<HTMLElement>(
        "[data-flashcard-focus-target], .sc-course-flashcard-card:not(.sc-course-flashcard-card--inactive) [data-flashcard-visible-face]:not([inert])",
      );
      target?.focus({ preventScroll: true });
    });
  });
}
