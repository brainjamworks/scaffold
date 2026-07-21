import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { StatHighlightDataSchema, type StatHighlightData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { emptyStatHighlightData } from "./content";

export interface StatHighlightNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createStatHighlightNode(options: StatHighlightNodeOptions = {}) {
  return Node.create({
    name: "stat_highlight",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: "stat_highlight_value stat_highlight_label stat_highlight_context",
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyStatHighlightData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-stat-highlight");
            if (!raw) return emptyStatHighlightData();
            try {
              const parsed = StatHighlightDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyStatHighlightData();
            } catch {
              return emptyStatHighlightData();
            }
          },
          renderHTML: (attrs: { data: StatHighlightData }) => ({
            "data-stat-highlight": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="stat_highlight"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "stat_highlight" }), 0];
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

export const StatHighlightNode = createStatHighlightNode();
