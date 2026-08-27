import { CardsIcon as Cards, ShuffleIcon as Shuffle } from "@phosphor-icons/react";
import { FlashcardDataSchema } from "@scaffold/contracts";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  FLASHCARD_BLOCK_ID,
  FLASHCARD_CARD_NODE,
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_NODE,
  createFlashcardContent,
} from "./content";
import { flashcardDocumentSemantics } from "./flashcard-document-semantics";

export const flashcardBlockDefinition = defineBlock({
  nodeType: FLASHCARD_NODE,
  title: "Flashcards",
  boundedPlacement: "fill",
  documentSemantics: flashcardDocumentSemantics,
  control: {
    owner: {
      events: [{ type: "completed", label: "Completed" }],
      states: [
        {
          key: "completed",
          label: "Completed",
          valueType: { kind: "boolean" },
        },
      ],
    },
    semanticChildren: {
      [FLASHCARD_CARD_NODE]: {
        events: [
          { type: "selected", label: "Selected" },
          { type: "flipped", label: "Flipped" },
          { type: "rated", label: "Rated" },
        ],
        states: [
          {
            key: "selected",
            label: "Selected",
            valueType: { kind: "boolean" },
          },
          {
            key: "flipped",
            label: "Flipped",
            valueType: { kind: "boolean" },
          },
          {
            key: "mastery",
            label: "Mastery",
            valueType: {
              kind: "enum",
              options: [
                { value: "unrated", label: "Unrated" },
                { value: "not-yet", label: "Not yet" },
                { value: "got-it", label: "Got it" },
              ],
            },
          },
        ],
        commands: [{ type: "show-card", label: "Show card" }],
      },
    },
  },
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
