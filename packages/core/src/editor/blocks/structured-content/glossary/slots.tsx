import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import {
  GlossaryDefinitionNodeView,
  GlossaryEntryNodeView,
  GlossaryTermNodeView,
} from "./Glossary";
import { GLOSSARY_DEFINITION_NODE, GLOSSARY_ENTRY_NODE, GLOSSARY_TERM_NODE } from "./content";

const GLOSSARY_DEFINITION_CONTENT = textContentExpression();

export const GlossaryTermNode = Node.create({
  name: GLOSSARY_TERM_NODE,
  ...fieldContainerSpec({ content: "paragraph" }),

  parseHTML() {
    return [{ tag: 'dt[data-slot="glossary-term"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dt", mergeAttributes(HTMLAttributes, { "data-slot": "glossary-term" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GlossaryTermNodeView);
  },
});

export const GlossaryDefinitionNode = Node.create({
  name: GLOSSARY_DEFINITION_NODE,
  ...fieldContainerSpec({ content: GLOSSARY_DEFINITION_CONTENT }),

  parseHTML() {
    return [{ tag: 'dd[data-slot="glossary-definition"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["dd", mergeAttributes(HTMLAttributes, { "data-slot": "glossary-definition" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GlossaryDefinitionNodeView);
  },
});

export const GlossaryEntryNode = Node.create({
  name: GLOSSARY_ENTRY_NODE,
  content: `${GLOSSARY_TERM_NODE} ${GLOSSARY_DEFINITION_NODE}`,
  defining: true,
  isolating: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: stableNodeIdAttribute(),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-node="glossary-entry"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-node": "glossary-entry" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GlossaryEntryNodeView);
  },
});
