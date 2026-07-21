import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { MarginaliaView } from "./Marginalia";
import { marginaliaBlockDefinition } from "./marginalia-definition";
import { createMarginaliaNode } from "./node";
import { MarginaliaGutterNode, MarginaliaMainNode } from "./slots";

const MarginaliaAuthoringNode = createMarginaliaNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      definition: marginaliaBlockDefinition,
      view: { component: MarginaliaView },
    }),
});

export const MarginaliaAuthoringExtension = Extension.create({
  name: "marginalia_authoring_bundle",

  addExtensions() {
    return [MarginaliaGutterNode, MarginaliaMainNode, MarginaliaAuthoringNode];
  },
});
