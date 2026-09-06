import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";

import { PROCESS_FLOW_STEP_NODE } from "./content";

const projectProcessFlowChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: PROCESS_FLOW_STEP_NODE,
    describe: ({ node, ordinal }) =>
      Object.freeze({
        label: `Process flow step ${ordinal + 1}`,
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

export const processFlowDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectProcessFlowChildren,
});
