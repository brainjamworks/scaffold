import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { fieldContainerSpec } from "@/document/model/content-model/content-groups";

import { TIMELINE_ITEM_NODE } from "./content";

export interface TimelineItemNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createTimelineItemNode(options: TimelineItemNodeOptions = {}) {
  return Node.create({
    name: TIMELINE_ITEM_NODE,
    ...fieldContainerSpec(),

    parseHTML() {
      return [{ tag: 'li[data-node="timeline-item"]' }, { tag: 'div[data-node="timeline-item"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["li", mergeAttributes(HTMLAttributes, { "data-node": "timeline-item" }), 0];
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

export const TimelineItemNode = createTimelineItemNode();
