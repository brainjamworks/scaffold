import { TargetIcon as Target } from "@phosphor-icons/react";
import { NumberedListDataSchema, NumberedListMarkerStateSchema } from "@scaffold/contracts";
import { z } from "zod";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { validateCatalogNodeAttrs } from "@/editor/insertion/catalog-validation";

import {
  NUMBERED_LIST_ITEM_NODE,
  NUMBERED_LIST_NODE,
  NUMBERED_LIST_TITLE_NODE,
  emptyNumberedListData,
  numberedListItemContent,
  numberedListTitleContent,
} from "./content";

export const NUMBERED_LIST_BLOCK_ID = "numbered-list";

const DEFAULT_TITLE = "Numbered list";
const DEFAULT_ITEMS = ["Add the first item", "Add the second item"] as const;

export const numberedListBlockDefinition = defineBlock({
  nodeType: NUMBERED_LIST_NODE,
  configuration: defineConfiguration({
    attr: "data",
    schema: NumberedListDataSchema,
    sheet: {
      title: "Numbered list settings",
      defaultOpenSections: ["presentation"],
      sections: [{ id: "presentation", title: "Presentation" }],
    },
    controls: [
      {
        kind: "boolean",
        name: "showTitle",
        label: "Show title",
        presentation: "switch",
        placement: { sheet: { section: "presentation" } },
      },
      {
        kind: "boolean",
        name: "showIcon",
        label: "Show icon",
        presentation: "switch",
        placement: { sheet: { section: "presentation" } },
      },
    ],
  }),
  identity: {
    stableChildNodeTypes: [NUMBERED_LIST_ITEM_NODE],
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  placeholders: {
    numbered_list_item: "Write a list item",
    numbered_list_title: "Numbered list",
  },
  insert: {
    id: NUMBERED_LIST_BLOCK_ID,
    category: "content",
    title: "Numbered list",
    description: "A structured numbered list with an optional icon header",
    icon: Target,
    keywords: ["numbered", "list", "steps", "outcomes", "goals"],
    validateNode: validateCatalogNodeAttrs([
      {
        nodeType: NUMBERED_LIST_ITEM_NODE,
        schema: z.object({ status: NumberedListMarkerStateSchema }),
        field: "status",
        message: "Numbered list catalog content contains an invalid item status.",
      },
    ]),
    content: () => ({
      type: NUMBERED_LIST_NODE,
      attrs: {
        id: createStableId(),
        data: emptyNumberedListData(),
      },
      content: [
        {
          type: NUMBERED_LIST_TITLE_NODE,
          content: numberedListTitleContent(DEFAULT_TITLE),
        },
        ...DEFAULT_ITEMS.map((item) => ({
          type: NUMBERED_LIST_ITEM_NODE,
          attrs: {
            id: createStableId(),
            status: "neutral",
          },
          content: numberedListItemContent(item),
        })),
      ],
    }),
  },
});
