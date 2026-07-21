import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { createTimelineNode } from "./node";
import { createTimelineItemNode } from "./slots";
import { TimelineAuthoringView, TimelineItemAuthoringView } from "./timeline-authoring-views";
import { timelineBlockDefinition } from "./timeline-definition";

const TimelineItemAuthoringNode = createTimelineItemNode({
  addNodeView: () => ReactNodeViewRenderer(TimelineItemAuthoringView),
});

const TimelineAuthoringRootNode = createTimelineNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-timeline",
      definition: timelineBlockDefinition,
      view: { component: TimelineAuthoringView },
    }),
});

export const TimelineAuthoringExtension = Extension.create({
  name: "timeline_authoring_bundle",

  addExtensions() {
    return [TimelineItemAuthoringNode, TimelineAuthoringRootNode];
  },
});
