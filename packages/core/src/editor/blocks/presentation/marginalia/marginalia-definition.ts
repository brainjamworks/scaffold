import { ArrowsHorizontalIcon as ArrowsHorizontal } from "@phosphor-icons/react";
import { MarginaliaDataSchema, MarginaliaPositionSchema } from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import { emptyMarginaliaData } from "./content";

export const MARGINALIA_BLOCK_ID = "marginalia";

const POSITION_LABELS: Record<"left" | "right", string> = {
  left: "Left",
  right: "Right",
};

const marginaliaConfiguration = defineConfiguration({
  attr: "data",
  schema: MarginaliaDataSchema,
  sheet: {
    title: "Marginalia settings",
    defaultOpenSections: ["layout"],
    sections: [{ id: "layout", title: "Layout" }],
  },
  controls: [
    {
      kind: "select",
      name: "position",
      label: "Gutter position",
      options: MarginaliaPositionSchema.options.map((value) => ({
        value,
        label: POSITION_LABELS[value],
      })),
      placement: { sheet: { section: "layout" } },
    },
  ],
});

export const marginaliaBlockDefinition = defineBlock({
  nodeType: "marginalia",
  configuration: marginaliaConfiguration,
  placeholders: {
    marginalia_gutter: "Write a margin note",
    marginalia_main: "Write the main content",
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: MARGINALIA_BLOCK_ID,
    category: "display",
    title: "Marginalia",
    description: "A note or image in the margin while the main column reads on",
    icon: ArrowsHorizontal,
    keywords: ["marginalia", "margin", "sidenote", "aside", "gutter", "note"],
    content: () => ({
      type: "marginalia",
      attrs: {
        id: createStableId(),
        data: emptyMarginaliaData(),
      },
      content: [
        { type: "marginalia_gutter", content: [{ type: "paragraph" }] },
        { type: "marginalia_main", content: [{ type: "paragraph" }] },
      ],
    }),
  },
});
