import { type NodeViewProps } from "@tiptap/react";

import { AssessmentRuntimeProblemContent } from "@/editor/blocks/assessment/shared/runtime/AssessmentRuntimeProblemContent";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { mcqBlockDefinition } from "./mcq-definition";
import { createMcqNode } from "./node";
import "./mcq.css";

function McqRuntimeView(props: NodeViewProps) {
  return (
    <AssessmentRuntimeProblemContent
      blockClass="sc-mcq"
      definition={mcqBlockDefinition}
      props={props}
    />
  );
}

export const McqRuntimeExtension = createMcqNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-assessment-node-view",
      definition: mcqBlockDefinition,
      view: { component: McqRuntimeView },
    }),
});
