import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { GlossaryDataSchema, type GlossaryData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { GLOSSARY_ENTRY_NODE, GLOSSARY_NODE, emptyGlossaryData } from "./content";

export interface GlossaryNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createGlossaryNode(options: GlossaryNodeOptions = {}) {
  return Node.create({
    name: GLOSSARY_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${GLOSSARY_ENTRY_NODE}+`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyGlossaryData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-glossary");
            if (!raw) return emptyGlossaryData();
            try {
              const parsed = GlossaryDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyGlossaryData();
            } catch {
              return emptyGlossaryData();
            }
          },
          renderHTML: (attrs: { data: GlossaryData }) => ({
            "data-glossary": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="glossary"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "section",
        mergeAttributes(HTMLAttributes, {
          "data-node": "glossary",
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

export const GlossaryNode = createGlossaryNode();
