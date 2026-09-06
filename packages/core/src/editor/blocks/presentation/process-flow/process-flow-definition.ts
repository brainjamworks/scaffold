import {
  ArrowsDownUpIcon as ArrowsDownUp,
  ArrowsLeftRightIcon as ArrowsLeftRight,
  FlowArrowIcon as FlowArrow,
  ListNumbersIcon as ListNumbers,
} from "@phosphor-icons/react";
import { ProcessFlowDataSchema } from "@scaffold/contracts";

import { defineBlock } from "@/editor/blocks/block-definition";
import { defineConfiguration } from "@/editor/configuration/definition";

import { PROCESS_FLOW_NODE, PROCESS_FLOW_STEP_NODE, createProcessFlowContent } from "./content";
import { processFlowDocumentTree } from "./process-flow-document-tree";

export const PROCESS_FLOW_BLOCK_ID = "process-flow";

export const processFlowBlockDefinition = defineBlock({
  nodeType: PROCESS_FLOW_NODE,
  title: "Process flow",
  documentTree: processFlowDocumentTree,
  configuration: defineConfiguration({
    attr: "data",
    schema: ProcessFlowDataSchema,
    sheet: {
      title: "Process flow settings",
      sections: [{ id: "presentation", title: "Presentation" }],
      defaultOpenSections: ["presentation"],
    },
    controls: [
      {
        kind: "select",
        name: "orientation",
        label: "Orientation",
        options: [
          { value: "horizontal", label: "Horizontal", icon: ArrowsLeftRight },
          { value: "vertical", label: "Vertical", icon: ArrowsDownUp },
        ],
        placement: {
          quickMenu: { presentation: "segmented" },
          sheet: { section: "presentation" },
        },
      },
      {
        kind: "boolean",
        name: "showNumbers",
        label: "Step numbers",
        icon: ListNumbers,
        presentation: "switch",
        placement: {
          quickMenu: { presentation: "icon-toggle" },
          sheet: { section: "presentation" },
        },
      },
      {
        kind: "boolean",
        name: "showConnectors",
        label: "Connectors",
        icon: FlowArrow,
        presentation: "switch",
        placement: {
          quickMenu: { presentation: "icon-toggle" },
          sheet: { section: "presentation" },
        },
      },
    ],
  }),
  placeholders: {
    paragraph: ({ $pos }) => {
      for (let depth = $pos.depth; depth >= 0; depth -= 1) {
        const node = $pos.node(depth);
        if (node.type.name !== PROCESS_FLOW_STEP_NODE) continue;
        return $pos.index(depth) === 0 ? "Step title" : "Description";
      }
      return undefined;
    },
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  boundedPlacement: "fill",
  insert: {
    id: PROCESS_FLOW_BLOCK_ID,
    category: "display",
    title: "Process flow",
    description: "Connected cards for steps, stages, or a procedure",
    icon: FlowArrow,
    keywords: ["process", "flow", "steps", "stages", "pipeline", "procedure"],
    content: () => createProcessFlowContent() as Record<string, unknown>,
  },
});
