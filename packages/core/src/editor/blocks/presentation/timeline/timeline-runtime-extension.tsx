import { Extension } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { TimelineItemRuntimeView, TimelineRuntimeView } from "./Timeline";
import { createTimelineNode } from "./node";
import { createTimelineItemNode } from "./slots";
import { timelineBlockDefinition } from "./timeline-definition";

const TimelineItemRuntimeNode = createTimelineItemNode({
  addNodeView: () => ReactNodeViewRenderer(TimelineItemRuntimeView),
});

const TimelineRuntimeRootNode = createTimelineNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-timeline",
      definition: timelineBlockDefinition,
      view: { component: TimelineRuntimeView },
    }),
});

export const TimelineRuntimeExtension = Extension.create({
  name: "timeline_runtime_bundle",

  addExtensions() {
    return [TimelineItemRuntimeNode, TimelineRuntimeRootNode];
  },
});
