import { TargetIcon as Target } from "@phosphor-icons/react";
import { NumberedListDataSchema } from "@scaffold/contracts";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  NUMBERED_LIST_ITEM_NODE,
  NUMBERED_LIST_NODE,
  NUMBERED_LIST_TITLE_NODE,
  emptyNumberedListData,
  numberedListItemContent,
  numberedListTitleContent,
} from "./content";
import { numberedListDocumentSemantics } from "./numbered-list-document-semantics";

export const NUMBERED_LIST_BLOCK_ID = "numbered-list";

const DEFAULT_TITLE = "Numbered list";
const DEFAULT_ITEMS = ["Add the first item", "Add the second item"] as const;

export const numberedListBlockDefinition = defineBlock({
  nodeType: NUMBERED_LIST_NODE,
  title: "Numbered list",
  documentSemantics: numberedListDocumentSemantics,
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
    content: () => ({
      type: NUMBERED_LIST_NODE,
      attrs: {
        id: createEmbeddedNodeId(),
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
            id: createEmbeddedNodeId(),
            status: "neutral",
          },
          content: numberedListItemContent(item),
        })),
      ],
    }),
  },
});
