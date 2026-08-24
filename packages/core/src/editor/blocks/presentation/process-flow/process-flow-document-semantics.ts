import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { PROCESS_FLOW_STEP_NODE } from "./content";

const projectProcessFlowChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
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

export const processFlowDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectProcessFlowChildren,
});
