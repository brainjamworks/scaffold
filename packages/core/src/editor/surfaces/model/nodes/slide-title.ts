import { mergeAttributes, Node } from "@tiptap/core";

import { BLOCK_CONTENT } from "@/document/model/content-model/content-groups";

export const SlideTitleNode = Node.create({
  name: "slide_title",
  group: BLOCK_CONTENT,
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'h1[data-slot="slide-title"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["h1", mergeAttributes(HTMLAttributes, { "data-slot": "slide-title" }), 0];
  },
});
