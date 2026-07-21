import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";
import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";

import { mcqBlockDefinition } from "./mcq-definition";
import { createMcqNode } from "./node";
import "./mcq.css";

function McqAuthoringView() {
  return <AssessmentProblemContent editable blockClass="sc-mcq" />;
}

export const McqAuthoringExtension = createMcqNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: mcqBlockDefinition,
      view: { component: McqAuthoringView },
    }),
});
