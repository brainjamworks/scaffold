import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { ProcessFlowRuntimeView, ProcessFlowStepRuntimeView } from "./ProcessFlow";
import { createProcessFlowNode } from "./node";
import { processFlowBlockDefinition } from "./process-flow-definition";
import { createProcessFlowStepNode } from "./slots";

const ProcessFlowStepRuntimeNode = createProcessFlowStepNode({
  addNodeView: () => ReactNodeViewRenderer(ProcessFlowStepRuntimeView),
});

const ProcessFlowRuntimeNode = createProcessFlowNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-course-process-flow-node",
      definition: processFlowBlockDefinition,
      view: { component: ProcessFlowRuntimeView },
    }),
});

export const ProcessFlowRuntimeExtension = Extension.create({
  name: "process_flow_runtime_bundle",

  addExtensions() {
    return [ProcessFlowStepRuntimeNode, ProcessFlowRuntimeNode];
  },
});
