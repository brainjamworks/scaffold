import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import type {
  DocumentSemanticsDefinition,
  PublishedSemanticChild,
  SemanticChildProjectionInput,
} from "@/document/model/semantic-document";
import { SECTION_NODE_TYPE } from "@/document/model/nodes/structural-node-types";

/** Explicit opt-in publication for Layout variants whose Sections can be hidden. */
export const hiddenLayoutSectionDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: ({ owner, ownerId }: SemanticChildProjectionInput) => {
    const sections: PublishedSemanticChild[] = [];
    let offset = 0;
    owner.forEach((node) => {
      if (node.type.name === SECTION_NODE_TYPE) {
        const sectionId = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
        if (sectionId.success) {
          sections.push(
            Object.freeze({
              relativePos: offset,
              activation: Object.freeze([
                Object.freeze({
                  ownerId,
                  childId: sectionId.data,
                  ownerKind: "layout" as const,
                }),
              ]),
            }),
          );
        }
      }
      offset += node.nodeSize;
    });
    return Object.freeze(sections);
  },
});
