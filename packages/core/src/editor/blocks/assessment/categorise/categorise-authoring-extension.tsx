import { Extension } from "@tiptap/core";

import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";
import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { categoriseBlockDefinition } from "./categorise-definition";
import {
  CategoriseBinNode,
  CategoriseBinTitleNode,
  CategoriseBinsGroupNode,
  CategoriseContentNode,
  CategoriseItemBodyNode,
  CategoriseItemNode,
  CategoriseItemsGroupNode,
} from "./categorise-fields";
import { createCategoriseNode } from "./node";

function CategoriseAuthoringView() {
  return <AssessmentProblemContent editable blockClass="sc-categorise" />;
}

const CategoriseAuthoringNode = createCategoriseNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-assessment-node-view",
      definition: categoriseBlockDefinition,
      view: { component: CategoriseAuthoringView },
    }),
});

export const CategoriseAuthoringExtension = Extension.create({
  name: "categorise_authoring_bundle",

  addExtensions() {
    return [
      CategoriseBinTitleNode,
      CategoriseItemBodyNode,
      CategoriseItemNode,
      CategoriseItemsGroupNode,
      CategoriseBinNode,
      CategoriseBinsGroupNode,
      CategoriseContentNode,
      CategoriseAuthoringNode,
    ];
  },
});
