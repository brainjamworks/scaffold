import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";

import { ROADMAP_MILESTONE_NODE } from "./content";

const projectRoadmapChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
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

export const roadmapDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectRoadmapChildren,
});
