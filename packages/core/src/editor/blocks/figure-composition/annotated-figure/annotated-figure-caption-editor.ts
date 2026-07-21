import { Extension, Node, type Editor, type Extensions } from "@tiptap/core";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import { Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

import { resolveStableNode } from "@/document/model/identity/resolve-stable-node";
import type { NestedRichTextContentTarget } from "@/editor/prosemirror/nested-rich-text-editor";
import { InlineIconAuthoringNode } from "@/editor/rich-text/inline-icon/authoring/InlineIconAuthoringNode";
import { MathInlineNode } from "@/editor/rich-text/math/authoring/MathInlineNodeView";
import { KATEX_OPTIONS } from "@/editor/rich-text/math/model/katex-options";
import { isSafeRichTextLinkUri } from "@/editor/rich-text/model/link-safety";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { createScaffoldTextAlignExtension } from "@/editor/rich-text/model/text-alignment";
import { VocabularyTermAuthoringNode } from "@/editor/rich-text/vocabulary-term/authoring/VocabularyTermAuthoringNode";

import { ANNOTATED_FIGURE_NODE } from "./content";
import { resolveAnnotatedFigureModel } from "./annotated-figure-document-model";

const AnnotatedFigureCaptionDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "paragraph",
});

const AnnotatedFigureCaptionEnter = Extension.create({
  name: "annotatedFigureCaptionEnter",
  priority: 1_100,

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.setHardBreak(),
    };
  },
});

export function createAnnotatedFigureCaptionEditorExtensions(): Extensions {
  return [
    AnnotatedFigureCaptionDocument,
    StarterKit.configure({
      blockquote: false,
      bulletList: false,
      codeBlock: false,
      document: false,
      heading: false,
      horizontalRule: false,
      link: false,
      listItem: false,
      orderedList: false,
      paragraph: false,
      underline: false,
      undoRedo: false,
    }),
    ExtendedParagraph,
    TextStyle,
    Color.configure({ types: [TextStyle.name] }),
    FontSize.configure({ types: [TextStyle.name] }),
    Highlight.configure({ multicolor: true }),
    Link.configure({
      isAllowedUri: isSafeRichTextLinkUri,
      openOnClick: false,
    }),
    Underline,
    Subscript,
    Superscript,
    createScaffoldTextAlignExtension(["paragraph"]),
    MathInlineNode.configure({ katexOptions: KATEX_OPTIONS }),
    InlineIconAuthoringNode,
    VocabularyTermAuthoringNode,
    AnnotatedFigureCaptionEnter,
  ];
}

export function createAnnotatedFigureCaptionTarget({
  annotationId,
  editor,
  figureId,
}: {
  annotationId: string;
  editor: Editor;
  figureId: string;
}): NestedRichTextContentTarget | null {
  const annotation = resolveLiveAnnotation(editor, figureId, annotationId);
  if (!annotation) return null;

  return {
    kind: "content",
    node: annotation.node,
    getPos: () => resolveLiveAnnotation(editor, figureId, annotationId)?.pos,
  };
}

function resolveLiveAnnotation(editor: Editor, figureId: string, annotationId: string) {
  if (editor.isDestroyed) return null;
  const owner = resolveStableNode(editor.state.doc, {
    id: figureId,
    nodeType: ANNOTATED_FIGURE_NODE,
  });
  if (owner.status !== "ready") return null;

  const model = resolveAnnotatedFigureModel(owner);
  return model?.annotations.find(({ id }) => id === annotationId) ?? null;
}
