import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";

import { FLASHCARD_CARD_NODE } from "./content";

const projectFlashcardChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
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

export const flashcardDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectFlashcardChildren,
});
