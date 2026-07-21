import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { PullQuoteDataSchema, type PullQuoteData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { emptyPullQuoteData } from "./content";

export interface PullQuoteNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createPullQuoteNode(options: PullQuoteNodeOptions = {}) {
  return Node.create({
    name: "pull_quote",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: "pull_quote_body pull_quote_attribution",
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyPullQuoteData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-pull-quote");
            if (!raw) return emptyPullQuoteData();
            try {
              const parsed = PullQuoteDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyPullQuoteData();
            } catch {
              return emptyPullQuoteData();
            }
          },
          renderHTML: (attrs: { data: PullQuoteData }) => ({
            "data-pull-quote": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'blockquote[data-node="pull_quote"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["blockquote", mergeAttributes(HTMLAttributes, { "data-node": "pull_quote" }), 0];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export const PullQuoteNode = createPullQuoteNode();
