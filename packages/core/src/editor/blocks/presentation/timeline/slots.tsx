import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { fieldContainerSpec } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { TIMELINE_ITEM_NODE } from "./content";

export interface TimelineItemNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createTimelineItemNode(options: TimelineItemNodeOptions = {}) {
  return Node.create({
    name: TIMELINE_ITEM_NODE,
    ...fieldContainerSpec(),

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="timeline-item"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "timeline-item" }), 0];
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
