import { ColumnsIcon as Columns } from "@phosphor-icons/react";
import { ComparisonDataSchema } from "@scaffold/contracts";

import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  COMPARISON_BLOCK_ID,
  COMPARISON_NODE,
  COMPARISON_ROW_NODE,
  createComparisonContent,
} from "./content";

export const comparisonBlockDefinition = defineBlock({
  nodeType: COMPARISON_NODE,
  configuration: defineConfiguration({
    attr: "data",
    schema: ComparisonDataSchema,
    sheet: {
      title: "Comparison settings",
      sections: [{ id: "columns", title: "Columns" }],
      defaultOpenSections: ["columns"],
    },
    controls: [
      {
        kind: "text",
        name: "leftLabel",
        label: "Left column",
        placement: { sheet: { section: "columns" } },
      },
      {
        kind: "text",
        name: "rightLabel",
        label: "Right column",
        placement: { sheet: { section: "columns" } },
      },
    ],
  }),
  identity: {
    stableChildNodeTypes: [COMPARISON_ROW_NODE],
  },
  placeholders: {
    paragraph: "Add comparison text",
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: COMPARISON_BLOCK_ID,
    category: "display",
    title: "Comparison",
    description: "Two-column table for compare and contrast",
    icon: Columns,
    keywords: ["comparison", "compare", "contrast", "vs", "table", "side-by-side"],
    content: () => createComparisonContent() as Record<string, unknown>,
  },
});
