import { SidebarDataSchema, type SidebarData } from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import {
  SIDEBAR_BODY_NODE,
  SIDEBAR_LABEL_NODE,
  SIDEBAR_NODE,
  SIDEBAR_TITLE_NODE,
  emptySidebarData,
} from "./content";

export interface SidebarNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createSidebarNode(options: SidebarNodeOptions = {}) {
  return Node.create({
    name: SIDEBAR_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${SIDEBAR_LABEL_NODE} ${SIDEBAR_TITLE_NODE} ${SIDEBAR_BODY_NODE}`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptySidebarData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-sidebar");
            if (!raw) return emptySidebarData();
            try {
              const parsed = SidebarDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptySidebarData();
            } catch {
              return emptySidebarData();
            }
          },
          renderHTML: (attrs: { data: SidebarData }) => ({
            "data-sidebar": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'aside[data-node="sidebar"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["aside", mergeAttributes(HTMLAttributes, { "data-node": "sidebar" }), 0];
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

export const SidebarNode = createSidebarNode();
