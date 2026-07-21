import type { JSONContent } from "@tiptap/core";
import {
  GalleryDataSchema,
  GalleryItemDataSchema,
  type GalleryData,
  type GalleryItemData,
  type ImageBlockAttrs,
} from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import type { ScaffoldRichTextDocument } from "@/schemas/rich-text";

export const GALLERY_NODE = "gallery";
export const GALLERY_ITEM_NODE = "gallery_item";

type GalleryDataOverrides = Omit<Partial<GalleryData>, "caption"> & {
  caption?: ScaffoldRichTextDocument;
};

export function emptyGalleryData(overrides: GalleryDataOverrides = {}): GalleryData {
  return GalleryDataSchema.parse(overrides);
}

export function emptyGalleryItemData(
  overrides: Partial<{ image: ImageBlockAttrs | null; caption: ScaffoldRichTextDocument }> = {},
): GalleryItemData {
  return GalleryItemDataSchema.parse(overrides);
}

export function galleryItemNode(item: GalleryItemData): JSONContent {
  return {
    type: GALLERY_ITEM_NODE,
    attrs: {
      id: createStableId(),
      data: item,
    },
  };
}
