import { RoadmapDataSchema, type RoadmapData } from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { ROADMAP_MILESTONE_NODE, ROADMAP_NODE, emptyRoadmapData } from "./content";

export interface RoadmapNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createRoadmapNode(options: RoadmapNodeOptions = {}) {
  return Node.create({
    name: ROADMAP_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${ROADMAP_MILESTONE_NODE}+`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyRoadmapData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-roadmap");
            if (!raw) return emptyRoadmapData();
            try {
              const parsed = RoadmapDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyRoadmapData();
            } catch {
              return emptyRoadmapData();
            }
          },
          renderHTML: (attrs: { data: RoadmapData }) => ({
            "data-roadmap": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="roadmap"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "section",
        mergeAttributes(HTMLAttributes, {
          "data-node": "roadmap",
        }),
        0,
      ];
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

export const RoadmapNode = createRoadmapNode();
