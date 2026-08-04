import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { ComparisonDataSchema, type ComparisonData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { COMPARISON_NODE, COMPARISON_ROW_NODE, emptyComparisonData } from "./content";

export interface ComparisonNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createComparisonNode(options: ComparisonNodeOptions = {}) {
  return Node.create({
    name: COMPARISON_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${COMPARISON_ROW_NODE}+`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyComparisonData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-comparison");
            if (!raw) return emptyComparisonData();
            try {
              const parsed = ComparisonDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyComparisonData();
            } catch {
              return emptyComparisonData();
            }
          },
          renderHTML: (attrs: { data: ComparisonData }) => ({
            "data-comparison": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'figure[data-node="comparison"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["figure", mergeAttributes(HTMLAttributes, { "data-node": "comparison" }), 0];
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

export const ComparisonNode = createComparisonNode();
