import { BookOpenTextIcon as BookOpenText } from "@phosphor-icons/react";
import type { LayoutDefinition } from "../model/layout-definition";
import { hiddenLayoutSectionDocumentTree } from "../shared/model/layout-semantic-publication";
import { createPaginatedContent, createPaginatedPage } from "./paginated-content";

export const paginatedLayoutDefinition = {
  id: "paginated",
  title: "Paginated",
  description: "Split content into sequential pages",
  icon: BookOpenText,
  boundedPlacement: "fill",
  keywords: ["pages", "pagination", "book", "sequence"],
  documentTree: hiddenLayoutSectionDocumentTree,
  control: {
    semanticChildren: {
      section: {
        events: [{ type: "selected", label: "Selected" }],
        states: [
          {
            key: "selected",
            label: "Selected",
            valueType: { kind: "boolean" },
          },
        ],
        commands: [{ type: "select", label: "Select" }],
      },
    },
  },
  section: {
    label: "Page",
    addLabel: "Add page",
    create: ({ index }) => createPaginatedPage(index),
  },
  createContent: (input) => createPaginatedContent(input?.options),
} satisfies LayoutDefinition;
