import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { MarginaliaView } from "./Marginalia";
import { marginaliaBlockDefinition } from "./marginalia-definition";
import { createMarginaliaNode } from "./node";
import { MarginaliaGutterNode, MarginaliaMainNode } from "./slots";

const MarginaliaRuntimeNode = createMarginaliaNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      definition: marginaliaBlockDefinition,
      view: { component: MarginaliaView },
    }),
});

export const MarginaliaRuntimeExtension = Extension.create({
  name: "marginalia_runtime_bundle",

  addExtensions() {
    return [MarginaliaGutterNode, MarginaliaMainNode, MarginaliaRuntimeNode];
  },
});
