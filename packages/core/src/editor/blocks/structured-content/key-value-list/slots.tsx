import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { fieldContainerSpec } from "@/document/model/content-model/content-groups";

import {
  KeyValueRowKeyNodeView,
  KeyValueRowNodeView,
  KeyValueRowValueNodeView,
} from "./KeyValueList";
import { KEY_VALUE_ROW_KEY_NODE, KEY_VALUE_ROW_NODE, KEY_VALUE_ROW_VALUE_NODE } from "./content";

/* Plain-text key slot. Single paragraph, no marks — keys read as
 * labels, not prose, and the brand voice (PRODUCT.md) reserves
 * rich formatting for body text. */
export const KeyValueRowKeyNode = Node.create({
  name: KEY_VALUE_ROW_KEY_NODE,
  ...fieldContainerSpec({ content: "paragraph" }),

  parseHTML() {
    return [{ tag: 'dt[data-slot="key-value-row-key"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "dt",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "key-value-row-key",
        class: "sc-course-key-value-list__key",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KeyValueRowKeyNodeView);
  },
});

/* Rich value slot. Single paragraph; marks allowed (inline emphasis,
 * code, links). One paragraph keeps row geometry predictable; if a
 * row needs a real list / quote, that's a separate block. */
export const KeyValueRowValueNode = Node.create({
  name: KEY_VALUE_ROW_VALUE_NODE,
  ...fieldContainerSpec({ content: "paragraph" }),

  parseHTML() {
    return [{ tag: 'dd[data-slot="key-value-row-value"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "dd",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "key-value-row-value",
        class: "sc-course-key-value-list__value",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KeyValueRowValueNodeView);
  },
});

/* Row container — exactly one key + one value. */
export const KeyValueRowNode = Node.create({
  name: KEY_VALUE_ROW_NODE,
  content: `${KEY_VALUE_ROW_KEY_NODE} ${KEY_VALUE_ROW_VALUE_NODE}`,
  defining: true,
  isolating: true,
  selectable: false,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-node="key-value-row"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-node": "key-value-row",
        class: "sc-course-key-value-list__row",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(KeyValueRowNodeView);
  },
});
