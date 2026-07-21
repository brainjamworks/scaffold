import { LinkSimpleIcon as LinkSimple } from "@phosphor-icons/react";
import { ResourceLinkDataSchema, ResourceLinkKindSchema } from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import { emptyResourceLinkData } from "./content";
import { RESOURCE_LINK_KIND_LABELS } from "./resource-link-presentation";

export const RESOURCE_LINK_BLOCK_ID = "resource-link";

const resourceLinkConfiguration = defineConfiguration({
  attr: "data",
  schema: ResourceLinkDataSchema,
  sheet: {
    title: "Resource link settings",
    defaultOpenSections: ["presentation"],
    sections: [{ id: "presentation", title: "Presentation" }],
  },
  controls: [
    {
      kind: "text",
      name: "url",
      label: "URL",
      placeholder: "https://...",
      placement: { sheet: { section: "presentation" } },
    },
    {
      kind: "select",
      name: "kind",
      label: "Kind",
      options: ResourceLinkKindSchema.options.map((value) => ({
        value,
        label: RESOURCE_LINK_KIND_LABELS[value],
      })),
      placement: { sheet: { section: "presentation" } },
    },
    {
      kind: "boolean",
      name: "showDescription",
      label: "Show description",
      presentation: "switch",
      placement: { sheet: { section: "presentation" } },
    },
  ],
});

export const resourceLinkBlockDefinition = defineBlock({
  nodeType: "resource_link",
  configuration: resourceLinkConfiguration,
  placeholders: {
    resource_link_description: "One-line context for learners",
    resource_link_title: "Title of the resource",
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: RESOURCE_LINK_BLOCK_ID,
    category: "content",
    title: "Resource link",
    description: "Card linking to an outside reading, video, or PDF",
    icon: LinkSimple,
    keywords: ["link", "resource", "reading", "video", "pdf", "reference", "external"],
    content: () => ({
      type: "resource_link",
      attrs: {
        id: createStableId(),
        data: emptyResourceLinkData(),
      },
      content: [
        { type: "resource_link_title", content: [{ type: "paragraph" }] },
        {
          type: "resource_link_description",
          content: [{ type: "paragraph" }],
        },
      ],
    }),
  },
});
