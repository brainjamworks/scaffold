import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { fieldContainerSpec } from "@/document/model/content-model/content-groups";

import { ChecklistItemNodeView } from "./Checklist";
import { CHECKLIST_ITEM_NODE } from "./content";

export const ChecklistItemNode = Node.create({
  name: CHECKLIST_ITEM_NODE,
  ...fieldContainerSpec(),

  parseHTML() {
    return [{ tag: 'li[data-node="checklist-item"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(HTMLAttributes, {
        "data-node": "checklist-item",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChecklistItemNodeView);
  },
});
