import {
  ArrowsDownUpIcon as ArrowsDownUp,
  ArrowsLeftRightIcon as ArrowsLeftRight,
  FlowArrowIcon as FlowArrow,
  ListNumbersIcon as ListNumbers,
} from "@phosphor-icons/react";
import { z } from "zod";

import { defineConfiguration } from "@/editor/configuration/definition";

import type { LayoutDefinition } from "../model/layout-definition";
import { createProcessFlowContent, createProcessFlowSection } from "./process-flow-content";

const ProcessFlowLayoutOptionsSchema = z.object({
  showNumbers: z.boolean().default(true),
  showConnectors: z.boolean().default(true),
  orientation: z.enum(["horizontal", "vertical"]).default("horizontal"),
});

export const processFlowLayoutDefinition = {
  id: "process-flow",
  title: "Process flow",
  description: "Connected boxes for steps, stages, or a procedure",
  icon: FlowArrow,
  category: "display",
  keywords: ["process", "flow", "steps", "stages", "pipeline", "boxes"],
  configuration: defineConfiguration({
    attr: "options",
    schema: ProcessFlowLayoutOptionsSchema,
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
        label: "Numbered headers",
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
  section: {
    label: "Step",
    addLabel: "Add step",
    create: ({ index }) => createProcessFlowSection(index),
  },
  createContent: (input) => createProcessFlowContent(input?.options),
} satisfies LayoutDefinition;
