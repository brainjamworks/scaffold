import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { MarginaliaDataSchema, type MarginaliaData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { emptyMarginaliaData } from "./content";

export interface MarginaliaNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createMarginaliaNode(options: MarginaliaNodeOptions = {}) {
  return Node.create({
    name: "marginalia",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: "marginalia_gutter marginalia_main",
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyMarginaliaData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-marginalia");
            if (!raw) return emptyMarginaliaData();
            try {
              const parsed = MarginaliaDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyMarginaliaData();
            } catch {
              return emptyMarginaliaData();
            }
          },
          renderHTML: (attrs: { data: MarginaliaData }) => ({
            "data-marginalia": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="marginalia"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "marginalia" }), 0];
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

export const MarginaliaNode = createMarginaliaNode();
