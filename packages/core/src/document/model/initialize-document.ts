import Collaboration from "@tiptap/extension-collaboration";
import { Editor, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type * as Y from "yjs";

import type { CourseMode } from "@/schemas/course-document";

import { CellNode, GridNode } from "@/editor/arrangements/grid/model/grid-nodes";
import { LayoutNode, SectionNode } from "@/editor/arrangements/layout/model/layout-nodes";
import { ExtendedParagraph } from "@/editor/rich-text/model/paragraph";
import { CourseDocumentNode, DocumentNode } from "@/document/model/nodes";
import { createCourseDocumentInlineContentExtensions } from "@/composition/model/create-document-composition";
import { createScaffoldDocumentContent } from "@/format/artifact";
import { COURSE_DOCUMENT_FRAGMENT } from "@/document/model/constants";
import { SurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import { RegionNode } from "@/editor/surfaces/model/nodes/region-node";
import { SlideCoverSubtitleNode } from "@/editor/surfaces/model/nodes/slide-cover-subtitle";
import { SlideTitleNode } from "@/editor/surfaces/model/nodes/slide-title";

export function initializeCourseDocumentFragment(
  doc: Y.Doc,
  args: { mode: CourseMode } | { content: JSONContent },
): void {
  const fragment = doc.getXmlFragment(COURSE_DOCUMENT_FRAGMENT);
  if (fragment.length > 0) return;

  const editor = new Editor({
    extensions: [
      DocumentNode,
      StarterKit.configure({
        document: false,
        undoRedo: false,
        paragraph: false,
      }),
      CourseDocumentNode,
      SurfaceNode,
      RegionNode,
      SlideCoverSubtitleNode,
      SlideTitleNode,
      GridNode,
      CellNode,
      LayoutNode,
      SectionNode,
      ExtendedParagraph,
      ...createCourseDocumentInlineContentExtensions(),
      Collaboration.configure({
        document: doc,
        field: COURSE_DOCUMENT_FRAGMENT,
      }),
    ],
  });

  const content =
    "content" in args ? args.content : createScaffoldDocumentContent({ mode: args.mode });

  editor.commands.setContent(content, {
    emitUpdate: false,
  });
  editor.destroy();
}
