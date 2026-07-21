import { type Editor as TiptapEditor, type Extension, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";

import "@/editor/shell/authoring/cursors.css";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { yXmlFragmentToProsemirrorJSON } from "y-prosemirror";
import type * as Y from "yjs";

import { validateCourseSurfaceLifecycle } from "@/document/model/validation";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  createAuthoringEditorCollaborationSetup,
  type AuthoringEditorCollaborationSetup,
} from "./authoring-collaboration";
import { AuthoringDocumentChrome } from "@/editor/shell/authoring/AuthoringDocumentChrome";
import { readSurfaceViewSettingsFromProseMirrorDoc } from "@/document/model/surface-view-settings";
import { COURSE_DOCUMENT_FRAGMENT } from "@/document/model/constants";
import { createScaffoldDocumentContent } from "@/format/artifact";

import { initializeAuthoringCourseDocumentFragment } from "./initialize-authoring-document";
import { AuthoringSurfaceView } from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
import { surfaceVariantsRemainStable } from "./surface-lifecycle-authoring-policy";
import "./CourseDocumentEditor.css";

export interface CourseDocumentEditorProps {
  artifactId?: string | null;
  document: Y.Doc;
  editable?: boolean;
  extensions?: Extension[];
  onChange?: (editor: TiptapEditor) => void;
  onReady?: (editor: TiptapEditor) => void;
  onUpdate?: (json: JSONContent) => void;
  suspended?: boolean;
}

const DEFAULT_AUTHORING_EXTENSIONS: Extension[] = [];

export function CourseDocumentEditor({
  artifactId,
  document,
  editable = true,
  extensions = DEFAULT_AUTHORING_EXTENSIONS,
  onChange,
  onReady,
  onUpdate,
  suspended = false,
}: CourseDocumentEditorProps) {
  const mountedEditorRef = useRef<TiptapEditor | null>(null);
  const fragment = useMemo(() => {
    // Low-level mounts may receive a fresh Y.Doc; seed only the document fragment.
    if (document.getXmlFragment(COURSE_DOCUMENT_FRAGMENT).length === 0) {
      initializeAuthoringCourseDocumentFragment(
        document,
        createScaffoldDocumentContent({ mode: "page" }),
      );
    }

    return document.getXmlFragment(COURSE_DOCUMENT_FRAGMENT);
  }, [document]);

  const authoritativeStore = useMemo(() => createAuthoritativeSurfaceStore(fragment), [fragment]);
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      authoritativeStore.subscribe(() => {
        if (!authoritativeStore.getSnapshot().valid) {
          mountedEditorRef.current?.destroy();
          mountedEditorRef.current = null;
        }
        onStoreChange();
      }),
    [authoritativeStore],
  );
  const authoritativeState = useSyncExternalStore(
    subscribe,
    authoritativeStore.getSnapshot,
    authoritativeStore.getSnapshot,
  );

  if (!authoritativeState.valid) {
    return <div role="status">This course document is invalid and cannot be edited.</div>;
  }

  return (
    <ValidatedCourseDocumentEditor
      key={authoritativeState.mountVersion}
      artifactId={artifactId}
      document={document}
      editable={editable}
      extensions={extensions}
      onEditorCreated={(editor) => {
        mountedEditorRef.current = editor;
      }}
      onChange={onChange}
      onReady={onReady}
      onUpdate={onUpdate}
      suspended={suspended}
    />
  );
}

function ValidatedCourseDocumentEditor(props: RequiredEditorProps) {
  const authoringSetup = useMemo(
    () =>
      createAuthoringEditorCollaborationSetup({
        document: props.document,
        editable: props.editable,
        extensions: props.extensions,
      }),
    [props.document, props.editable, props.extensions],
  );

  if (!authoringSetup.ok) {
    return <div role="status">This course document is invalid and cannot be edited.</div>;
  }

  return <MountedCourseDocumentEditor {...props} authoringSetup={authoringSetup} />;
}

interface RequiredEditorProps {
  artifactId: string | null | undefined;
  document: Y.Doc;
  editable: boolean;
  extensions: Extension[];
  onChange: ((editor: TiptapEditor) => void) | undefined;
  onEditorCreated: (editor: TiptapEditor) => void;
  onReady: ((editor: TiptapEditor) => void) | undefined;
  onUpdate: ((json: JSONContent) => void) | undefined;
  suspended: boolean;
}

function MountedCourseDocumentEditor({
  artifactId,
  editable,
  onChange,
  onReady,
  onEditorCreated,
  onUpdate,
  suspended,
  authoringSetup,
}: RequiredEditorProps & {
  authoringSetup: Extract<AuthoringEditorCollaborationSetup, { ok: true }>;
}) {
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    content: authoringSetup.content,
    editable: editable && !suspended,
    extensions: authoringSetup.extensions,
    onCreate: ({ editor: e }) => {
      onEditorCreated(e);
      onReady?.(e);
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(e);
      if (onUpdate) onUpdate(e.getJSON());
    },
  });

  useEffect(() => {
    editor?.setEditable(editable && !suspended);
  }, [editable, editor, suspended]);

  if (!editor || suspended) {
    return null;
  }

  const surfaceViewSettings = readSurfaceViewSettingsFromProseMirrorDoc(editor.state.doc);
  if (!surfaceViewSettings) {
    return null;
  }

  return (
    <div
      ref={setOverlayContainer}
      className="sc-course-document-editor"
      data-testid="course-document-editor"
    >
      <ScaffoldArtifactIdentityProvider artifactId={artifactId ?? null}>
        <AuthoringDocumentChrome
          editable={editable}
          editor={editor}
          overlayContainer={overlayContainer}
        >
          <AuthoringSurfaceView settings={surfaceViewSettings}>
            <EditorContent className="sc-course-document-editor__content" editor={editor} />
          </AuthoringSurfaceView>
        </AuthoringDocumentChrome>
      </ScaffoldArtifactIdentityProvider>
    </div>
  );
}

interface AuthoritativeSurfaceSnapshot {
  readonly valid: boolean;
  readonly mountVersion: number;
}

interface AuthoritativeSurfaceStore {
  readonly getSnapshot: () => AuthoritativeSurfaceSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
}

function createAuthoritativeSurfaceStore(fragment: Y.XmlFragment): AuthoritativeSurfaceStore {
  const initial = validateAuthoritativeSurfaceState(fragment);
  let acceptedProjection = initial.ok ? initial.value : null;
  let needsRemount = !initial.ok;
  let snapshot: AuthoritativeSurfaceSnapshot = Object.freeze({
    valid: initial.ok,
    mountVersion: 0,
  });
  const listeners = new Set<() => void>();

  const refresh = () => {
    const validation = validateAuthoritativeSurfaceState(fragment);
    const valid =
      validation.ok &&
      (acceptedProjection === null ||
        surfaceVariantsRemainStable(acceptedProjection, validation.value));
    let mountVersion = snapshot.mountVersion;

    if (valid && validation.ok) {
      acceptedProjection = validation.value;
      if (needsRemount) mountVersion += 1;
      needsRemount = false;
    } else {
      needsRemount = true;
    }

    if (snapshot.valid === valid && snapshot.mountVersion === mountVersion) return;
    snapshot = Object.freeze({ valid, mountVersion });
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      if (listeners.size === 1) {
        fragment.observeDeep(refresh);
        refresh();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) fragment.unobserveDeep(refresh);
      };
    },
  };
}

function validateAuthoritativeSurfaceState(fragment: Y.XmlFragment) {
  return validateCourseSurfaceLifecycle({
    content: yXmlFragmentToProsemirrorJSON(fragment),
    registry: builtInSurfaceVariantRegistry,
  });
}
