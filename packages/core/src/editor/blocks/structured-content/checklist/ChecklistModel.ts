import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ChecklistDataSchema, type ChecklistData } from "@scaffold/contracts";

import { CHECKLIST_ITEM_NODE, emptyChecklistData } from "./content";

export function parseChecklistData(raw: unknown): ChecklistData {
  const parsed = ChecklistDataSchema.safeParse(raw);
  return parsed.success ? parsed.data : emptyChecklistData();
}

export function readNodeId(node: ProseMirrorNode): string | null {
  const raw = node.attrs["id"];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function countChecklistItems(node: ProseMirrorNode): number {
  let total = 0;
  node.forEach((child) => {
    if (child.type.name === CHECKLIST_ITEM_NODE) total += 1;
  });
  return total;
}

export function countChecklistCompleted(
  node: ProseMirrorNode,
  checked: Readonly<Record<string, boolean>>,
): number {
  let count = 0;
  node.forEach((child) => {
    if (child.type.name !== CHECKLIST_ITEM_NODE) return;
    const id = child.attrs["id"];
    if (typeof id === "string" && checked[id]) count += 1;
  });
  return count;
}
