import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { GalleryItemDataSchema, type GalleryItemData } from "@scaffold/contracts";

import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { GALLERY_ITEM_NODE } from "./content";

/* The atomic gallery_item NodeView renders nothing visible. The parent
 * reads each item's data and composes the gallery UI. ProseMirror still
 * needs a NodeView root so positions and stable IDs resolve. */
export function GalleryItemNodeView() {
  return <NodeViewWrapper data-node="gallery-item" className="sc-gallery__item-node" aria-hidden />;
}

export const GalleryItemNode = Node.create({
  name: GALLERY_ITEM_NODE,
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: stableNodeIdAttribute(),
      data: {
        default: null as GalleryItemData | null,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute("data-gallery-item");
          if (!raw) return null;
          try {
            const parsed = GalleryItemDataSchema.safeParse(JSON.parse(raw));
            return parsed.success ? parsed.data : null;
          } catch {
            return null;
          }
        },
        renderHTML: (attrs: { data: GalleryItemData | null }) =>
          attrs.data ? { "data-gallery-item": JSON.stringify(attrs.data) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-node="gallery-item"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { "data-node": "gallery-item" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(GalleryItemNodeView);
  },
});
