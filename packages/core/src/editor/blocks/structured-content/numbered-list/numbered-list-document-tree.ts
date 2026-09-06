import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";

import { NUMBERED_LIST_ITEM_NODE } from "./content";

const projectNumberedListChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: NUMBERED_LIST_ITEM_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Numbered list item ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const numberedListDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectNumberedListChildren,
});
