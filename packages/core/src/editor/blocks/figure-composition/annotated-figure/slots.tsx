import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { mountBoundedScrollAffordance } from "@/editor/bounded-containers/view/bounded-scroll";
import { ANNOTATED_FIGURE_ANNOTATION_NODE, ANNOTATED_FIGURE_LEGEND_NODE } from "./content";

export interface AnnotatedFigureAnnotationNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createAnnotatedFigureAnnotationNode(
  options: AnnotatedFigureAnnotationNodeOptions = {},
) {
  return Node.create({
    name: ANNOTATED_FIGURE_ANNOTATION_NODE,
    content: "paragraph",
    defining: true,
    selectable: false,
    draggable: false,

    addAttributes() {
      return {
        title: {
          default: "",
          parseHTML: (element: HTMLElement) => element.getAttribute("data-title") ?? "",
          renderHTML: (attrs: { title?: unknown }) => ({
            "data-title": typeof attrs.title === "string" ? attrs.title : "",
          }),
        },
        x: {
          default: 50,
          parseHTML: (element: HTMLElement) => Number(element.getAttribute("data-x") ?? 50),
          renderHTML: (attrs: { x?: unknown }) => ({
            "data-x": String(typeof attrs.x === "number" ? attrs.x : 50),
          }),
        },
        y: {
          default: 50,
          parseHTML: (element: HTMLElement) => Number(element.getAttribute("data-y") ?? 50),
          renderHTML: (attrs: { y?: unknown }) => ({
            "data-y": String(typeof attrs.y === "number" ? attrs.y : 50),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'li[data-node="annotated-figure-annotation"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "li",
        mergeAttributes(HTMLAttributes, {
          "data-node": "annotated-figure-annotation",
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

export const AnnotatedFigureAnnotationNode = createAnnotatedFigureAnnotationNode();

export const AnnotatedFigureLegendNode = Node.create({
  name: ANNOTATED_FIGURE_LEGEND_NODE,
  content: `${ANNOTATED_FIGURE_ANNOTATION_NODE}*`,
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'ol[data-slot="annotated-figure-legend"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "ol",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "annotated-figure-legend",
      }),
      0,
    ];
  },

  addNodeView() {
    return createAnnotatedFigureLegendNodeView;
  },
});

const createAnnotatedFigureLegendNodeView: NodeViewRenderer = () => {
  const root = document.createElement("div");
  root.className = "sc-course-annotated-figure__caption-frame";
  root.dataset.boundedScrollFrame = "";

  const dom = document.createElement("ol");
  dom.dataset.slot = "annotated-figure-legend";
  dom.dataset.boundedScroll = "";
  dom.className = "sc-course-annotated-figure__legend";

  const hint = document.createElement("div");
  hint.dataset.boundedScrollHint = "";
  hint.setAttribute("aria-hidden", "true");
  hint.contentEditable = "false";
  hint.textContent = "Scroll for more ↓";

  root.append(dom, hint);
  const unmountBoundedScrollAffordance = mountBoundedScrollAffordance(root);

  return {
    dom: root,
    contentDOM: dom,
    ignoreMutation(mutation) {
      return (
        mutation.type === "attributes" &&
        (mutation.target === root || mutation.target === dom || mutation.target === hint)
      );
    },
    destroy() {
      unmountBoundedScrollAffordance?.();
    },
  };
};
