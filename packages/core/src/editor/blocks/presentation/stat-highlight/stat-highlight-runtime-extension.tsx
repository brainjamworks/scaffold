import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { createStatHighlightNode } from "./node";
import { StatHighlightView } from "./StatHighlight";
import { statHighlightBlockDefinition } from "./stat-highlight-definition";
import { StatHighlightContextNode, StatHighlightLabelNode, StatHighlightValueNode } from "./slots";

const StatHighlightRuntimeNode = createStatHighlightNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      definition: statHighlightBlockDefinition,
      view: { component: StatHighlightView },
    }),
});

export const StatHighlightRuntimeExtension = Extension.create({
  name: "stat_highlight_runtime_bundle",

  addExtensions() {
    return [
      StatHighlightValueNode,
      StatHighlightLabelNode,
      StatHighlightContextNode,
      StatHighlightRuntimeNode,
    ];
  },
});
