import { CalloutDataSchema, type CalloutData } from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { emptyCalloutData } from "./content";

export interface CalloutNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createCalloutNode(options: CalloutNodeOptions = {}) {
  return Node.create({
    name: "callout",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: "callout_title callout_prompt",
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyCalloutData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-callout");
            if (!raw) return emptyCalloutData();
            try {
              const parsed = CalloutDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyCalloutData();
            } catch {
              return emptyCalloutData();
            }
          },
          renderHTML: (attrs: { data: CalloutData }) => ({
            "data-callout": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'aside[data-node="callout"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["aside", mergeAttributes(HTMLAttributes, { "data-node": "callout" }), 0];
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

export const CalloutNode = createCalloutNode();
