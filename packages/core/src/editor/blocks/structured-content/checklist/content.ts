import type { JSONContent } from "@tiptap/core";
import { ChecklistDataSchema, type ChecklistData } from "@scaffold/contracts";

export const CHECKLIST_NODE = "checklist";
export const CHECKLIST_ITEM_NODE = "checklist_item";

export function emptyChecklistData(overrides: Partial<ChecklistData> = {}): ChecklistData {
  return ChecklistDataSchema.parse(overrides);
}

export function checklistItemContent(body?: string): JSONContent[] {
  return [
    {
      type: "paragraph",
      ...(body ? { content: [{ type: "text", text: body }] } : {}),
    },
  ];
}
