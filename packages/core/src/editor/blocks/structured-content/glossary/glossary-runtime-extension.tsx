import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { GlossaryView } from "./Glossary";
import { glossaryBlockDefinition } from "./glossary-definition";
import { createGlossaryNode } from "./node";
import { GlossaryDefinitionNode, GlossaryEntryNode, GlossaryTermNode } from "./slots";

const GlossaryRuntimeRootNode = createGlossaryNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      className: "sc-glossary",
      definition: glossaryBlockDefinition,
      view: { component: GlossaryView },
    }),
});

export const GlossaryRuntimeExtension = Extension.create({
  name: "glossary_runtime_bundle",

  addExtensions() {
    return [GlossaryTermNode, GlossaryDefinitionNode, GlossaryEntryNode, GlossaryRuntimeRootNode];
  },
});
