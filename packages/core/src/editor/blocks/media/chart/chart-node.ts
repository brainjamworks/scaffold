import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { ChartBlockDataSchema, type ChartBlockData } from "@/schemas/shared";

import { createChartSample } from "./chart-samples";

export interface ChartNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createChartNode(options: ChartNodeOptions = {}) {
  return Node.create({
    name: "chart_block",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    atom: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: createChartSample("bar"),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-chart");
            if (!raw) return null;
            try {
              const parsed = ChartBlockDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : null;
            } catch {
              return null;
            }
          },
          renderHTML: (attrs: { data: ChartBlockData | null }) =>
            attrs.data ? { "data-chart": JSON.stringify(attrs.data) } : {},
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="chart_block"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "chart_block" })];
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

export const ChartNode = createChartNode();
