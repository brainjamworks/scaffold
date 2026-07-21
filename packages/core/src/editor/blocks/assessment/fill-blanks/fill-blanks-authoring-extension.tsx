import { Extension } from "@tiptap/core";

import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { FillBlankAuthoringNode } from "./fill-blank-authoring";
import { fillBlanksBlockDefinition } from "./fill-blanks-definition";
import { FillBlanksBodyNode } from "./fill-blanks-body";
import { createFillBlanksNode } from "./node";

function FillBlanksAuthoringView() {
  return <AssessmentProblemContent editable blockClass="sc-fill-blanks" />;
}

const FillBlanksAuthoringNode = createFillBlanksNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: fillBlanksBlockDefinition,
      view: { component: FillBlanksAuthoringView },
    }),
});

export const FillBlanksAuthoringExtension = Extension.create({
  name: "fill_blanks_authoring_bundle",

  addExtensions() {
    return [FillBlankAuthoringNode, FillBlanksBodyNode, FillBlanksAuthoringNode];
  },
});
