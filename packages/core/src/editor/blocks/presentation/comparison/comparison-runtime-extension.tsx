import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { ComparisonCellView, ComparisonRowView, ComparisonView } from "./Comparison";
import { comparisonBlockDefinition } from "./comparison-definition";
import { createComparisonNode } from "./node";
import { ComparisonCellNode, createComparisonRowNode } from "./slots";

const ComparisonRowRuntimeNode = createComparisonRowNode({
  addNodeView: () => ReactNodeViewRenderer(ComparisonRowView),
});

const ComparisonRuntimeRootNode = createComparisonNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-comparison",
      definition: comparisonBlockDefinition,
      view: { component: ComparisonView },
    }),
});

const ComparisonCellRuntimeNode = ComparisonCellNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ComparisonCellView);
  },
});

export const ComparisonRuntimeExtension = Extension.create({
  name: "comparison_runtime_bundle",

  addExtensions() {
    return [ComparisonCellRuntimeNode, ComparisonRowRuntimeNode, ComparisonRuntimeRootNode];
  },
});
