import type { Editor } from "@tiptap/core";

import { requireLayerMutationAccessForState } from "@/document/authoring/layers/layer-editing-boundaries";
import { insertGridWithAccessAt } from "@/editor/arrangements/grid/model/grid-commands";
import type { GridTemplateOptions } from "@/editor/arrangements/grid/model/grid-model";

/** Adapts live authoring state to the explicit facts required by checked Grid insertion. */
export function insertGridAt(
  editor: Editor,
  pos: number,
  options: GridTemplateOptions = {},
): boolean {
  return insertGridWithAccessAt(
    editor,
    pos,
    requireLayerMutationAccessForState(editor.state),
    options,
  );
}
