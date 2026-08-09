import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Selection } from "@tiptap/pm/state";

import { isNodeSelection } from "@/editor/selection/selection-facts";

export interface SemanticSelectionItemIndex {
  has(id: EmbeddedNodeId): boolean;
}

export function projectSemanticSelection(
  selection: Selection,
  itemById: SemanticSelectionItemIndex,
): EmbeddedNodeId | null {
  if (isNodeSelection(selection)) {
    const selectedNodeId = semanticItemId(selection.node.attrs["id"], itemById);
    if (selectedNodeId) return selectedNodeId;
  }

  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const ancestorId = semanticItemId(selection.$from.node(depth).attrs["id"], itemById);
    if (ancestorId) return ancestorId;
  }

  return null;
}

function semanticItemId(
  value: unknown,
  itemById: SemanticSelectionItemIndex,
): EmbeddedNodeId | null {
  const parsed = EmbeddedNodeIdSchema.safeParse(value);
  return parsed.success && itemById.has(parsed.data) ? parsed.data : null;
}
