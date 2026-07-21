import { TextAlignLeftIcon as TextAlignLeft } from "@phosphor-icons/react";
import {
  TextWrapImageDataSchema,
  TextWrapImagePositionSchema,
  TextWrapImageShapeSchema,
  TextWrapImageSizeSchema,
} from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import { TEXT_WRAP_IMAGE_BODY_NODE, TEXT_WRAP_IMAGE_NODE, emptyTextWrapImageData } from "./content";

export const TEXT_WRAP_IMAGE_BLOCK_ID = "text-wrap-image";

const POSITION_LABELS: Record<"left" | "right", string> = {
  left: "Left",
  right: "Right",
};

const SIZE_LABELS: Record<"sm" | "md" | "lg", string> = {
  sm: "Small",
  md: "Medium",
  lg: "Large",
};

const SHAPE_LABELS: Record<"square" | "rounded" | "circle", string> = {
  square: "Square",
  rounded: "Rounded",
  circle: "Circle",
};

export const textWrapImageDefinition = defineBlock({
  nodeType: TEXT_WRAP_IMAGE_NODE,
  configuration: defineConfiguration({
    attr: "data",
    schema: TextWrapImageDataSchema,
    sheet: {
      title: "Text-wrap image",
      defaultOpenSections: ["layout"],
      sections: [
        { id: "layout", title: "Layout" },
        { id: "media", title: "Image" },
      ],
    },
    controls: [
      {
        kind: "select",
        name: "position",
        label: "Position",
        options: TextWrapImagePositionSchema.options.map((value) => ({
          value,
          label: POSITION_LABELS[value],
        })),
        placement: { sheet: { section: "layout" } },
      },
      {
        kind: "select",
        name: "size",
        label: "Size",
        options: TextWrapImageSizeSchema.options.map((value) => ({
          value,
          label: SIZE_LABELS[value],
        })),
        placement: { sheet: { section: "layout" } },
      },
      {
        kind: "select",
        name: "shape",
        label: "Shape",
        options: TextWrapImageShapeSchema.options.map((value) => ({
          value,
          label: SHAPE_LABELS[value],
        })),
        placement: { sheet: { section: "layout" } },
      },
      {
        kind: "text",
        name: "alt",
        label: "Alt text",
        placeholder: "Describe the image for screen readers",
        placement: { sheet: { section: "media" } },
      },
    ],
  }),
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  placeholders: {
    [TEXT_WRAP_IMAGE_BODY_NODE]: "Write the text that wraps around the image",
  },
  insert: {
    id: TEXT_WRAP_IMAGE_BLOCK_ID,
    category: "media",
    title: "Text-wrap image",
    description: "Image floats left or right, body text wraps around it",
    icon: TextAlignLeft,
    keywords: ["wrap", "float", "magazine", "textbook", "illustration"],
    content: () => ({
      type: TEXT_WRAP_IMAGE_NODE,
      attrs: {
        id: createStableId(),
        data: emptyTextWrapImageData(),
      },
      content: [
        {
          type: TEXT_WRAP_IMAGE_BODY_NODE,
          content: [{ type: "paragraph" }],
        },
      ],
    }),
  },
});
