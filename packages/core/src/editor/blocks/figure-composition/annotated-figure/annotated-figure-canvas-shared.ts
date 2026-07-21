import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { ANNOTATED_FIGURE_CANVAS_NODE } from "./content";

export interface AnnotatedFigureCanvasNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createAnnotatedFigureCanvasNode(options: AnnotatedFigureCanvasNodeOptions = {}) {
  return Node.create({
    name: ANNOTATED_FIGURE_CANVAS_NODE,
    atom: true,
    selectable: false,
    draggable: false,

    parseHTML() {
      return [{ tag: 'div[data-node="annotated-figure-canvas"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-node": "annotated-figure-canvas",
        }),
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

export const AnnotatedFigureCanvasNode = createAnnotatedFigureCanvasNode();
