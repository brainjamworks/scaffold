import { RoadmapMilestoneStatusSchema } from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { fieldContainerSpec } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { ROADMAP_MILESTONE_NODE } from "./content";

export interface RoadmapMilestoneNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createRoadmapMilestoneNode(options: RoadmapMilestoneNodeOptions = {}) {
  return Node.create({
    name: ROADMAP_MILESTONE_NODE,
    ...fieldContainerSpec(),

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        status: {
          default: "upcoming",
          parseHTML: (el: HTMLElement) => {
            const parsed = RoadmapMilestoneStatusSchema.safeParse(el.getAttribute("data-status"));
            return parsed.success ? parsed.data : "upcoming";
          },
          renderHTML: (attrs: { status?: unknown }) => {
            const parsed = RoadmapMilestoneStatusSchema.safeParse(attrs.status);
            return {
              "data-status": parsed.success ? parsed.data : "upcoming",
            };
          },
        },
      };
    },

    parseHTML() {
      return [{ tag: 'li[data-node="roadmap-milestone"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "li",
        mergeAttributes(HTMLAttributes, {
          "data-node": "roadmap-milestone",
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

export const RoadmapMilestoneNode = createRoadmapMilestoneNode();
