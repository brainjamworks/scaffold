import { Extension } from "@tiptap/core";

import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { createSequencingNode } from "./node";
import { sequencingBlockDefinition } from "./sequencing-definition";
import { SequencingItemNode, SequencingItemsGroupNode } from "./sequencing-fields";

function SequencingAuthoringView() {
  return <AssessmentProblemContent editable blockClass="sc-sequencing" />;
}

const SequencingAuthoringNode = createSequencingNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: sequencingBlockDefinition,
      view: { component: SequencingAuthoringView },
    }),
});

export const SequencingAuthoringExtension = Extension.create({
  name: "sequencing_authoring_bundle",

  addExtensions() {
    return [SequencingItemNode, SequencingItemsGroupNode, SequencingAuthoringNode];
  },
});
