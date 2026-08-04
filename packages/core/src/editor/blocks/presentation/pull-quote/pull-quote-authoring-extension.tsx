import { Extension } from "@tiptap/core";

import { createBlockAuthoringNodeView } from "@/editor/frame/authoring/create-block-authoring-node-view";

import { createPullQuoteNode } from "./node";
import { PullQuoteView } from "./PullQuote";
import { pullQuoteBlockDefinition } from "./pull-quote-definition";
import { PullQuoteAttributionNode, PullQuoteBodyNode } from "./slots";

const PullQuoteAuthoringNode = createPullQuoteNode({
  addNodeView: () =>
    createBlockAuthoringNodeView({
      className: "sc-course-pull-quote-node",
      definition: pullQuoteBlockDefinition,
      view: { component: PullQuoteView },
    }),
});

export const PullQuoteAuthoringExtension = Extension.create({
  name: "pull_quote_authoring_bundle",

  addExtensions() {
    return [PullQuoteBodyNode, PullQuoteAttributionNode, PullQuoteAuthoringNode];
  },
});
