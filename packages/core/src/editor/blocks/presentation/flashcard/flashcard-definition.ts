import { CardsIcon as Cards, ShuffleIcon as Shuffle } from "@phosphor-icons/react";
import { EmbeddedNodeIdSchema, FlashcardDataSchema } from "@scaffold/contracts";

import type {
  DocumentSemanticsDefinition,
  PublishedSemanticChild,
  SemanticActivationRelationship,
  SemanticChildProjectionInput,
} from "@/document/model/semantic-document";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  FLASHCARD_BLOCK_ID,
  FLASHCARD_CARD_BACK_NODE,
  FLASHCARD_CARD_NODE,
  FLASHCARD_CARD_FRONT_NODE,
  FLASHCARD_NODE,
  createFlashcardContent,
} from "./content";

const flashcardDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: ({ owner, ownerId, helpers }: SemanticChildProjectionInput) => {
    const candidates: PublishedSemanticChild[] = [];
    let cardOffset = 0;
    let cardOrdinal = 0;

    owner.forEach((card) => {
      if (card.type.name !== FLASHCARD_CARD_NODE) {
        cardOffset += card.nodeSize;
        return;
      }
      const cardId = EmbeddedNodeIdSchema.safeParse(card.attrs["id"]);
      if (!cardId.success) {
        cardOffset += card.nodeSize;
        return;
      }
      cardOrdinal += 1;
      const cardActivation = Object.freeze([
        activation(ownerId, cardId.data),
      ]) satisfies readonly SemanticActivationRelationship[];
      candidates.push(
        Object.freeze({
          relativePos: cardOffset,
          semanticRole: "published-child" as const,
          label: `Card ${cardOrdinal}`,
          activation: cardActivation,
        }),
      );

      let faceOffset = 0;
      card.forEach((face) => {
        const label =
          face.type.name === FLASHCARD_CARD_FRONT_NODE
            ? "Front"
            : face.type.name === FLASHCARD_CARD_BACK_NODE
              ? "Back"
              : null;
        const faceId = EmbeddedNodeIdSchema.safeParse(face.attrs["id"]);
        if (label && faceId.success) {
          const faceActivation = Object.freeze([
            ...cardActivation,
            activation(ownerId, faceId.data),
          ]);
          candidates.push(
            Object.freeze({
              relativePos: cardOffset + 1 + faceOffset,
              semanticRole: "published-child" as const,
              label,
              activation: faceActivation,
            }),
          );
          for (const candidate of [
            ...helpers.projectStandardRichText(face),
            ...helpers.projectStructuralChildren(face),
          ]) {
            candidates.push(Object.freeze({ ...candidate, activation: faceActivation }));
          }
        }
        faceOffset += face.nodeSize;
      });
      cardOffset += card.nodeSize;
    });

    return Object.freeze(candidates.sort((left, right) => left.relativePos - right.relativePos));
  },
});

function activation(
  ownerId: SemanticChildProjectionInput["ownerId"],
  childId: SemanticChildProjectionInput["ownerId"],
): SemanticActivationRelationship {
  return Object.freeze({ ownerId, childId, ownerKind: "block" });
}

export const flashcardBlockDefinition = defineBlock({
  nodeType: FLASHCARD_NODE,
  title: "Flashcards",
  documentSemantics: flashcardDocumentSemantics,
  boundedPlacement: "fill",
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
