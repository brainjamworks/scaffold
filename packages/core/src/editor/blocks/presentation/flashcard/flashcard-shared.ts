export type FlashcardMasteryStatus = "gotIt" | "notYet";

export interface FlashcardActivityData {
  [key: string]: unknown;
  currentCardId: string | null;
  flipped: Record<string, boolean>;
  mastery: Record<string, FlashcardMasteryStatus>;
  order?: string[];
}

export interface FlashcardCardSummary {
  id: string;
}

export interface FlashcardDeckNodeLike {
  attrs?: Record<string, unknown>;
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

export function reconcileFlashcardCardOrder(
  cardSummaries: FlashcardCardSummary[],
  persistedOrder: readonly string[],
  shuffle: boolean,
  seed: string,
): FlashcardCardSummary[] {
  if (!shuffle) return cardSummaries;

  const cardsById = new Map(cardSummaries.map((card) => [card.id, card]));
  const retainedIds = persistedOrder.filter(
    (id, index) => cardsById.has(id) && persistedOrder.indexOf(id) === index,
  );
  const retained = new Set(retainedIds);
  const addedIds = cardSummaries.map((card) => card.id).filter((id) => !retained.has(id));
  const shuffledAddedIds = deterministicShuffle(addedIds, seed);

  if (
    retainedIds.length === 0 &&
    shuffledAddedIds.length > 1 &&
    shuffledAddedIds.every((id, index) => id === cardSummaries[index]?.id)
  ) {
    shuffledAddedIds.push(shuffledAddedIds.shift()!);
  }

  return [...retainedIds, ...shuffledAddedIds]
    .map((id) => cardsById.get(id))
    .filter((card): card is FlashcardCardSummary => card !== undefined);
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
  const order = Array.isArray(raw["order"])
    ? raw["order"].filter((id): id is string => typeof id === "string")
    : undefined;

  return { currentCardId, flipped, mastery, ...(order ? { order } : {}) };
}

export function readFlashcardShuffle(deckNode: FlashcardDeckNodeLike): boolean {
  return readObject(deckNode.attrs?.["data"])["shuffle"] === true;
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
      ...(deck.order ? { order: deck.order } : {}),
    },
    completed:
      cardSummaries.length > 0 && cardSummaries.every((card) => mastery[card.id] === "gotIt"),
  };
}

export function isCurrentFlashcardCard({
  deck,
  deckNode,
  cardId,
  cardSummaries,
}: {
  deck: FlashcardActivityData;
  deckNode: FlashcardDeckNodeLike | null | undefined;
  cardId: string;
  cardSummaries?: FlashcardCardSummary[];
}): boolean {
  const knownCards =
    cardSummaries ?? (deckNode ? readCardSummaries(deckNode) : []);
  const currentCardId =
    deck.currentCardId && knownCards.some((card) => card.id === deck.currentCardId)
      ? deck.currentCardId
      : (knownCards[0]?.id ?? null);
  return currentCardId === cardId;
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

  return Boolean(
    target.closest(
      '[contenteditable="true"], [data-scaffold-card-no-flip], a, button, input, textarea, select',
    ),
  );
}

function readObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function deterministicShuffle(values: readonly string[], seed: string): string[] {
  const result = [...values];
  let state = hashString(seed);

  for (let index = result.length - 1; index > 0; index -= 1) {
    state = xorshift32(state);
    const target = state % (index + 1);
    [result[index], result[target]] = [result[target]!, result[index]!];
  }

  return result;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function xorshift32(value: number): number {
  let result = value || 0x9e3779b9;
  result ^= result << 13;
  result ^= result >>> 17;
  result ^= result << 5;
  return result >>> 0;
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
    tagName === "select" ||
    tagName === "button" ||
    tagName === "a" ||
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
