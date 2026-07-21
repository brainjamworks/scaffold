import { ResourceLinkDataSchema, type ResourceLinkData } from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { emptyResourceLinkData } from "./content";

export interface ResourceLinkNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createResourceLinkNode(options: ResourceLinkNodeOptions = {}) {
  return Node.create({
    name: "resource_link",
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: "resource_link_title resource_link_description",
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyResourceLinkData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-resource-link");
            if (!raw) return emptyResourceLinkData();
            try {
              const parsed = ResourceLinkDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyResourceLinkData();
            } catch {
              return emptyResourceLinkData();
            }
          },
          renderHTML: (attrs: { data: ResourceLinkData }) => ({
            "data-resource-link": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'aside[data-node="resource_link"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["aside", mergeAttributes(HTMLAttributes, { "data-node": "resource_link" }), 0];
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

export const ResourceLinkNode = createResourceLinkNode();
