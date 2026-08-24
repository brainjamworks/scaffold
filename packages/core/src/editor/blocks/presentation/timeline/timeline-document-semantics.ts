import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { TIMELINE_ITEM_NODE } from "./content";

const projectTimelineChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
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

export const timelineDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectTimelineChildren,
});
