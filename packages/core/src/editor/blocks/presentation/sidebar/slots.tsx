import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";

import { SIDEBAR_BODY_NODE, SIDEBAR_LABEL_NODE, SIDEBAR_TITLE_NODE } from "./content";
import { SidebarBodyView, SidebarLabelView, SidebarTitleView } from "./Sidebar";

const SIDEBAR_LABEL_CONTENT = textContentExpression();
const SIDEBAR_TITLE_CONTENT = textContentExpression();
const SIDEBAR_BODY_CONTENT = textContentExpression();

export const SidebarLabelNode = Node.create({
  name: SIDEBAR_LABEL_NODE,
  group: "block",
  ...fieldContainerSpec({ content: SIDEBAR_LABEL_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="sidebar-label"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "sidebar-label" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SidebarLabelView);
  },
});

export const SidebarTitleNode = Node.create({
  name: SIDEBAR_TITLE_NODE,
  group: "block",
  ...fieldContainerSpec({ content: SIDEBAR_TITLE_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="sidebar-title"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "sidebar-title" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SidebarTitleView);
  },
});

export const SidebarBodyNode = Node.create({
  name: SIDEBAR_BODY_NODE,
  group: "block",
  ...fieldContainerSpec({ content: SIDEBAR_BODY_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="sidebar-body"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "sidebar-body" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SidebarBodyView);
  },
});
