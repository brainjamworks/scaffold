import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

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
        id: stableNodeIdAttribute(),
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
  const dom = document.createElement("ol");
  dom.dataset.slot = "annotated-figure-legend";
  dom.dataset.overflowBefore = "false";
  dom.dataset.overflowAfter = "false";
  dom.className = "sc-annotated-figure__legend";
  const updateOverflow = () => {
    const before = dom.scrollTop > 1 ? "true" : "false";
    const after = dom.scrollTop + dom.clientHeight < dom.scrollHeight - 1 ? "true" : "false";
    if (dom.dataset.overflowBefore !== before) dom.dataset.overflowBefore = before;
    if (dom.dataset.overflowAfter !== after) dom.dataset.overflowAfter = after;
  };
  const frame = requestAnimationFrame(updateOverflow);
  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOverflow);
  resizeObserver?.observe(dom);
  const mutationObserver =
    typeof MutationObserver === "undefined" ? null : new MutationObserver(updateOverflow);
  mutationObserver?.observe(dom, {
    characterData: true,
    childList: true,
    subtree: true,
  });
  dom.addEventListener("scroll", updateOverflow);

  return {
    dom,
    contentDOM: dom,
    ignoreMutation(mutation) {
      return mutation.type === "attributes" && mutation.target === dom;
    },
    destroy() {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      dom.removeEventListener("scroll", updateOverflow);
    },
  };
};
