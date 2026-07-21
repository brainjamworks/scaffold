import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { GlossaryView } from "./Glossary";
import { glossaryBlockDefinition } from "./glossary-definition";
import { createGlossaryNode } from "./node";
import { GlossaryDefinitionNode, GlossaryEntryNode, GlossaryTermNode } from "./slots";

const GlossaryAuthoringRootNode = createGlossaryNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-glossary",
      definition: glossaryBlockDefinition,
      view: { component: GlossaryView },
    }),
});

export const GlossaryAuthoringExtension = Extension.create({
  name: "glossary_authoring_bundle",

  addExtensions() {
    return [GlossaryTermNode, GlossaryDefinitionNode, GlossaryEntryNode, GlossaryAuthoringRootNode];
  },
});
