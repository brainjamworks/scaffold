import { Extension } from "@tiptap/core";
import { type NodeViewProps } from "@tiptap/react";

import { AssessmentRuntimeProblemContent } from "@/editor/blocks/assessment/shared/runtime/AssessmentRuntimeProblemContent";
import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { dropdownBlockDefinition } from "./dropdown-definition";
import {
  DropdownChoiceLabelRuntimeNode,
  DropdownChoiceRuntimeNode,
  DropdownChoicesGroupRuntimeNode,
} from "./dropdown-choice-runtime";
import { createDropdownNode } from "./node";

function DropdownRuntimeView(props: NodeViewProps) {
  return (
    <AssessmentRuntimeProblemContent
      blockClass="sc-dropdown"
      definition={dropdownBlockDefinition}
      props={props}
    />
  );
}

const DropdownRuntimeNode = createDropdownNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-assessment-node-view",
      definition: dropdownBlockDefinition,
      view: { component: DropdownRuntimeView },
    }),
});

export const DropdownRuntimeExtension = Extension.create({
  name: "dropdown_runtime_bundle",

  addExtensions() {
    return [
      DropdownChoiceLabelRuntimeNode,
      DropdownChoiceRuntimeNode,
      DropdownChoicesGroupRuntimeNode,
      DropdownRuntimeNode,
    ];
  },
});
