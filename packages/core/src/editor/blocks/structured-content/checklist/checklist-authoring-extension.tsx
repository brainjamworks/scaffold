import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { ChecklistAuthoringView } from "./Checklist";
import { checklistBlockDefinition } from "./checklist-definition";
import { createChecklistNode } from "./node";
import { ChecklistItemNode } from "./slots";

const ChecklistAuthoringRootNode = createChecklistNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-checklist",
      definition: checklistBlockDefinition,
      view: { component: ChecklistAuthoringView },
    }),
});

export const ChecklistAuthoringExtension = Extension.create({
  name: "checklist_authoring_bundle",

  addExtensions() {
    return [ChecklistItemNode, ChecklistAuthoringRootNode];
  },
});
