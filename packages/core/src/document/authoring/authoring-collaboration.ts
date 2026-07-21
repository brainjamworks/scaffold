import Collaboration from "@tiptap/extension-collaboration";
import { getSchema, type Content, type Extensions, type JSONContent } from "@tiptap/core";
import { initProseMirrorDoc, yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import type * as Y from "yjs";

import { COURSE_DOCUMENT_FRAGMENT } from "@/document/model/constants";
import {
  validateCourseSurfaceLifecycle,
  type CourseDocumentIssue,
} from "@/document/model/validation";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";

import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";

interface CreateAuthoringEditorCollaborationOptions {
  document: Y.Doc;
  editable: boolean;
  extensions?: Extensions;
}

export type AuthoringEditorCollaborationSetup =
  | {
      readonly ok: true;
      readonly content: Content;
      readonly extensions: Extensions;
    }
  | {
      readonly ok: false;
      readonly issues: readonly CourseDocumentIssue[];
    };

export function createAuthoringEditorCollaborationSetup({
  document,
  editable,
  extensions = [],
}: CreateAuthoringEditorCollaborationOptions): AuthoringEditorCollaborationSetup {
  const fragment = document.getXmlFragment(COURSE_DOCUMENT_FRAGMENT);
  const content: JSONContent = yXmlFragmentToProsemirrorJSON(fragment);
  const validation = validateCourseSurfaceLifecycle({
    content,
    registry: builtInSurfaceVariantRegistry,
  });
  if (!validation.ok) {
    return Object.freeze({ ok: false, issues: validation.issues });
  }

  const authoringExtensions = [
    ...createCourseDocumentAuthoringExtensions({ editable }),
    ...extensions,
  ];
  const schema = getSchema(authoringExtensions);
  const { mapping } = initProseMirrorDoc(fragment, schema);

  return {
    ok: true,
    content,
    extensions: [
      ...authoringExtensions,
      Collaboration.configure({
        document,
        field: COURSE_DOCUMENT_FRAGMENT,
        ySyncOptions: { mapping },
      }),
    ],
  };
}
