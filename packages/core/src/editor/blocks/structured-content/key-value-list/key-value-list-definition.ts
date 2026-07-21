import { TableIcon as Table } from "@phosphor-icons/react";
import {
  KeyValueListDataSchema,
  KeyValueListKeyWidthSchema,
  KeyValueListLayoutSchema,
} from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  KEY_VALUE_LIST_NODE,
  KEY_VALUE_ROW_KEY_NODE,
  KEY_VALUE_ROW_NODE,
  KEY_VALUE_ROW_VALUE_NODE,
  emptyKeyValueListData,
} from "./content";

export const KEY_VALUE_LIST_BLOCK_ID = "key-value-list";

const LAYOUT_LABELS: Record<"stacked" | "inline" | "grid", string> = {
  stacked: "Stacked",
  inline: "Inline",
  grid: "Grid",
};

const KEY_WIDTH_LABELS: Record<"auto" | "narrow" | "medium" | "wide", string> = {
  auto: "Auto",
  narrow: "Narrow",
  medium: "Medium",
  wide: "Wide",
};

export const keyValueListBlockDefinition = defineBlock({
  nodeType: KEY_VALUE_LIST_NODE,
  configuration: defineConfiguration({
    attr: "data",
    schema: KeyValueListDataSchema,
    sheet: {
      title: "Key-value list",
      defaultOpenSections: ["layout"],
      sections: [{ id: "layout", title: "Layout" }],
    },
    controls: [
      {
        kind: "select",
        name: "layout",
        label: "Layout",
        options: KeyValueListLayoutSchema.options.map((value) => ({
          value,
          label: LAYOUT_LABELS[value],
        })),
        placement: { sheet: { section: "layout" } },
      },
      {
        kind: "select",
        name: "keyWidth",
        label: "Key width",
        options: KeyValueListKeyWidthSchema.options.map((value) => ({
          value,
          label: KEY_WIDTH_LABELS[value],
        })),
        placement: { sheet: { section: "layout" } },
      },
    ],
  }),
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  placeholders: {
    [KEY_VALUE_ROW_KEY_NODE]: "Key",
    [KEY_VALUE_ROW_VALUE_NODE]: "Value",
  },
  insert: {
    id: KEY_VALUE_LIST_BLOCK_ID,
    category: "content",
    title: "Key-value list",
    description: "Definition pairs: term and its value, repeated",
    icon: Table,
    keywords: ["key", "value", "definition", "list", "pairs", "attributes", "spec"],
    content: () => ({
      type: KEY_VALUE_LIST_NODE,
      attrs: {
        id: createStableId(),
        data: emptyKeyValueListData(),
      },
      content: Array.from({ length: 3 }, () => ({
        type: KEY_VALUE_ROW_NODE,
        attrs: { id: createStableId() },
        content: [
          { type: KEY_VALUE_ROW_KEY_NODE, content: [{ type: "paragraph" }] },
          { type: KEY_VALUE_ROW_VALUE_NODE, content: [{ type: "paragraph" }] },
        ],
      })),
    }),
  },
});
