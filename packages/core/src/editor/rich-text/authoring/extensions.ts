import type { Extensions } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

import { InlineIconAuthoringNode } from "@/editor/rich-text/inline-icon/authoring/InlineIconAuthoringNode";
import { MathBlockNode } from "@/editor/rich-text/math/model/MathBlock";
import { MathInlineNode } from "@/editor/rich-text/math/authoring/MathInlineNodeView";
import { KATEX_OPTIONS } from "@/editor/rich-text/math/model/katex-options";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import {
  ExtendedBlockquote,
  ExtendedBulletList,
  ExtendedCodeBlock,
  ExtendedHeading,
  ExtendedHorizontalRule,
  ExtendedListItem,
  ExtendedOrderedList,
} from "@/editor/rich-text/model/rich-text-blocks";
import { isSafeRichTextLinkUri } from "@/editor/rich-text/model/link-safety";
import { VocabularyTermAuthoringNode } from "@/editor/rich-text/vocabulary-term/authoring/VocabularyTermAuthoringNode";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";

export interface ScaffoldRichTextAuthoringExtensionOptions {
  undoRedo: boolean;
}

function starterKitExtensions(options: ScaffoldRichTextAuthoringExtensionOptions) {
  return StarterKit.configure({
    blockquote: false,
    bulletList: false,
    codeBlock: false,
    heading: false,
    horizontalRule: false,
    link: false,
    listItem: false,
    orderedList: false,
    paragraph: false,
    underline: false,
    ...(options.undoRedo ? {} : { undoRedo: false }),
  });
}

function richTextMarkExtensions(): Extensions {
  return [
    TextStyle,
    Color.configure({
      types: [TextStyle.name],
    }),
    FontSize.configure({
      types: [TextStyle.name],
    }),
    Highlight.configure({
      multicolor: true,
    }),
    Link.configure({
      isAllowedUri: isSafeRichTextLinkUri,
      openOnClick: false,
    }),
    Underline,
    Subscript,
    Superscript,
    createScaffoldTextAlignExtension(["paragraph", "heading"]),
  ];
}

function richTextBlockExtensions(): Extensions {
  return [
    ExtendedParagraph,
    ExtendedHeading,
    ExtendedBulletList,
    ExtendedOrderedList,
    ExtendedListItem,
    ExtendedBlockquote,
    ExtendedCodeBlock,
    ExtendedHorizontalRule,
    MathBlockNode.configure({ katexOptions: KATEX_OPTIONS }),
  ];
}

export function createScaffoldRichTextAuthoringExtensions(
  options: ScaffoldRichTextAuthoringExtensionOptions,
): Extensions {
  return [
    starterKitExtensions(options),
    ...richTextBlockExtensions(),
    ...richTextMarkExtensions(),
    MathInlineNode.configure({ katexOptions: KATEX_OPTIONS }),
    InlineIconAuthoringNode,
    VocabularyTermAuthoringNode,
  ];
}
