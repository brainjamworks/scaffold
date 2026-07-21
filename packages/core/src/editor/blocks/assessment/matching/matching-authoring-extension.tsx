import { Extension } from "@tiptap/core";

import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { matchingBlockDefinition } from "./matching-definition";
import {
  MatchingItemNode,
  MatchingPairNode,
  MatchingPairsGroupNode,
  MatchingTargetNode,
} from "./matching-fields";
import { createMatchingNode } from "./node";

function MatchingAuthoringView() {
  return <AssessmentProblemContent editable blockClass="sc-matching" />;
}

const MatchingAuthoringNode = createMatchingNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: matchingBlockDefinition,
      view: { component: MatchingAuthoringView },
    }),
});

export const MatchingAuthoringExtension = Extension.create({
  name: "matching_authoring_bundle",

  addExtensions() {
    return [
      MatchingItemNode,
      MatchingTargetNode,
      MatchingPairNode,
      MatchingPairsGroupNode,
      MatchingAuthoringNode,
    ];
  },
});
