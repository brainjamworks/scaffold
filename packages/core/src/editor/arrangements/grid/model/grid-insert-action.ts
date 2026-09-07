import { GridFourIcon as GridFour } from "@phosphor-icons/react";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { createBlankLayer } from "@/document/model/layers/layer-construction";
import type { InsertAction } from "@/editor/insertion/insert-action";

function createGridInsertContent() {
  return {
    type: "grid",
    attrs: { id: createEmbeddedNodeId(), columnWidths: [1, 1] },
    content: Array.from({ length: 2 }, () => ({
      type: "cell",
      attrs: { id: createEmbeddedNodeId() },
      content: [createBlankLayer()],
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
  boundedPlacement: "fill",
  content: createGridInsertContent,
});
