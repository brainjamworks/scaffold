import { BookOpenTextIcon as BookOpenText } from "@phosphor-icons/react";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";

import type {
  DocumentSemanticsDefinition,
  PublishedSemanticChild,
  SemanticChildProjectionInput,
} from "@/document/model/semantic-document";
import type { LayoutDefinition } from "../model/layout-definition";
import { createPaginatedContent, createPaginatedPage } from "./paginated-content";

const paginatedDocumentSemantics: DocumentSemanticsDefinition = Object.freeze({
  projectChildren: ({ owner, ownerId }: SemanticChildProjectionInput) => {
    const sections: PublishedSemanticChild[] = [];
    let offset = 0;
    owner.forEach((node) => {
      if (node.type.name === "section") {
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

export const paginatedLayoutDefinition = {
  id: "paginated",
  title: "Paginated",
  description: "Split content into sequential pages",
  icon: BookOpenText,
  boundedPlacement: "fill",
  keywords: ["pages", "pagination", "book", "sequence"],
  documentSemantics: paginatedDocumentSemantics,
  section: {
    label: "Page",
    addLabel: "Add page",
    create: ({ index }) => createPaginatedPage(index),
  },
  createContent: (input) => createPaginatedContent(input?.options),
} satisfies LayoutDefinition;
