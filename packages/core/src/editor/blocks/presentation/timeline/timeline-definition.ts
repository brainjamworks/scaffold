import {
  AlignLeftIcon as AlignLeft,
  AlignRightIcon as AlignRight,
  ArrowsLeftRightIcon as ArrowsLeftRight,
  ClockClockwiseIcon as ClockClockwise,
  LineVerticalIcon as LineVertical,
  RowsIcon as Rows,
  SlideshowIcon as Slideshow,
} from "@phosphor-icons/react";
import {
  TimelineAlignmentSchema,
  TimelineDataSchema,
  TimelinePresentationSchema,
  type TimelineAlignment,
  type TimelinePresentation,
} from "@scaffold/contracts";

import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import { TIMELINE_ITEM_NODE, TIMELINE_NODE, createTimelineContent } from "./content";

export const TIMELINE_BLOCK_ID = "timeline";

const ALIGNMENT_LABELS: Record<TimelineAlignment, string> = {
  alternate: "Alternate",
  left: "Left",
  right: "Right",
};

const PRESENTATION_LABELS: Record<TimelinePresentation, string> = {
  vertical: "Vertical",
  carousel: "Carousel",
};

export const timelineBlockDefinition = defineBlock({
  nodeType: TIMELINE_NODE,
  configuration: defineConfiguration({
    attr: "data",
    schema: TimelineDataSchema,
    sheet: {
      title: "Timeline settings",
      sections: [{ id: "presentation", title: "Presentation" }],
      defaultOpenSections: ["presentation"],
    },
    controls: [
      {
        kind: "select",
        name: "presentation",
        label: "Presentation",
        options: TimelinePresentationSchema.options.map((value) => ({
          value,
          label: PRESENTATION_LABELS[value],
          icon: value === "carousel" ? Slideshow : Rows,
        })),
        placement: {
          quickMenu: { presentation: "segmented" },
          sheet: { section: "presentation" },
        },
      },
      {
        kind: "select",
        name: "alignment",
        label: "Alignment",
        options: TimelineAlignmentSchema.options.map((value) => ({
          value,
          label: ALIGNMENT_LABELS[value],
          icon: value === "alternate" ? ArrowsLeftRight : value === "left" ? AlignLeft : AlignRight,
        })),
        placement: {
          quickMenu: { presentation: "segmented" },
          sheet: { section: "presentation" },
        },
      },
      {
        kind: "boolean",
        name: "showAxis",
        label: "Show axis",
        icon: LineVertical,
        presentation: "switch",
        placement: {
          quickMenu: { presentation: "icon-toggle" },
          sheet: { section: "presentation" },
        },
      },
    ],
  }),
  identity: {
    stableChildNodeTypes: [TIMELINE_ITEM_NODE],
  },
  placeholders: {
    paragraph: ({ $pos }) => {
      for (let depth = $pos.depth; depth >= 0; depth -= 1) {
        const node = $pos.node(depth);
        if (node.type.name !== TIMELINE_ITEM_NODE) continue;
        const paragraphIndex = $pos.index(depth);
        if (paragraphIndex === 0) return "Date";
        if (paragraphIndex === 1) return "Event title";
        return "Description";
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
    id: TIMELINE_BLOCK_ID,
    category: "activity",
    title: "Timeline",
    description: "Chronological events along a visual rail",
    icon: ClockClockwise,
    keywords: ["timeline", "history", "chronology", "events", "dates"],
    content: () => createTimelineContent() as Record<string, unknown>,
  },
});
