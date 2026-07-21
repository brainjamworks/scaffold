import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { KeyValueListDataSchema, type KeyValueListData } from "@scaffold/contracts";

import { COURSE_BLOCK_CONTENT } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { KEY_VALUE_LIST_NODE, KEY_VALUE_ROW_NODE, emptyKeyValueListData } from "./content";

export interface KeyValueListNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function createKeyValueListNode(options: KeyValueListNodeOptions = {}) {
  return Node.create({
    name: KEY_VALUE_LIST_NODE,
    group: `block ${COURSE_BLOCK_CONTENT}`,
    content: `${KEY_VALUE_ROW_NODE}+`,
    defining: true,
    draggable: false,
    selectable: true,

    addAttributes() {
      return {
        id: stableNodeIdAttribute(),
        data: {
          default: emptyKeyValueListData(),
          parseHTML: (el: HTMLElement) => {
            const raw = el.getAttribute("data-key-value-list");
            if (!raw) return emptyKeyValueListData();
            try {
              const parsed = KeyValueListDataSchema.safeParse(JSON.parse(raw));
              return parsed.success ? parsed.data : emptyKeyValueListData();
            } catch {
              return emptyKeyValueListData();
            }
          },
          renderHTML: (attrs: { data: KeyValueListData }) => ({
            "data-key-value-list": JSON.stringify(attrs.data),
          }),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'dl[data-node="key-value-list"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["dl", mergeAttributes(HTMLAttributes, { "data-node": "key-value-list" }), 0];
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

export const KeyValueListNode = createKeyValueListNode();
