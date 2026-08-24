import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { FLASHCARD_CARD_NODE } from "./content";

const projectFlashcardChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: FLASHCARD_CARD_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Card ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const flashcardDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectFlashcardChildren,
});
