import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { fieldContainerSpec } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { COMPARISON_CELL_NODE, COMPARISON_ROW_NODE } from "./content";

export interface ComparisonRowNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createComparisonRowNode(options: ComparisonRowNodeOptions = {}) {
  return Node.create({
    name: COMPARISON_ROW_NODE,
    content: `${COMPARISON_CELL_NODE} ${COMPARISON_CELL_NODE}`,
    defining: true,
    isolating: true,
    selectable: false,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="comparison-row"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "comparison-row" }), 0];
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

export const ComparisonRowNode = createComparisonRowNode();

export const ComparisonCellNode = Node.create({
  name: COMPARISON_CELL_NODE,
  ...fieldContainerSpec(),

  addAttributes() {
    return {
      side: {
        default: "left",
        parseHTML: (el: HTMLElement) => {
          const side = el.getAttribute("data-comparison-side");
          return side === "right" ? "right" : "left";
        },
        renderHTML: (attrs: { side?: unknown }) => ({
          "data-comparison-side": attrs.side === "right" ? "right" : "left",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-node="comparison-cell"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-node": "comparison-cell" }), 0];
  },
});
