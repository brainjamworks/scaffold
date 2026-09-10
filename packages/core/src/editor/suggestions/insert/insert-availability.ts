import type { Editor } from "@tiptap/core";

import { readLayerEditingContextForState } from "@/document/authoring/layers/layer-editing-boundaries";
import type { BlockDefinition } from "@/editor/blocks/block-definition";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type { QuickMenuDefinition } from "@/editor/configuration/quick-menu";
import type {
  InsertAction,
  InsertActionIntent,
  InsertActionRange,
} from "@/editor/insertion/insert-action";
import {
  resolveInsertActionPlacement,
  type InsertActionPlacementDependencies,
} from "@/editor/insertion/insertion-placement";
import { resolveCourseSelectionProjection } from "@/editor/selection/course-selection-projection";
import { CourseSelectionMode } from "@/editor/selection/selection-facts";

export function canInsertCatalogItem(
  editor: Editor,
  item: InsertAction,
  dependencies: InsertActionPlacementDependencies,
  range?: InsertActionRange,
  intent: InsertActionIntent = "ordinary",
): boolean {
  return resolveInsertActionPlacement({
    editor,
    intent,
    item,
    layerEditingContext: readLayerEditingContextForState(
      editor.state,
      dependencies.layoutDefinitions,
      dependencies.blockDefinitions,
    ),
    ...dependencies,
    ...(range ? { range } : {}),
  }).ok;
}

export function getInsertableCatalogItems(
  editor: Editor,
  items: readonly InsertAction[],
  dependencies: InsertActionPlacementDependencies,
  range?: InsertActionRange,
  intent: InsertActionIntent = "ordinary",
): readonly InsertAction[] {
  return items.filter((item) => canInsertCatalogItem(editor, item, dependencies, range, intent));
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
