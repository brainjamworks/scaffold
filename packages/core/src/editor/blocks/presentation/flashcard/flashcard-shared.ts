export type FlashcardMasteryStatus = "gotIt" | "notYet";

export interface FlashcardActivityData {
  [key: string]: unknown;
  currentCardId: string | null;
  flipped: Record<string, boolean>;
  mastery: Record<string, FlashcardMasteryStatus>;
}

export interface FlashcardCardSummary {
  id: string;
}

export interface FlashcardDeckNodeLike {
  childCount: number;
  child(index: number): {
    attrs: Record<string, unknown>;
  };
}

export interface FlashcardDeckViewState {
  totalCards: number;
  currentCardId: string | null;
  currentIndex: number;
  masteredCount: number;
  allMastered: boolean;
  currentMastery: FlashcardMasteryStatus | undefined;
  currentFlipped: boolean;
}

export interface FlashcardRatingResult {
  data: FlashcardActivityData;
  completed: boolean;
}

export type FlashcardKeyboardAction = "next" | "previous" | "flip" | "gotIt" | "notYet";

interface FlashcardKeyboardEventLike {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  target?: EventTarget | null;
}

export const EMPTY_FLASHCARD_DATA: FlashcardActivityData = {
  currentCardId: null,
  flipped: {},
  mastery: {},
};

export const FLASHCARD_INITIAL_ACTIVITY = {
  data: EMPTY_FLASHCARD_DATA,
  completed: false,
};

export function readCardSummaries(deckNode: FlashcardDeckNodeLike): FlashcardCardSummary[] {
  const result: FlashcardCardSummary[] = [];
  for (let index = 0; index < deckNode.childCount; index += 1) {
    const child = deckNode.child(index);
    const id = child.attrs["id"];
    if (typeof id === "string") result.push({ id });
  }
  return result;
}

export function readFlashcardData(data: unknown): FlashcardActivityData {
  const raw = readObject(data);
  const currentCardId = typeof raw["currentCardId"] === "string" ? raw["currentCardId"] : null;
  const flipped =
    raw["flipped"] !== null && typeof raw["flipped"] === "object" && !Array.isArray(raw["flipped"])
      ? readBooleanRecord(raw["flipped"] as Record<string, unknown>)
      : {};
  const mastery =
    raw["mastery"] !== null && typeof raw["mastery"] === "object" && !Array.isArray(raw["mastery"])
      ? readMasteryRecord(raw["mastery"] as Record<string, unknown>)
      : {};

  return { currentCardId, flipped, mastery };
}

export function resolveFlashcardDeckState(
  cardSummaries: FlashcardCardSummary[],
  deck: FlashcardActivityData,
): FlashcardDeckViewState {
  const totalCards = cardSummaries.length;
  const currentCardId =
    deck.currentCardId && cardSummaries.some((card) => card.id === deck.currentCardId)
      ? deck.currentCardId
      : (cardSummaries[0]?.id ?? null);
  const currentIndex = currentCardId
    ? cardSummaries.findIndex((card) => card.id === currentCardId)
    : 0;
  const masteredCount = cardSummaries.filter((card) => deck.mastery[card.id] === "gotIt").length;
  const allMastered = totalCards > 0 && masteredCount === totalCards;
  const currentMastery = currentCardId ? deck.mastery[currentCardId] : undefined;
  const currentFlipped = currentCardId ? Boolean(deck.flipped[currentCardId]) : false;

  return {
    totalCards,
    currentCardId,
    currentIndex,
    masteredCount,
    allMastered,
    currentMastery,
    currentFlipped,
  };
}

export function getRelativeFlashcardCardId(
  cardSummaries: FlashcardCardSummary[],
  currentIndex: number,
  offset: number,
): string | null {
  if (cardSummaries.length === 0) return null;
  const nextIndex =
    (((currentIndex + offset) % cardSummaries.length) + cardSummaries.length) %
    cardSummaries.length;
  return cardSummaries[nextIndex]?.id ?? null;
}

export function toggleFlashcardFlipped(
  deck: FlashcardActivityData,
  cardId: string,
): Record<string, boolean> {
  return {
    ...deck.flipped,
    [cardId]: !deck.flipped[cardId],
  };
}

export function rateFlashcardDeck(
  cardSummaries: FlashcardCardSummary[],
  deck: FlashcardActivityData,
  currentCardId: string,
  currentIndex: number,
  status: FlashcardMasteryStatus,
): FlashcardRatingResult {
  const mastery = { ...deck.mastery, [currentCardId]: status };
  const flipped = deck.flipped[currentCardId]
    ? { ...deck.flipped, [currentCardId]: false }
    : deck.flipped;
  let nextCardId: string | null = currentCardId;

  for (let offset = 1; offset <= cardSummaries.length; offset += 1) {
    const candidate = cardSummaries[(currentIndex + offset) % cardSummaries.length];
    if (!candidate) break;
    const candidateMastery = candidate.id === currentCardId ? status : deck.mastery[candidate.id];
    if (candidateMastery !== "gotIt") {
      nextCardId = candidate.id;
      break;
    }
  }

  return {
    data: {
      currentCardId: nextCardId,
      flipped,
      mastery,
    },
    completed:
      cardSummaries.length > 0 && cardSummaries.every((card) => mastery[card.id] === "gotIt"),
  };
}

export function isCurrentFlashcardCard({
  deck,
  deckNode,
  cardId,
}: {
  deck: FlashcardActivityData;
  deckNode: FlashcardDeckNodeLike | null | undefined;
  cardId: string;
}): boolean {
  return (
    deck.currentCardId === cardId ||
    (deck.currentCardId === null &&
      deckNode != null &&
      deckNode.childCount > 0 &&
      deckNode.child(0).attrs["id"] === cardId)
  );
}

export function resolveFlashcardKeyboardAction(
  event: FlashcardKeyboardEventLike,
): FlashcardKeyboardAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey || isTextEditingTarget(event.target)) {
    return null;
  }

  switch (event.key) {
    case "ArrowRight":
      return "next";
    case "ArrowLeft":
      return "previous";
    case " ":
    case "Spacebar":
      return "flip";
    case "g":
    case "G":
      return "gotIt";
    case "n":
    case "N":
      return "notYet";
    default:
      return null;
  }
}

export function shouldIgnoreFlashcardPointerFlip(target: EventTarget | null | undefined): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest(
      '[contenteditable="true"], [data-scaffold-card-no-flip], a, button, input, textarea, select',
    ),
  );
}

export function shouldIgnoreFlashcardEnterFlip(target: EventTarget | null | undefined): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest('[contenteditable="true"]'));
}

function readObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readBooleanRecord(value: Record<string, unknown>): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === true) result[key] = true;
  }
  return result;
}

function isTextEditingTarget(target: EventTarget | null | undefined): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    (typeof HTMLElement !== "undefined" &&
      target instanceof HTMLElement &&
      target.isContentEditable)
  );
}

function readMasteryRecord(value: Record<string, unknown>): Record<string, FlashcardMasteryStatus> {
  const result: Record<string, FlashcardMasteryStatus> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === "gotIt" || entry === "notYet") result[key] = entry;
  }
  return result;
}
