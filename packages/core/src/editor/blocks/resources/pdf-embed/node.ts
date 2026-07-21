import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { PdfEmbedDataSchema, type PdfEmbedData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { emptyPdfEmbedData } from "./content";

export interface PdfEmbedNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createPdfEmbedNode(options: PdfEmbedNodeOptions = {}) {
  return Node.create({
    name: "pdf_embed",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    atom: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyPdfEmbedData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-pdf-embed");
            if (!raw) return emptyPdfEmbedData();
            try {
              const parsed = PdfEmbedDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyPdfEmbedData();
            } catch {
              return emptyPdfEmbedData();
            }
          },
          renderHTML: (attrs: { data: PdfEmbedData }) => ({
            "data-pdf-embed": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="pdf_embed"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "pdf_embed" })];
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

export const PdfEmbedNode = createPdfEmbedNode();
