import Collaboration from "@tiptap/extension-collaboration";
import { Editor, type JSONContent } from "@tiptap/core";
import type * as Y from "yjs";

import { COURSE_DOCUMENT_FRAGMENT } from "@/document/model/constants";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";

export function initializeAuthoringCourseDocumentFragment(doc: Y.Doc, content: JSONContent): void {
  const fragment = doc.getXmlFragment(COURSE_DOCUMENT_FRAGMENT);
  if (fragment.length > 0) return;

  const editor = new Editor({
    extensions: [
      ...createCourseDocumentAuthoringExtensions({ editable: true }),
      Collaboration.configure({
        document: doc,
        field: COURSE_DOCUMENT_FRAGMENT,
      }),
    ],
  });

  editor.commands.setContent(content, {
    emitUpdate: false,
  });
  editor.destroy();
}
