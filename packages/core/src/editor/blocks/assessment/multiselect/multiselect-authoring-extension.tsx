import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";
import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import type { NodeViewProps } from "@tiptap/react";

import { multiselectBlockDefinition } from "./multiselect-definition";
import { createMultiselectNode } from "./node";
import "./multiselect.css";

function MultiselectAuthoringView(props: NodeViewProps) {
  return (
    <AssessmentProblemContent editable blockClass="sc-course-multiselect" nodeViewProps={props} />
  );
}

export const MultiselectAuthoringExtension = createMultiselectNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: multiselectBlockDefinition,
      view: { component: MultiselectAuthoringView },
    }),
});
