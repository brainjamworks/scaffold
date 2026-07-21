import { CardsIcon as Cards, ShuffleIcon as Shuffle } from "@phosphor-icons/react";
import { FlashcardDataSchema } from "@scaffold/contracts";

import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  FLASHCARD_BLOCK_ID,
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_CARD_NODE,
  FLASHCARD_NODE,
  createFlashcardContent,
} from "./content";

export const flashcardBlockDefinition = defineBlock({
  nodeType: FLASHCARD_NODE,
  configuration: defineConfiguration({
    attr: "data",
    schema: FlashcardDataSchema,
    sheet: {
      title: "Flashcard settings",
      sections: [{ id: "flashcard", title: "Flashcards" }],
      defaultOpenSections: ["flashcard"],
    },
    controls: [
      {
        kind: "boolean",
        name: "shuffle",
        label: "Shuffle order",
        icon: Shuffle,
        placement: {
          quickMenu: { presentation: "icon-toggle" },
          sheet: { section: "flashcard" },
        },
      },
    ],
  }),
  identity: {
    stableChildNodeTypes: [FLASHCARD_CARD_NODE],
  },
  placeholders: {
    [FLASHCARD_CARD_BACK_NODE]: "Back of the card",
    [FLASHCARD_CARD_FRONT_NODE]: "Front of the card",
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: FLASHCARD_BLOCK_ID,
    category: "activity",
    title: "Flashcards",
    description: "A deck of two-sided cards with a mastery loop",
    icon: Cards,
    keywords: ["flashcard", "flashcards", "deck", "card", "study", "memorise"],
    content: () => createFlashcardContent() as Record<string, unknown>,
  },
});
