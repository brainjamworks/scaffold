import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { CHECKLIST_ITEM_NODE } from "./content";

const projectChecklistChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: CHECKLIST_ITEM_NODE,
    describe: ({ ordinal }) =>
      Object.freeze({
        label: `Checklist item ${ordinal + 1}`,
        authoringAnchorId: ownerId,
      }),
  });

export const checklistDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectChecklistChildren,
});
