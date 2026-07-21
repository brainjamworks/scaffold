import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { createStatHighlightNode } from "./node";
import { StatHighlightView } from "./StatHighlight";
import { statHighlightBlockDefinition } from "./stat-highlight-definition";
import { StatHighlightContextNode, StatHighlightLabelNode, StatHighlightValueNode } from "./slots";

const StatHighlightAuthoringNode = createStatHighlightNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      definition: statHighlightBlockDefinition,
      view: { component: StatHighlightView },
    }),
});

export const StatHighlightAuthoringExtension = Extension.create({
  name: "stat_highlight_authoring_bundle",

  addExtensions() {
    return [
      StatHighlightValueNode,
      StatHighlightLabelNode,
      StatHighlightContextNode,
      StatHighlightAuthoringNode,
    ];
  },
});
