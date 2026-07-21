import { Extension } from "@tiptap/core";
import { type NodeViewProps } from "@tiptap/react";

import { AssessmentRuntimeProblemContent } from "@/editor/blocks/assessment/shared/runtime/AssessmentRuntimeProblemContent";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { categoriseBlockDefinition } from "./categorise-definition";
import {
  CategoriseBinRuntimeNode,
  CategoriseBinsGroupRuntimeNode,
  CategoriseContentRuntimeNode,
  CategoriseItemBodyRuntimeNode,
  CategoriseItemRuntimeNode,
  CategoriseItemsGroupRuntimeNode,
} from "./categorise-fields-runtime";
import { createCategoriseNode } from "./node";

function CategoriseRuntimeView(props: NodeViewProps) {
  return (
    <AssessmentRuntimeProblemContent
      blockClass="sc-categorise"
      definition={categoriseBlockDefinition}
      props={props}
    />
  );
}

const CategoriseRuntimeNode = createCategoriseNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-assessment-node-view",
      definition: categoriseBlockDefinition,
      view: { component: CategoriseRuntimeView },
    }),
});

export const CategoriseRuntimeExtension = Extension.create({
  name: "categorise_runtime_bundle",

  addExtensions() {
    return [
      CategoriseItemBodyRuntimeNode,
      CategoriseItemRuntimeNode,
      CategoriseItemsGroupRuntimeNode,
      CategoriseBinRuntimeNode,
      CategoriseBinsGroupRuntimeNode,
      CategoriseContentRuntimeNode,
      CategoriseRuntimeNode,
    ];
  },
});
