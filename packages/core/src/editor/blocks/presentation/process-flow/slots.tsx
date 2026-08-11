import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { fieldContainerSpec } from "@/document/model/content-model/content-groups";

import { PROCESS_FLOW_STEP_NODE } from "./content";

export interface ProcessFlowStepNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createProcessFlowStepNode(options: ProcessFlowStepNodeOptions = {}) {
  return Node.create({
    name: PROCESS_FLOW_STEP_NODE,
    ...fieldContainerSpec({ content: "paragraph paragraph?" }),

    parseHTML() {
      return [{ tag: 'li[data-node="process-flow-step"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "li",
        mergeAttributes(HTMLAttributes, { "data-node": "process-flow-step" }),
        0,
      ];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export const ProcessFlowStepNode = createProcessFlowStepNode();
