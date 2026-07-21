import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { CellNodeView } from "./CellNodeView";
import { GridNodeView } from "./GridNodeView";
import { createCellNode, createGridNode } from "../model/grid-nodes";

export function createGridAuthoringNodes(blockDefinitions: BlockDefinitionLookup) {
  const GridNodeViewWithBlockDefinitions = (props: NodeViewProps) => (
    <GridNodeView {...props} blockDefinitions={blockDefinitions} />
  );
  const CellNodeViewWithBlockDefinitions = (props: NodeViewProps) => (
    <CellNodeView {...props} blockDefinitions={blockDefinitions} />
  );

  return {
    GridAuthoringNode: createGridNode({
      addNodeView: () => ReactNodeViewRenderer(GridNodeViewWithBlockDefinitions),
    }),
    CellAuthoringNode: createCellNode({
      addNodeView: () => ReactNodeViewRenderer(CellNodeViewWithBlockDefinitions),
    }),
  };
}

export const { CellAuthoringNode, GridAuthoringNode } =
  createGridAuthoringNodes(builtInBlockRegistry);
