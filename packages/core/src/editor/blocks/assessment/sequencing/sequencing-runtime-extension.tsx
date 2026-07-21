import { Extension } from "@tiptap/core";
import { type NodeViewProps } from "@tiptap/react";

import { AssessmentRuntimeProblemContent } from "@/editor/blocks/assessment/shared/runtime/AssessmentRuntimeProblemContent";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { createSequencingNode } from "./node";
import { sequencingBlockDefinition } from "./sequencing-definition";
import {
  SequencingItemRuntimeNode,
  SequencingItemsGroupRuntimeNode,
} from "./sequencing-fields-runtime";

function SequencingRuntimeView(props: NodeViewProps) {
  return (
    <AssessmentRuntimeProblemContent
      blockClass="sc-sequencing"
      definition={sequencingBlockDefinition}
      props={props}
    />
  );
}

const SequencingRuntimeNode = createSequencingNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-assessment-node-view",
      definition: sequencingBlockDefinition,
      view: { component: SequencingRuntimeView },
    }),
});

export const SequencingRuntimeExtension = Extension.create({
  name: "sequencing_runtime_bundle",

  addExtensions() {
    return [SequencingItemRuntimeNode, SequencingItemsGroupRuntimeNode, SequencingRuntimeNode];
  },
});
