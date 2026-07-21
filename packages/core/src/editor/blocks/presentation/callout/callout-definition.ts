import { MegaphoneSimpleIcon as MegaphoneSimple } from "@phosphor-icons/react";
import { CalloutDataSchema } from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import { emptyCalloutData } from "./content";

export const CALLOUT_BLOCK_ID = "callout";

const DEFAULT_CALLOUT_TITLE = "Info title";
const DEFAULT_CALLOUT_PROMPT = "Add a concise note for learners";

const calloutConfiguration = defineConfiguration({
  attr: "data",
  schema: CalloutDataSchema,
  sheet: {
    title: "Callout settings",
    defaultOpenSections: ["presentation"],
    sections: [
      {
        id: "presentation",
        title: "Presentation",
      },
    ],
  },
  controls: [
    {
      kind: "select",
      name: "variant",
      label: "Variant",
      options: [
        { value: "info", label: "Info" },
        { value: "warning", label: "Warning" },
        { value: "success", label: "Success" },
        { value: "error", label: "Error" },
        { value: "tip", label: "Tip" },
        { value: "note", label: "Note" },
      ],
      placement: { sheet: { section: "presentation" } },
    },
    {
      kind: "boolean",
      name: "showIcon",
      label: "Show icon",
      presentation: "switch",
      placement: { sheet: { section: "presentation" } },
    },
    {
      kind: "select",
      name: "headingLevel",
      label: "Heading level",
      options: [
        { value: "3", label: "H3" },
        { value: "4", label: "H4" },
        { value: "5", label: "H5" },
      ],
      placement: { sheet: { section: "presentation" } },
    },
  ],
});

export const calloutBlockDefinition = defineBlock({
  nodeType: "callout",
  configuration: calloutConfiguration,
  placeholders: {
    callout_title: "Enter your callout title",
    callout_prompt: "Write a short note for learners",
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: CALLOUT_BLOCK_ID,
    category: "content",
    title: "Callout",
    description: "A short note, tip, or warning",
    icon: MegaphoneSimple,
    keywords: ["note", "tip", "warning", "info", "alert", "callout"],
    content: () => ({
      type: "callout",
      attrs: { id: createStableId(), data: emptyCalloutData() },
      content: [
        {
          type: "callout_title",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: DEFAULT_CALLOUT_TITLE }],
            },
          ],
        },
        {
          type: "callout_prompt",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: DEFAULT_CALLOUT_PROMPT }],
            },
          ],
        },
      ],
    }),
  },
});
