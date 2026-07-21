import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { ComparisonCellView, ComparisonRowView, ComparisonView } from "./Comparison";
import { renderComparisonAddControl } from "./comparison-authoring-controls";
import { comparisonBlockDefinition } from "./comparison-definition";
import { createComparisonNode } from "./node";
import { ComparisonCellNode, createComparisonRowNode } from "./slots";

function ComparisonAuthoringView(props: NodeViewProps) {
  return <ComparisonView {...props} renderAddControl={renderComparisonAddControl} />;
}

const ComparisonRowAuthoringNode = createComparisonRowNode({
  addNodeView: () => ReactNodeViewRenderer(ComparisonRowView),
});

const ComparisonAuthoringRootNode = createComparisonNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-comparison",
      definition: comparisonBlockDefinition,
      view: { component: ComparisonAuthoringView },
    }),
});

const ComparisonCellAuthoringNode = ComparisonCellNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ComparisonCellView);
  },
});

export const ComparisonAuthoringExtension = Extension.create({
  name: "comparison_authoring_bundle",

  addExtensions() {
    return [ComparisonCellAuthoringNode, ComparisonRowAuthoringNode, ComparisonAuthoringRootNode];
  },
});
