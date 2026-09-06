import type {
  DocumentTreeDefinition,
  DocumentTreeChildrenBuilder,
} from "@/document/model/document-tree";
import { PRESENTATION_VISUAL_ACTION_IDS } from "@/document/model/document-tree/definition";

import { GALLERY_ITEM_NODE } from "./content";

const projectGalleryChildren: DocumentTreeChildrenBuilder = ({ helpers, ownerId }) =>
  Object.freeze(
    helpers
      .projectDirectOwnedMembers({
        nodeType: GALLERY_ITEM_NODE,
        describe: ({ node, ordinal }) =>
          Object.freeze({
            label: `Gallery item ${ordinal + 1}`,
            authoringAnchorId: ownerId,
            activation: Object.freeze([
              Object.freeze({
                ownerId,
                childId: node.attrs["id"],
                ownerKind: "block" as const,
              }),
            ]),
          }),
      })
      .map((candidate) =>
        Object.freeze({
          ...candidate,
          presentation: Object.freeze({ actionIds: PRESENTATION_VISUAL_ACTION_IDS }),
        }),
      ),
  );

export const galleryDocumentTree: DocumentTreeDefinition = Object.freeze({
  projectChildren: projectGalleryChildren,
});
