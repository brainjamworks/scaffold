import {
  ArrowsDownUpIcon as ArrowsDownUp,
  ArrowsLeftRightIcon as ArrowsLeftRight,
  MapPinIcon as MapPin,
  MapTrifoldIcon as Map,
} from "@phosphor-icons/react";
import { RoadmapDataSchema, RoadmapMilestoneStatusSchema } from "@scaffold/contracts";
import { z } from "zod";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { validateCatalogNodeAttrs } from "@/editor/insertion/catalog-validation";

import {
  ROADMAP_MILESTONE_NODE,
  ROADMAP_NODE,
  emptyRoadmapData,
  roadmapMilestoneContent,
} from "./content";

export const ROADMAP_BLOCK_ID = "roadmap";

const DEFAULT_MILESTONES = [
  {
    heading: "Foundations",
    body: "What the learner starts with.",
  },
  {
    heading: "Develop",
    body: "How the core ideas are built up.",
  },
  {
    heading: "Mastery",
    body: "Where the learner ends up.",
  },
] as const;

const roadmapConfiguration = defineConfiguration({
  attr: "data",
  schema: RoadmapDataSchema,
  sheet: {
    title: "Roadmap settings",
    defaultOpenSections: ["presentation"],
    sections: [{ id: "presentation", title: "Presentation" }],
  },
  controls: [
    {
      kind: "select",
      name: "orientation",
      label: "Orientation",
      options: [
        { value: "vertical", label: "Vertical", icon: ArrowsDownUp },
        { value: "horizontal", label: "Horizontal", icon: ArrowsLeftRight },
      ],
      placement: {
        quickMenu: { presentation: "segmented" },
        sheet: { section: "presentation" },
      },
    },
    {
      kind: "boolean",
      name: "useIconMarkers",
      label: "Icon markers",
      icon: MapPin,
      presentation: "switch",
      placement: {
        quickMenu: { presentation: "icon-toggle" },
        sheet: { section: "presentation" },
      },
    },
  ],
});

export const roadmapBlockDefinition = defineBlock({
  nodeType: ROADMAP_NODE,
  configuration: roadmapConfiguration,
  identity: {
    stableChildNodeTypes: [ROADMAP_MILESTONE_NODE],
  },
  placeholders: {
    roadmap_milestone: ({ $pos, depth }) => ($pos.index(depth) === 0 ? "Heading" : "Description"),
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: ROADMAP_BLOCK_ID,
    category: "display",
    title: "Roadmap",
    description: "A sequence of milestone chapters",
    icon: Map,
    keywords: ["roadmap", "milestones", "chapters", "syllabus", "progression"],
    validateNode: validateCatalogNodeAttrs([
      {
        nodeType: ROADMAP_MILESTONE_NODE,
        schema: z.object({ status: RoadmapMilestoneStatusSchema }),
        field: "status",
        message: "Roadmap catalog content contains an invalid milestone status.",
      },
    ]),
    content: () => ({
      type: ROADMAP_NODE,
      attrs: {
        id: createStableId(),
        data: emptyRoadmapData(),
      },
      content: DEFAULT_MILESTONES.map(({ heading, body }) => ({
        type: ROADMAP_MILESTONE_NODE,
        attrs: {
          id: createStableId(),
          status: "upcoming",
        },
        content: roadmapMilestoneContent(heading, body),
      })),
    }),
  },
});
