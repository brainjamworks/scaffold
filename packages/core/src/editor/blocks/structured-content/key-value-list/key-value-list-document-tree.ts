import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";

import { KEY_VALUE_ROW_NODE } from "./content";

const projectKeyValueListChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: KEY_VALUE_ROW_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Key-value row ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const keyValueListDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectKeyValueListChildren,
});
