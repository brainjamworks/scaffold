import { Blockquote } from "@tiptap/extension-blockquote";
import { CodeBlock } from "@tiptap/extension-code-block";
import { Heading } from "@tiptap/extension-heading";
import { HorizontalRule } from "@tiptap/extension-horizontal-rule";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";

import { TEXT_CONTENT } from "@/document/model/content-model/content-groups";

export const ExtendedHeading = Heading.extend({
  group: `block ${TEXT_CONTENT}`,
});

export const ExtendedBulletList = BulletList.extend({
  group: `block ${TEXT_CONTENT}`,
});

export const ExtendedOrderedList = OrderedList.extend({
  group: `block ${TEXT_CONTENT}`,
});

export const ExtendedListItem = ListItem.extend({
  content: `paragraph ${TEXT_CONTENT}*`,
});

export const ExtendedBlockquote = Blockquote.extend({
  content: `${TEXT_CONTENT}+`,
  group: `block ${TEXT_CONTENT}`,
});

export const ExtendedCodeBlock = CodeBlock.extend({
  group: `block ${TEXT_CONTENT}`,
});

export const ExtendedHorizontalRule = HorizontalRule.extend({
  group: `block ${TEXT_CONTENT}`,
});
