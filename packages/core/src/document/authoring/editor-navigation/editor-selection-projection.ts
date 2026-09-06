import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Selection } from "@tiptap/pm/state";

import { isNodeSelection } from "@/editor/selection/selection-facts";

export interface EditorSelectionItemIndex {
  has(id: EmbeddedNodeId): boolean;
}

export function projectEditorSelection(
  selection: Selection,
  itemById: EditorSelectionItemIndex,
): EmbeddedNodeId | null {
  if (isNodeSelection(selection)) {
    const selectedNodeId = documentTreeItemId(selection.node.attrs["id"], itemById);
    if (selectedNodeId) return selectedNodeId;
  }

  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const ancestorId = documentTreeItemId(selection.$from.node(depth).attrs["id"], itemById);
    if (ancestorId) return ancestorId;
  }

  return null;
}

function documentTreeItemId(
  value: unknown,
  itemById: EditorSelectionItemIndex,
): EmbeddedNodeId | null {
  const parsed = EmbeddedNodeIdSchema.safeParse(value);
  return parsed.success && itemById.has(parsed.data) ? parsed.data : null;
}
