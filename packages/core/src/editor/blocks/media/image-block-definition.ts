import { ImageIcon as Image } from "@phosphor-icons/react";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { MEDIA_ACCESSIBILITY_COPY } from "@/editor/media/accessibility/media-accessibility";
import { ImageBlockAttrsSchema } from "@scaffold/contracts";

import { applyImageAccessibilitySettings } from "./media-settings";

export const IMAGE_BLOCK_ID = "image";

const imageBlockConfiguration = defineConfiguration({
  attr: "data",
  schema: ImageBlockAttrsSchema.nullable(),
  apply: applyImageAccessibilitySettings,
  sheet: {
    title: "Image settings",
    defaultOpenSections: ["accessibility"],
    sections: [{ id: "accessibility", title: "Accessibility" }],
  },
  controls: [
    {
      kind: "text",
      name: "alt",
      label: MEDIA_ACCESSIBILITY_COPY.altText.label,
      description: MEDIA_ACCESSIBILITY_COPY.altText.description,
      placeholder: MEDIA_ACCESSIBILITY_COPY.altText.placeholder,
      placement: { sheet: { section: "accessibility" } },
    },
  ],
});

export const imageBlockDefinition = defineBlock({
  nodeType: "image_block",
  configuration: imageBlockConfiguration,
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: IMAGE_BLOCK_ID,
    category: "media",
    title: "Image",
    description: "Upload or link an image",
    icon: Image,
    keywords: ["photo", "picture", "media"],
    content: () => ({
      type: "image_block",
      attrs: { id: createStableId(), data: null },
    }),
  },
});
