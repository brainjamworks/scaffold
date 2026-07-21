import { TimelineDataSchema, type TimelineData } from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { TIMELINE_ITEM_NODE, TIMELINE_NODE, emptyTimelineData } from "./content";

export interface TimelineNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createTimelineNode(options: TimelineNodeOptions = {}) {
  return Node.create({
    name: TIMELINE_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${TIMELINE_ITEM_NODE}+`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyTimelineData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-timeline");
            if (!raw) return emptyTimelineData();
            try {
              const parsed = TimelineDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyTimelineData();
            } catch {
              return emptyTimelineData();
            }
          },
          renderHTML: (attrs: { data: TimelineData }) => ({
            "data-timeline": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="timeline"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-node": "timeline" }), 0];
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

export const TimelineNode = createTimelineNode();
