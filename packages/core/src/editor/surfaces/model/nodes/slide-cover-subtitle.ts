import { Node, mergeAttributes } from "@tiptap/core";

import {
  BLOCK_CONTENT,
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";

const SLIDE_COVER_SUBTITLE_CONTENT = textContentExpression();

export const SlideCoverSubtitleNode = Node.create({
  name: "slide_cover_subtitle",
  group: BLOCK_CONTENT,
  ...fieldContainerSpec({ content: SLIDE_COVER_SUBTITLE_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="slide-cover-subtitle"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: "sc-field-content sc-slide-cover-subtitle__content",
        "data-slot": "slide-cover-subtitle",
      }),
      0,
    ];
  },
});
