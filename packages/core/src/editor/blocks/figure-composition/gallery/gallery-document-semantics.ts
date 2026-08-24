import type {
  DocumentSemanticsDefinition,
  SemanticChildProjector,
} from "@/document/model/semantic-document";

import { GALLERY_ITEM_NODE } from "./content";

const projectGalleryChildren: SemanticChildProjector = ({ helpers, ownerId }) =>
  helpers.projectDirectOwnedMembers({
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
  });

export const galleryDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: projectGalleryChildren,
});
