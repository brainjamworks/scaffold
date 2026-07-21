import { NumberedListMarkerStateSchema } from "@scaffold/contracts";
import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { fieldContainerSpec } from "@/document/model/content-model/content-groups";
import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";

import { NumberedListItemNodeView, NumberedListTitleNodeView } from "./NumberedList";
import { NUMBERED_LIST_ITEM_NODE, NUMBERED_LIST_TITLE_NODE } from "./content";

export function createNumberedListTitleNode(
  addNodeView: () => NodeViewRenderer = () => ReactNodeViewRenderer(NumberedListTitleNodeView),
) {
  return Node.create({
    name: NUMBERED_LIST_TITLE_NODE,
    ...fieldContainerSpec(),

    parseHTML() {
      return [{ tag: 'div[data-slot="numbered-list-title"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-slot": "numbered-list-title",
        }),
        0,
      ];
    },

    addNodeView,
  });
}

export const NumberedListTitleNode = createNumberedListTitleNode();

export const NumberedListItemNode = Node.create({
  name: NUMBERED_LIST_ITEM_NODE,
  ...fieldContainerSpec(),

  addAttributes() {
    return {
      id: stableNodeIdAttribute(),
      status: {
        default: "neutral",
        parseHTML: (el: HTMLElement) => {
          const parsed = NumberedListMarkerStateSchema.safeParse(el.getAttribute("data-status"));
          return parsed.success ? parsed.data : "neutral";
        },
        renderHTML: (attrs: { status?: unknown }) => {
          const parsed = NumberedListMarkerStateSchema.safeParse(attrs.status);
          return {
            "data-status": parsed.success ? parsed.data : "neutral",
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'li[data-node="numbered-list-item"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(HTMLAttributes, {
        "data-node": "numbered-list-item",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NumberedListItemNodeView);
  },
});
