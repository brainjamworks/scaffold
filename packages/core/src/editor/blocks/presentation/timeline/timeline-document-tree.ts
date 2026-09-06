import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";

import { TIMELINE_ITEM_NODE } from "./content";

const projectTimelineChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
    nodeType: TIMELINE_ITEM_NODE,
    describe: ({ node, ordinal }) => {
      const childId = node.attrs["id"];
      return Object.freeze({
        label: `Timeline entry ${ordinal + 1}`,
        authoringAnchorId: ownerId,
        activation: Object.freeze([
          Object.freeze({
            ownerId,
            childId,
            ownerKind: "block" as const,
          }),
        ]),
      });
    },
  });

export const timelineDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectTimelineChildren,
});
