import {
  GridFourIcon as GridFour,
  ImagesIcon as Images,
  SlideshowIcon as Slideshow,
} from "@phosphor-icons/react";
import { GalleryDataSchema, GalleryItemDataSchema, GalleryLayoutSchema } from "@scaffold/contracts";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import {
  defineConfiguration,
  type ConfigurationDirectChildCollectionDescriptor,
} from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { GALLERY_ITEM_NODE, GALLERY_NODE, emptyGalleryData, emptyGalleryItemData } from "./content";
import { galleryDocumentSemantics } from "./gallery-document-semantics";

export const GALLERY_BLOCK_ID = "gallery";

export const galleryItemsCollection = {
  id: "gallery-items",
  childNodeType: GALLERY_ITEM_NODE,
  attr: "data",
  schema: GalleryItemDataSchema,
  initialValue: emptyGalleryItemData(),
  itemLabel: "Image",
  addLabel: "Add image",
  referenceStyle: "lower-alpha",
  placement: { sheet: { section: "content", order: 2 } },
  fields: [
    {
      kind: "image",
      name: "image",
      label: "Image",
      mediaStorage: "canonical",
      pickerTitle: "Choose gallery image",
    },
    {
      kind: "richText",
      name: "caption",
      label: "Lightbox caption",
      placeholder: "Add context for this image...",
    },
  ],
} satisfies ConfigurationDirectChildCollectionDescriptor;

export const galleryDefinition = defineBlock({
  nodeType: GALLERY_NODE,
  title: "Gallery",
  documentSemantics: galleryDocumentSemantics,
  control: {
    semanticChildren: {
      [GALLERY_ITEM_NODE]: {
        events: [{ type: "selected", label: "Selected" }],
        states: [
          {
            key: "selected",
            label: "Selected",
            valueType: { kind: "boolean" },
          },
        ],
        commands: [{ type: "select", label: "Select" }],
      },
    },
  },
  configuration: defineConfiguration({
    attr: "data",
    schema: GalleryDataSchema,
    sheet: {
      title: "Gallery settings",
      defaultOpenSections: ["content"],
      sections: [
        { id: "content", title: "Content" },
        { id: "presentation", title: "Presentation" },
      ],
    },
    controls: [
      {
        kind: "select",
        name: "layout",
        label: "Layout",
        options: GalleryLayoutSchema.options.map((value) => ({
          value,
          label: value === "carousel" ? "Carousel" : "Grid",
          icon: value === "carousel" ? Slideshow : GridFour,
        })),
        placement: {
          quickMenu: { presentation: "segmented" },
          sheet: { section: "presentation" },
        },
      },
      {
        kind: "richText",
        name: "caption",
        label: "Shared caption",
        placeholder: "Add a caption for the gallery...",
        placement: { sheet: { section: "content", order: 1 } },
      },
    ],
    collections: [galleryItemsCollection],
  }),
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  boundedPlacement: "fill",
  insert: {
    id: GALLERY_BLOCK_ID,
    category: "media",
    title: "Gallery",
    description: "Multi-image carousel or grid with fullscreen viewer",
    icon: Images,
    keywords: ["gallery", "images", "photos", "carousel", "slideshow", "grid"],
    content: () => ({
      type: GALLERY_NODE,
      attrs: {
        id: createEmbeddedNodeId(),
        data: emptyGalleryData(),
      },
    }),
  },
});
