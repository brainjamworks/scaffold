import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { ImageBlockAttrsSchema, type ImageBlockAttrs } from "@scaffold/contracts";

export interface ImageBlockNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createImageBlockNode(options: ImageBlockNodeOptions = {}) {
  return Node.create({
    name: "image_block",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    atom: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: null as ImageBlockAttrs | null,
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-image");
            if (!raw) return null;
            try {
              const parsed = ImageBlockAttrsSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : null;
            } catch {
              return null;
            }
          },
          renderHTML: (attrs: { data: ImageBlockAttrs | null }) =>
            attrs.data ? { "data-image": JSON.stringify(attrs.data) } : {},
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="image_block"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "image_block" })];
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

export const ImageBlockNode = createImageBlockNode();
