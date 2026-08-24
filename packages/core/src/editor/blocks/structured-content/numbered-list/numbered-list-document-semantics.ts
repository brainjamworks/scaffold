import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { NUMBERED_LIST_ITEM_NODE } from "./content";

const projectNumberedListChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: NUMBERED_LIST_ITEM_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Numbered list item ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const numberedListDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectNumberedListChildren,
});
