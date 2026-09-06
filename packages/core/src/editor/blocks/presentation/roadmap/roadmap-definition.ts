import {
  ArrowsDownUpIcon as ArrowsDownUp,
  ArrowsLeftRightIcon as ArrowsLeftRight,
  MapPinIcon as MapPin,
  MapTrifoldIcon as Map,
} from "@phosphor-icons/react";
import { RoadmapDataSchema } from "@scaffold/contracts";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import {
  ROADMAP_MILESTONE_NODE,
  ROADMAP_NODE,
  emptyRoadmapData,
  roadmapMilestoneContent,
} from "./content";
import { roadmapDocumentTree } from "./roadmap-document-tree";

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
  title: "Roadmap",
  documentTree: roadmapDocumentTree,
  configuration: roadmapConfiguration,
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
    description: "A sequence of learning milestones",
    icon: Map,
    keywords: ["roadmap", "milestones", "sequence", "syllabus", "progression"],
    content: () => ({
      type: ROADMAP_NODE,
      attrs: {
        id: createEmbeddedNodeId(),
        data: emptyRoadmapData(),
      },
      content: DEFAULT_MILESTONES.map(({ heading, body }) => ({
        type: ROADMAP_MILESTONE_NODE,
        attrs: {
          id: createEmbeddedNodeId(),
          status: "upcoming",
        },
        content: roadmapMilestoneContent(heading, body),
      })),
    }),
  },
});
