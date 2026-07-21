import {
  ListNumbersIcon as ListNumbers,
  MapPinSimpleAreaIcon as MapPinSimpleArea,
} from "@phosphor-icons/react";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";
import {
  AnnotatedFigureCaptionDisplaySchema,
  AnnotatedFigureDataSchema,
} from "@scaffold/contracts";

import {
  ANNOTATED_FIGURE_ANNOTATION_NODE,
  ANNOTATED_FIGURE_CANVAS_NODE,
  ANNOTATED_FIGURE_LEGEND_NODE,
  ANNOTATED_FIGURE_NODE,
  emptyAnnotatedFigureData,
} from "./content";

export const ANNOTATED_FIGURE_BLOCK_ID = "annotated-figure";

export const annotatedFigureDefinition = defineBlock({
  nodeType: ANNOTATED_FIGURE_NODE,
  identity: {
    stableChildNodeTypes: [ANNOTATED_FIGURE_ANNOTATION_NODE],
  },
  placeholders: {
    [ANNOTATED_FIGURE_ANNOTATION_NODE]: "Describe a numbered pin",
  },
  configuration: defineConfiguration({
    attr: "data",
    schema: AnnotatedFigureDataSchema,
    sheet: {
      title: "Annotated figure",
      defaultOpenSections: ["image"],
      sections: [
        { id: "image", title: "Image" },
        { id: "presentation", title: "Presentation" },
      ],
    },
    controls: [
      {
        kind: "text",
        name: "alt",
        label: "Alt text",
        placeholder: "Describe the figure for screen readers",
        placement: { sheet: { section: "image" } },
      },
      {
        kind: "select",
        name: "captionDisplay",
        label: "Caption display",
        options: AnnotatedFigureCaptionDisplaySchema.options.map((value) => ({
          value,
          label: value === "list" ? "List" : "Pin popovers",
          icon: value === "list" ? ListNumbers : MapPinSimpleArea,
        })),
        placement: {
          quickMenu: { presentation: "segmented" },
          sheet: { section: "presentation" },
        },
      },
    ],
  }),
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  boundedPlacement: "fill",
  insert: {
    id: ANNOTATED_FIGURE_BLOCK_ID,
    category: "media",
    title: "Annotated figure",
    description: "Image with numbered pins explained in a legend below",
    icon: MapPinSimpleArea,
    keywords: ["annotated", "figure", "diagram", "label", "callout", "pins"],
    content: () => ({
      type: ANNOTATED_FIGURE_NODE,
      attrs: {
        id: createStableId(),
        data: emptyAnnotatedFigureData(),
      },
      content: [
        { type: ANNOTATED_FIGURE_CANVAS_NODE },
        {
          type: ANNOTATED_FIGURE_LEGEND_NODE,
        },
      ],
    }),
  },
});
