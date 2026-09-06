import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";

import { CHECKLIST_ITEM_NODE } from "./content";

const projectChecklistChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: CHECKLIST_ITEM_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Checklist item ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const checklistDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectChecklistChildren,
});
