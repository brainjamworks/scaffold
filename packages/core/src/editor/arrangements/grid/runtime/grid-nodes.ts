import { ReactNodeViewRenderer } from "@tiptap/react";

import { CellRuntimeNodeView, GridRuntimeNodeView } from "./grid-node-views";
import { createCellNode, createGridNode } from "../model/grid-nodes";

export const GridRuntimeNode = createGridNode({
  addNodeView: () => ReactNodeViewRenderer(GridRuntimeNodeView),
});

export const CellRuntimeNode = createCellNode({
  addNodeView: () => ReactNodeViewRenderer(CellRuntimeNodeView),
});
