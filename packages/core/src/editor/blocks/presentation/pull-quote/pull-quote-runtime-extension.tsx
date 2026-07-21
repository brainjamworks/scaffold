import { Extension } from "@tiptap/core";

import { createBlockRuntimeNodeView } from "@/editor/frame/runtime/create-block-runtime-node-view";

import { createPullQuoteNode } from "./node";
import { PullQuoteView } from "./PullQuote";
import { pullQuoteBlockDefinition } from "./pull-quote-definition";
import { PullQuoteAttributionNode, PullQuoteBodyNode } from "./slots";

const PullQuoteRuntimeNode = createPullQuoteNode({
  addNodeView: () =>
    createBlockRuntimeNodeView({
      definition: pullQuoteBlockDefinition,
      view: { component: PullQuoteView },
    }),
});

export const PullQuoteRuntimeExtension = Extension.create({
  name: "pull_quote_runtime_bundle",

  addExtensions() {
    return [PullQuoteBodyNode, PullQuoteAttributionNode, PullQuoteRuntimeNode];
  },
});
