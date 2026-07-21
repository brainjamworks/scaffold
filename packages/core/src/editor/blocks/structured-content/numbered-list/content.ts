import { NumberedListDataSchema, type NumberedListData } from "@scaffold/contracts";
import type { JSONContent } from "@tiptap/core";

export const NUMBERED_LIST_NODE = "numbered_list";
export const NUMBERED_LIST_TITLE_NODE = "numbered_list_title";
export const NUMBERED_LIST_ITEM_NODE = "numbered_list_item";

export function emptyNumberedListData(overrides: Partial<NumberedListData> = {}): NumberedListData {
  return NumberedListDataSchema.parse(overrides);
}

export function numberedListTitleContent(text?: string): JSONContent[] {
  return [
    {
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ];
}

export function numberedListItemContent(text?: string): JSONContent[] {
  return [
    {
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ];
}
