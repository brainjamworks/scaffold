// @vitest-environment happy-dom

import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_FLASHCARD_DATA,
  getRelativeFlashcardCardId,
  isCurrentFlashcardCard,
  rateFlashcardDeck,
  reconcileFlashcardCardOrder,
  resolveFlashcardKeyboardAction,
  resolveFlashcardDeckState,
  shouldIgnoreFlashcardEnterFlip,
  shouldIgnoreFlashcardPointerFlip,
  toggleFlashcardFlipped,
  type FlashcardActivityData,
  type FlashcardCardSummary,
} from "./flashcard-shared";

const cards: FlashcardCardSummary[] = [{ id: "card-a" }, { id: "card-b" }, { id: "card-c" }];

describe("flashcard shared deck policy", () => {
  it("falls back to the first card when stored current card is missing", () => {
    const state = resolveFlashcardDeckState(cards, {
      ...EMPTY_FLASHCARD_DATA,
      currentCardId: "missing-card",
      flipped: { "card-a": true },
      mastery: { "card-b": "gotIt" },
    });

    expect(state).toEqual({
      totalCards: 3,
      currentCardId: "card-a",
      currentIndex: 0,
      masteredCount: 1,
      allMastered: false,
      currentMastery: undefined,
      currentFlipped: true,
    });
  });

  it("wraps relative navigation in either direction", () => {
    expect(getRelativeFlashcardCardId(cards, 0, 1)).toBe("card-b");
    expect(getRelativeFlashcardCardId(cards, 0, -1)).toBe("card-c");
    expect(getRelativeFlashcardCardId(cards, 2, 1)).toBe("card-a");
    expect(getRelativeFlashcardCardId([], 0, 1)).toBeNull();
  });

  it("keeps learner shuffle order stable while reconciling authored card changes", () => {
    const firstOrder = reconcileFlashcardCardOrder(cards, [], true, "flashcard-one");

    expect(firstOrder.map((card) => card.id)).not.toEqual(cards.map((card) => card.id));

    const reconciled = reconcileFlashcardCardOrder(
      [{ id: "card-a" }, { id: "card-c" }, { id: "card-d" }],
      firstOrder.map((card) => card.id),
      true,
      "flashcard-one",
    );

    expect(reconciled.slice(0, 2).map((card) => card.id)).toEqual(
      firstOrder.filter((card) => card.id !== "card-b").map((card) => card.id),
    );
    expect(reconciled.map((card) => card.id)).toContain("card-d");
  });

  it("uses authored order when learner shuffling is disabled", () => {
    expect(
      reconcileFlashcardCardOrder(cards, ["card-c", "card-a", "card-b"], false, "deck"),
    ).toEqual(cards);
  });

  it("rates the current card and advances to the next unmastered card", () => {
    const deck: FlashcardActivityData = {
      currentCardId: "card-a",
      flipped: { "card-a": true },
      mastery: { "card-b": "gotIt" },
    };

    const result = rateFlashcardDeck(cards, deck, "card-a", 0, "gotIt");

    expect(result).toEqual({
      data: {
        currentCardId: "card-c",
        flipped: { "card-a": false },
        mastery: {
          "card-a": "gotIt",
          "card-b": "gotIt",
        },
      },
      completed: false,
    });
  });

  it("marks the deck complete when every card is mastered", () => {
    const result = rateFlashcardDeck(
      cards,
      {
        currentCardId: "card-c",
        flipped: {},
        mastery: {
          "card-a": "gotIt",
          "card-b": "gotIt",
        },
      },
      "card-c",
      2,
      "gotIt",
    );

    expect(result.completed).toBe(true);
    expect(result.data.currentCardId).toBe("card-c");
  });

  it("resolves the active card from stored state or first card fallback", () => {
    const deckNode = {
      childCount: 2,
      child(index: number) {
        return { attrs: { id: index === 0 ? "card-a" : "card-b" } };
      },
    };

    expect(
      isCurrentFlashcardCard({
        deck: EMPTY_FLASHCARD_DATA,
        deckNode,
        cardId: "card-a",
      }),
    ).toBe(true);
    expect(
      isCurrentFlashcardCard({
        deck: { ...EMPTY_FLASHCARD_DATA, currentCardId: "card-b" },
        deckNode,
        cardId: "card-a",
      }),
    ).toBe(false);
    expect(
      isCurrentFlashcardCard({
        deck: { ...EMPTY_FLASHCARD_DATA, currentCardId: "removed-card" },
        deckNode,
        cardId: "card-b",
        cardSummaries: [{ id: "card-b" }, { id: "card-a" }],
      }),
    ).toBe(true);
  });

  it("toggles a card flip flag without mutating the existing deck", () => {
    const flipped = { "card-a": true };

    expect(toggleFlashcardFlipped({ ...EMPTY_FLASHCARD_DATA, flipped }, "card-a")).toEqual({
      "card-a": false,
    });
    expect(flipped).toEqual({ "card-a": true });
  });

  it("maps reader keyboard shortcuts to flashcard actions", () => {
    expect(resolveFlashcardKeyboardAction({ key: "ArrowRight" })).toBe("next");
    expect(resolveFlashcardKeyboardAction({ key: "ArrowLeft" })).toBe("previous");
    expect(resolveFlashcardKeyboardAction({ key: " " })).toBe("flip");
    expect(resolveFlashcardKeyboardAction({ key: "Spacebar" })).toBe("flip");
    expect(resolveFlashcardKeyboardAction({ key: "g" })).toBe("gotIt");
    expect(resolveFlashcardKeyboardAction({ key: "G" })).toBe("gotIt");
    expect(resolveFlashcardKeyboardAction({ key: "n" })).toBe("notYet");
    expect(resolveFlashcardKeyboardAction({ key: "N" })).toBe("notYet");
    expect(resolveFlashcardKeyboardAction({ key: "Escape" })).toBeNull();
  });

  it("ignores shortcuts while typing or using modifier keys", () => {
    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const editable = document.createElement("div");
    editable.contentEditable = "true";

    expect(resolveFlashcardKeyboardAction({ key: "ArrowRight", target: input })).toBeNull();
    expect(resolveFlashcardKeyboardAction({ key: "ArrowRight", target: textarea })).toBeNull();
    expect(resolveFlashcardKeyboardAction({ key: "ArrowRight", target: editable })).toBeNull();
    expect(resolveFlashcardKeyboardAction({ key: "g", metaKey: true })).toBeNull();
    expect(resolveFlashcardKeyboardAction({ key: "g", ctrlKey: true })).toBeNull();
    expect(resolveFlashcardKeyboardAction({ key: "g", altKey: true })).toBeNull();
  });

  it("ignores pointer flips from nested editing and control targets", () => {
    const card = document.createElement("div");
    const editable = document.createElement("p");
    const noFlip = document.createElement("span");
    const button = document.createElement("button");
    const normalText = document.createElement("span");
    editable.contentEditable = "true";
    noFlip.dataset["scaffoldCardNoFlip"] = "";
    card.append(editable, noFlip, button, normalText);

    expect(shouldIgnoreFlashcardPointerFlip(editable)).toBe(true);
    expect(shouldIgnoreFlashcardPointerFlip(noFlip)).toBe(true);
    expect(shouldIgnoreFlashcardPointerFlip(button)).toBe(true);
    expect(shouldIgnoreFlashcardPointerFlip(normalText)).toBe(false);
    expect(shouldIgnoreFlashcardPointerFlip(null)).toBe(false);
  });

  it("ignores Enter flips from editable and interactive content", () => {
    const editable = document.createElement("div");
    const button = document.createElement("button");
    const link = document.createElement("a");
    const normalText = document.createElement("span");
    editable.contentEditable = "true";

    expect(shouldIgnoreFlashcardEnterFlip(editable)).toBe(true);
    expect(shouldIgnoreFlashcardEnterFlip(button)).toBe(true);
    expect(shouldIgnoreFlashcardEnterFlip(link)).toBe(true);
    expect(shouldIgnoreFlashcardEnterFlip(normalText)).toBe(false);
    expect(shouldIgnoreFlashcardEnterFlip(null)).toBe(false);
  });
});
