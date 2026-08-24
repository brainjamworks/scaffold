import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { ROADMAP_MILESTONE_NODE } from "./content";

const projectRoadmapChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: ROADMAP_MILESTONE_NODE,
    describe: ({ node, ordinal }) =>
      Object.freeze({
        label: `Roadmap milestone ${ordinal + 1}`,
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

export const roadmapDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectRoadmapChildren,
});
