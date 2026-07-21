import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { AnnotatedFigureDataSchema, type AnnotatedFigureData } from "@scaffold/contracts";

import {
  ANNOTATED_FIGURE_CANVAS_NODE,
  ANNOTATED_FIGURE_LEGEND_NODE,
  ANNOTATED_FIGURE_NODE,
  emptyAnnotatedFigureData,
} from "./content";

export interface AnnotatedFigureNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createAnnotatedFigureNode(options: AnnotatedFigureNodeOptions = {}) {
  return Node.create({
    name: ANNOTATED_FIGURE_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${ANNOTATED_FIGURE_CANVAS_NODE} ${ANNOTATED_FIGURE_LEGEND_NODE}`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyAnnotatedFigureData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-annotated-figure");
            if (!raw) return emptyAnnotatedFigureData();
            try {
              const parsed = AnnotatedFigureDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyAnnotatedFigureData();
            } catch {
              return emptyAnnotatedFigureData();
            }
          },
          renderHTML: (attrs: { data: AnnotatedFigureData }) => ({
            "data-annotated-figure": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: `figure[data-node="${ANNOTATED_FIGURE_NODE}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["figure", mergeAttributes(HTMLAttributes, { "data-node": ANNOTATED_FIGURE_NODE }), 0];
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

export const AnnotatedFigureNode = createAnnotatedFigureNode();
