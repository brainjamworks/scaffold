import type { Editor } from "@tiptap/core";

import type { BlockDefinition } from "@/editor/blocks/block-definition";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { QuickMenuDefinition } from "@/editor/configuration/quick-menu";
import type { InsertAction } from "@/editor/insertion/insert-action";
import { resolveCourseSelectionProjection } from "@/editor/selection/course-selection-projection";
import { CourseSelectionMode } from "@/editor/selection/selection-facts";

function insertionParentDepth(editor: Editor): number {
  const { $from } = editor.state.selection;

  if ($from.parent.isTextblock && $from.depth > 0) {
    return $from.depth - 1;
  }

  return $from.depth;
}

export function canInsertCatalogItem(editor: Editor, item: InsertAction): boolean {
  const nodeType = editor.schema.nodes[item.nodeType];
  if (!nodeType) return false;

  const { $from } = editor.state.selection;
  const depth = insertionParentDepth(editor);
  const parent = $from.node(depth);
  const index = $from.index(depth);

  try {
    return Boolean(parent.contentMatchAt(index).matchType(nodeType));
  } catch {
    return false;
  }
}

export function getInsertableCatalogItems(
  editor: Editor,
  items: readonly InsertAction[],
): readonly InsertAction[] {
  return items.filter((item) => canInsertCatalogItem(editor, item));
}

export function getSelectedBlockDefinition(
  editor: Editor,
  blockDefinitions: BlockDefinitionLookup,
): BlockDefinition | null {
  const projection = resolveCourseSelectionProjection(editor.state.selection, blockDefinitions);

  if (projection.facts.selectionMode === CourseSelectionMode.NodeSelection) {
    return projection.objectSelectedBlock
      ? (projection.selectionOwnerBlock?.definition ?? null)
      : null;
  }

  return projection.selectionOwnerBlock?.definition ?? null;
}

export function getSelectedBlockQuickMenu(
  editor: Editor,
  blockDefinitions: BlockDefinitionLookup,
): QuickMenuDefinition | null {
  return getSelectedBlockDefinition(editor, blockDefinitions)?.quickMenu ?? null;
}
