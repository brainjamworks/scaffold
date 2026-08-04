import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { ComparisonCellView } from "./Comparison";
import {
  ComparisonAuthoringView,
  ComparisonRowAuthoringView,
} from "./comparison-authoring-controls";
import { comparisonBlockDefinition } from "./comparison-definition";
import { createComparisonNode } from "./node";
import { ComparisonCellNode, createComparisonRowNode } from "./slots";
import "./ComparisonAuthoringControls.css";

const ComparisonRowAuthoringNode = createComparisonRowNode({
  addNodeView: () => ReactNodeViewRenderer(ComparisonRowAuthoringView),
});

const ComparisonAuthoringRootNode = createComparisonNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-course-comparison",
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
