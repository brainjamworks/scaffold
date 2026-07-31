import Collaboration from "@tiptap/extension-collaboration";
import {
  Extension,
  getSchema,
  type Content,
  type Extensions,
  type JSONContent,
} from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
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
      collaborationUndoLifecycleGuard,
    ],
  };
}

/**
 * Tiptap can recreate its ProseMirror view while retaining the collaboration
 * plugin state. The collaboration view's cleanup destroys the retained Yjs
 * UndoManager, which removes the manager from its own tracked origins. Restore
 * that invariant immediately before history commands so undo transactions
 * always create redo entries.
 */
const collaborationUndoLifecycleGuard = Extension.create({
  name: "collaborationUndoLifecycleGuard",

  addCommands() {
    return {
      undo:
        () =>
        ({ tr, state, dispatch }) => {
          tr.setMeta("preventDispatch", true);
          const undoManager = findCollaborationUndoManager(state);
          if (!undoManager || undoManager.undoStack.length === 0) return false;
          if (!dispatch) return true;
          undoManager.addTrackedOrigin(undoManager);
          return undoManager.undo() !== null;
        },
      redo:
        () =>
        ({ tr, state, dispatch }) => {
          tr.setMeta("preventDispatch", true);
          const undoManager = findCollaborationUndoManager(state);
          if (!undoManager || undoManager.redoStack.length === 0) return false;
          if (!dispatch) return true;
          undoManager.addTrackedOrigin(undoManager);
          return undoManager.redo() !== null;
        },
    };
  },
});

function findCollaborationUndoManager(state: EditorState): Y.UndoManager | null {
  for (const plugin of state.plugins) {
    const pluginKey = plugin.spec.key as { key: string } | undefined;
    if (!pluginKey?.key.startsWith("y-undo$")) continue;
    const pluginState = plugin.getState(state) as { undoManager?: Y.UndoManager } | undefined;
    return pluginState?.undoManager ?? null;
  }
  return null;
}
