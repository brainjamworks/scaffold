import type { JSONContent } from "@tiptap/core";
import { FlashcardDataSchema, type FlashcardData } from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";

export const FLASHCARD_BLOCK_ID = "flashcard";
export const FLASHCARD_NODE = "flashcard";
export const FLASHCARD_CARD_NODE = "flashcard_card";
export const FLASHCARD_CARD_FRONT_NODE = "flashcard_card_front";
export const FLASHCARD_CARD_BACK_NODE = "flashcard_card_back";

export function emptyFlashcardData(overrides: Partial<FlashcardData> = {}): FlashcardData {
  return FlashcardDataSchema.parse(overrides);
}

const DEFAULT_SEEDS: ReadonlyArray<{ front: string; back: string }> = [
  {
    front: "What is photosynthesis?",
    back: "The process plants use to convert light into chemical energy.",
  },
  { front: "What is the capital of France?", back: "Paris." },
  {
    front: "Newton's first law",
    back: "An object in motion stays in motion unless acted on by a net external force.",
  },
];

export function createFlashcardContent(options?: Partial<FlashcardData>): JSONContent {
  return {
    type: FLASHCARD_NODE,
    attrs: {
      id: createStableId(),
      data: emptyFlashcardData(options),
    },
    content: DEFAULT_SEEDS.map(({ front, back }) => createFlashcardCard(front, back)),
  };
}

export function createFlashcardCard(front?: string, back?: string): JSONContent {
  return {
    type: FLASHCARD_CARD_NODE,
    attrs: { id: createStableId() },
    content: [
      createFlashcardCardSide(FLASHCARD_CARD_FRONT_NODE, front),
      createFlashcardCardSide(FLASHCARD_CARD_BACK_NODE, back),
    ],
  };
}

function createFlashcardCardSide(
  nodeType: typeof FLASHCARD_CARD_FRONT_NODE | typeof FLASHCARD_CARD_BACK_NODE,
  text?: string,
): JSONContent {
  return {
    type: nodeType,
    content: [
      {
        type: "paragraph",
        ...(text ? { content: [{ type: "text", text }] } : {}),
      },
    ],
  };
}
