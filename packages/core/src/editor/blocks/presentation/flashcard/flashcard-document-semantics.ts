import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { FLASHCARD_CARD_NODE } from "./content";

const projectFlashcardChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: FLASHCARD_CARD_NODE,
    describe: ({ node, ordinal }) =>
      Object.freeze({
        label: `Card ${ordinal + 1}`,
        authoringAnchorId: ownerId,
        activation: Object.freeze([
          Object.freeze({
            ownerId,
            childId: node.attrs["id"],
            ownerKind: "block" as const,
          }),
        ]),
      }),
  });

export const flashcardDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectFlashcardChildren,
});
