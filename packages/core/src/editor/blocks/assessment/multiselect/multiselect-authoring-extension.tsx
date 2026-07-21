import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";
import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";

import { multiselectBlockDefinition } from "./multiselect-definition";
import { createMultiselectNode } from "./node";
import "./multiselect.css";

function MultiselectAuthoringView() {
  return <AssessmentProblemContent editable blockClass="sc-multiselect" />;
}

export const MultiselectAuthoringExtension = createMultiselectNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: multiselectBlockDefinition,
      view: { component: MultiselectAuthoringView },
    }),
});
