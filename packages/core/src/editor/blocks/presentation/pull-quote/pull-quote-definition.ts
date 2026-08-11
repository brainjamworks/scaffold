import { QuotesIcon as Quotes } from "@phosphor-icons/react";
import { PullQuoteDataSchema } from "@scaffold/contracts";

import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { defineConfiguration } from "@/editor/configuration/definition";
import { defineBlock } from "@/editor/blocks/block-definition";

import { emptyPullQuoteData } from "./content";

export const PULL_QUOTE_BLOCK_ID = "pull-quote";

const pullQuoteConfiguration = defineConfiguration({
  attr: "data",
  schema: PullQuoteDataSchema,
  controls: [],
});

export const pullQuoteBlockDefinition = defineBlock({
  nodeType: "pull_quote",
  title: "Pull quote",
  configuration: pullQuoteConfiguration,
  placeholders: {
    pull_quote_attribution: "Attribution",
    pull_quote_body: "Write the pull quote",
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  insert: {
    id: PULL_QUOTE_BLOCK_ID,
    category: "display",
    title: "Pull quote",
    description: "Editorial blockquote with attribution",
    icon: Quotes,
    keywords: ["quote", "pull", "blockquote", "citation", "epigraph"],
    content: () => ({
      type: "pull_quote",
      attrs: {
        id: createEmbeddedNodeId(),
        data: emptyPullQuoteData(),
      },
      content: [
        { type: "pull_quote_body", content: [{ type: "paragraph" }] },
        { type: "pull_quote_attribution", content: [{ type: "paragraph" }] },
      ],
    }),
  },
});
