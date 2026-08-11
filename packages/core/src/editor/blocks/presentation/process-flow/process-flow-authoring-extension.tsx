import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { createProcessFlowNode } from "./node";
import {
  ProcessFlowAuthoringView,
  ProcessFlowStepAuthoringView,
} from "./process-flow-authoring-views";
import { processFlowBlockDefinition } from "./process-flow-definition";
import { createProcessFlowStepNode } from "./slots";

const ProcessFlowStepAuthoringNode = createProcessFlowStepNode({
  addNodeView: () => ReactNodeViewRenderer(ProcessFlowStepAuthoringView),
});

const ProcessFlowAuthoringNode = createProcessFlowNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-course-process-flow-node",
      definition: processFlowBlockDefinition,
      view: { component: ProcessFlowAuthoringView },
    }),
});

export const ProcessFlowAuthoringExtension = Extension.create({
  name: "process_flow_authoring_bundle",

  addExtensions() {
    return [ProcessFlowStepAuthoringNode, ProcessFlowAuthoringNode];
  },
});
