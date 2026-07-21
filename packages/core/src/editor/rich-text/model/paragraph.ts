import Paragraph from "@tiptap/extension-paragraph";

import {
  TEXT_CONTENT,
  FILL_BLANK_INLINE_CONTENT,
} from "@/document/model/content-model/content-groups";

/**
 * Paragraph extended to also belong to the authored text-content group.
 *
 * StarterKit's default paragraph only belongs to `block`. Composite slots
 * need paragraph available anywhere text content is editable. Fill-in-the-
 * blank body fields also opt into a narrower inline command group.
 *
 * Configured in `Editor.tsx` via `StarterKit.configure({ paragraph: false })`
 * + this extension in its place.
 */
export const ExtendedParagraph = Paragraph.extend({
  group: `block ${TEXT_CONTENT} ${FILL_BLANK_INLINE_CONTENT}`,
});
