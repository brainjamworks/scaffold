import { CodeIcon as Code } from "@phosphor-icons/react";
import { EmbedAspectRatioSchema, EmbedDataSchema } from "@scaffold/contracts";

import { createStableId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import { applyEmbedSettings } from "./embed-settings";
import { emptyEmbedData } from "./embed-data";

export const EMBED_BLOCK_ID = "embed";

const embedConfiguration = defineConfiguration({
  attr: "data",
  schema: EmbedDataSchema,
  apply: applyEmbedSettings,
  sheet: {
    title: "Embed settings",
    defaultOpenSections: ["source"],
    sections: [{ id: "source", title: "Source" }],
  },
  controls: [
    {
      kind: "text",
      name: "url",
      label: "URL",
      placeholder: "https://...",
      placement: { sheet: { section: "source" } },
    },
    {
      kind: "select",
      name: "aspectRatio",
      label: "Aspect ratio",
      options: EmbedAspectRatioSchema.options.map((value) => ({
        value,
        label: value.replace("/", ":"),
      })),
      placement: { sheet: { section: "source" } },
    },
    {
      kind: "text",
      name: "caption",
      label: "Caption",
      placeholder: "Optional caption",
      placement: { sheet: { section: "source" } },
    },
  ],
});

export const embedBlockDefinition = defineBlock({
  nodeType: "embed",
  configuration: embedConfiguration,
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: EMBED_BLOCK_ID,
    category: "embed",
    title: "Embed",
    description: "Inline a supported video, audio, design, or article embed",
    icon: Code,
    keywords: ["embed", "iframe", "video", "audio", "youtube", "vimeo"],
    content: () => ({
      type: "embed",
      attrs: {
        id: createStableId(),
        data: emptyEmbedData(),
      },
    }),
  },
});
