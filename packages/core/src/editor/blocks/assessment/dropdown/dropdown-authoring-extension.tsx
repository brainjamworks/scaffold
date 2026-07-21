import { Extension } from "@tiptap/core";

import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { dropdownBlockDefinition } from "./dropdown-definition";
import {
  DropdownChoiceLabelNode,
  DropdownChoiceNode,
  DropdownChoicesGroupNode,
} from "./dropdown-choice";
import { createDropdownNode } from "./node";

function DropdownAuthoringView() {
  return <AssessmentProblemContent editable blockClass="sc-dropdown" />;
}

const DropdownAuthoringNode = createDropdownNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: dropdownBlockDefinition,
      view: { component: DropdownAuthoringView },
    }),
});

export const DropdownAuthoringExtension = Extension.create({
  name: "dropdown_authoring_bundle",

  addExtensions() {
    return [
      DropdownChoiceLabelNode,
      DropdownChoiceNode,
      DropdownChoicesGroupNode,
      DropdownAuthoringNode,
    ];
  },
});
