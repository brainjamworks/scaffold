import { type NodeViewProps } from "@tiptap/react";

import { AssessmentRuntimeProblemContent } from "@/editor/blocks/assessment/shared/runtime/AssessmentRuntimeProblemContent";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { multiselectBlockDefinition } from "./multiselect-definition";
import { createMultiselectNode } from "./node";
import "./multiselect.css";

function MultiselectRuntimeView(props: NodeViewProps) {
  return (
    <AssessmentRuntimeProblemContent
      blockClass="sc-multiselect"
      definition={multiselectBlockDefinition}
      props={props}
    />
  );
}

export const MultiselectRuntimeExtension = createMultiselectNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-assessment-node-view",
      definition: multiselectBlockDefinition,
      view: { component: MultiselectRuntimeView },
    }),
});
