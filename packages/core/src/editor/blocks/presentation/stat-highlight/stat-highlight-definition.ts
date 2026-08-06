import { ChartBarIcon as ChartBar } from "@phosphor-icons/react";
import { StatHighlightDataSchema } from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import { emptyStatHighlightData } from "./content";

export const STAT_HIGHLIGHT_BLOCK_ID = "stat-highlight";

const statHighlightConfiguration = defineConfiguration({
  attr: "data",
  schema: StatHighlightDataSchema,
  controls: [],
});

export const statHighlightBlockDefinition = defineBlock({
  nodeType: "stat_highlight",
  configuration: statHighlightConfiguration,
  placeholders: {
    stat_highlight_context: "Add context for learners",
    stat_highlight_label: "Short label",
    stat_highlight_value: "Key statistic",
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: STAT_HIGHLIGHT_BLOCK_ID,
    category: "display",
    title: "Stat highlight",
    description: "Foregrounded number with a short caption",
    icon: ChartBar,
    keywords: ["stat", "number", "fact", "percent", "figure", "highlight"],
    content: () => ({
      type: "stat_highlight",
      attrs: {
        id: createStableId(),
        data: emptyStatHighlightData(),
      },
      content: [
        { type: "stat_highlight_value", content: [{ type: "paragraph" }] },
        { type: "stat_highlight_label", content: [{ type: "paragraph" }] },
        { type: "stat_highlight_context", content: [{ type: "paragraph" }] },
      ],
    }),
  },
});
