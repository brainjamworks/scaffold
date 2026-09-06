import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";

import { COMPARISON_ROW_NODE } from "./content";

const projectComparisonChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: COMPARISON_ROW_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Comparison row ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const comparisonDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectComparisonChildren,
});
