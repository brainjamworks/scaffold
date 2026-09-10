import type { Editor } from "@tiptap/core";

import { requireLayerMutationAccessForState } from "@/document/authoring/layers/layer-editing-boundaries";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  insertCatalogItemWithAccessChecked,
  type InsertActionCheckedRange,
} from "@/editor/insertion/checked-insertion";
import type { InsertAction, InsertActionIntent } from "@/editor/insertion/insert-action";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { SurfaceVariantLookup } from "@/editor/surfaces/model/surface-variant-registry";

/** Adapts live authoring state to the explicit facts required by checked insertion. */
export function insertCatalogItemChecked(
  editor: Editor,
  item: InsertAction,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
  surfaceVariants: SurfaceVariantLookup,
  range: InsertActionCheckedRange = {
    from: editor.state.selection.from,
    to: editor.state.selection.to,
  },
  intent: InsertActionIntent = "ordinary",
): boolean {
  return insertCatalogItemWithAccessChecked(
    editor,
    item,
    blockDefinitions,
    layoutDefinitions,
    surfaceVariants,
    requireLayerMutationAccessForState(editor.state),
    range,
    intent,
  );
}
