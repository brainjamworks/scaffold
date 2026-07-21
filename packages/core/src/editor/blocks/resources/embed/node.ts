import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { EmbedDataSchema, type EmbedData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { emptyEmbedData } from "./embed-data";

export interface EmbedNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createEmbedNode(options: EmbedNodeOptions = {}) {
  return Node.create({
    name: "embed",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    atom: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyEmbedData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-embed");
            if (!raw) return emptyEmbedData();
            try {
              const parsed = EmbedDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyEmbedData();
            } catch {
              return emptyEmbedData();
            }
          },
          renderHTML: (attrs: { data: EmbedData }) => ({
            "data-embed": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="embed"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "embed" })];
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

export const EmbedNode = createEmbedNode();
