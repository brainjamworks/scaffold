import { Extension } from "@tiptap/core";
import { type NodeViewProps } from "@tiptap/react";

import { AssessmentRuntimeProblemContent } from "@/editor/blocks/assessment/shared/runtime/AssessmentRuntimeProblemContent";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { matchingBlockDefinition } from "./matching-definition";
import {
  MatchingItemRuntimeNode,
  MatchingPairRuntimeNode,
  MatchingPairsGroupRuntimeNode,
  MatchingTargetRuntimeNode,
} from "./matching-fields-runtime";
import { createMatchingNode } from "./node";

function MatchingRuntimeView(props: NodeViewProps) {
  return (
    <AssessmentRuntimeProblemContent
      blockClass="sc-matching"
      definition={matchingBlockDefinition}
      props={props}
    />
  );
}

const MatchingRuntimeNode = createMatchingNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-assessment-node-view",
      definition: matchingBlockDefinition,
      view: { component: MatchingRuntimeView },
    }),
});

export const MatchingRuntimeExtension = Extension.create({
  name: "matching_runtime_bundle",

  addExtensions() {
    return [
      MatchingItemRuntimeNode,
      MatchingTargetRuntimeNode,
      MatchingPairRuntimeNode,
      MatchingPairsGroupRuntimeNode,
      MatchingRuntimeNode,
    ];
  },
});
