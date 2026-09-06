import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import type {
  DocumentTreeDefinition,
  ExposedDocumentChild,
  DocumentTreeChildrenInput,
} from "@/document/model/document-tree";
import { PRESENTATION_VISUAL_ACTION_IDS } from "@/document/model/document-tree/definition";
import { SECTION_NODE_TYPE } from "@/document/model/nodes/structural-node-types";

/** Explicit opt-in publication for Layout variants whose Sections can be hidden. */
export const hiddenLayoutSectionDocumentTree: DocumentTreeDefinition = Object.freeze({
  presentation: Object.freeze({ actionIds: PRESENTATION_VISUAL_ACTION_IDS }),
  projectChildren: ({ owner, ownerId }: DocumentTreeChildrenInput) => {
    const sections: ExposedDocumentChild[] = [];
    let offset = 0;
    owner.forEach((node) => {
      if (node.type.name === SECTION_NODE_TYPE) {
        const sectionId = EmbeddedNodeIdSchema.safeParse(node.attrs["id"]);
        if (sectionId.success) {
          sections.push(
            Object.freeze({
              relativePos: offset,
              presentation: Object.freeze({ actionIds: PRESENTATION_VISUAL_ACTION_IDS }),
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
