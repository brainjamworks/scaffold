import { NumberedListDataSchema, type NumberedListData } from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import {
  NUMBERED_LIST_ITEM_NODE,
  NUMBERED_LIST_NODE,
  NUMBERED_LIST_TITLE_NODE,
  emptyNumberedListData,
} from "./content";

export interface NumberedListNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createNumberedListNode(options: NumberedListNodeOptions = {}) {
  return Node.create({
    name: NUMBERED_LIST_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${NUMBERED_LIST_TITLE_NODE} ${NUMBERED_LIST_ITEM_NODE}+`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyNumberedListData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-numbered-list");
            if (!raw) return emptyNumberedListData();
            try {
              const parsed = NumberedListDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyNumberedListData();
            } catch {
              return emptyNumberedListData();
            }
          },
          renderHTML: (attrs: { data: NumberedListData }) => ({
            "data-numbered-list": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'section[data-node="numbered_list"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "section",
        mergeAttributes(HTMLAttributes, {
          "data-node": "numbered_list",
        }),
        0,
      ];
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

export const NumberedListNode = createNumberedListNode();
