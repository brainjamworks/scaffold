import { GridFourIcon as GridFour } from "@phosphor-icons/react";

import { editableRegionContentJSON } from "@/document/model/content-model/editable-region";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import type { InsertAction } from "@/editor/insertion/insert-action";

function createGridInsertContent() {
  return {
    type: "grid",
    attrs: { id: createEmbeddedNodeId(), columnWidths: [1, 1] },
    content: Array.from({ length: 2 }, () => ({
      type: "cell",
      attrs: { id: createEmbeddedNodeId() },
      content: editableRegionContentJSON(),
    })),
  };
}

export const gridInsertAction: InsertAction = Object.freeze({
  id: "grid",
  nodeType: "grid",
  category: "layout",
  title: "Grid",
  description: "Create a two-cell grid",
  icon: GridFour,
  keywords: Object.freeze(["columns", "cells", "layout"]),
  content: createGridInsertContent,
});
