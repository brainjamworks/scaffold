import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { GalleryDataSchema, type GalleryData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import { GALLERY_ITEM_NODE, GALLERY_NODE, emptyGalleryData } from "./content";

export interface GalleryNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createGalleryNode(options: GalleryNodeOptions = {}) {
  return Node.create({
    name: GALLERY_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${GALLERY_ITEM_NODE}*`,
    atom: true,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyGalleryData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-gallery");
            if (!raw) return emptyGalleryData();
            try {
              const parsed = GalleryDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyGalleryData();
            } catch {
              return emptyGalleryData();
            }
          },
          renderHTML: (attrs: { data: GalleryData }) => ({
            "data-gallery": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="gallery"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["section", mergeAttributes(HTMLAttributes, { "data-node": "gallery" }), 0];
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

export const GalleryNode = createGalleryNode();
