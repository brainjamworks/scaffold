import { mergeAttributes, Node } from "@tiptap/core";

import { LAYER_NODE_TYPE } from "@/document/model/nodes/structural-node-types";

export function createLayerNode() {
  return Node.create({
    name: LAYER_NODE_TYPE,
    content: "(paragraph | block | arrangement)+",
    atom: false,
    selectable: false,
    draggable: false,
    isolating: true,
    defining: true,

    parseHTML() {
      return [{ tag: 'div[data-node="layer"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-node": LAYER_NODE_TYPE,
        }),
        0,
      ];
    },
  });
}

export const LayerNode = createLayerNode();
