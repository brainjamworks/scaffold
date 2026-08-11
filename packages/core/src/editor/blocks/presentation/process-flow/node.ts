import { ProcessFlowDataSchema, type ProcessFlowData } from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";

import {
  PROCESS_FLOW_NODE,
  PROCESS_FLOW_STEP_NODE,
  emptyProcessFlowData,
} from "./content";

export interface ProcessFlowNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createProcessFlowNode(options: ProcessFlowNodeOptions = {}) {
  return Node.create({
    name: PROCESS_FLOW_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${PROCESS_FLOW_STEP_NODE}+`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        data: {
          default: emptyProcessFlowData(),
          parseHTML: (element: HTMLElement) => {
            const raw = element.getAttribute("data-process-flow");
            if (!raw) return emptyProcessFlowData();
            try {
              const parsed = ProcessFlowDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyProcessFlowData();
            } catch {
              return emptyProcessFlowData();
            }
          },
          renderHTML: (attrs: { data: ProcessFlowData }) => ({
            "data-process-flow": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [
        {
          tag: 'section[data-node="process-flow"]',
          contentElement: (element: HTMLElement) =>
            element.querySelector<HTMLElement>(":scope > ol") ?? element,
        },
      ];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "section",
        mergeAttributes(HTMLAttributes, {
          "aria-label": "Process flow",
          "data-node": "process-flow",
        }),
        ["ol", { "aria-label": "Process steps" }, 0],
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

export const ProcessFlowNode = createProcessFlowNode();
