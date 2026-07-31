import { type Editor as TiptapEditor, type Extension, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";

import "@/editor/shell/authoring/cursors.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { validateCourseSurfaceLifecycle } from "@/document/model/validation";
import { builtInSurfaceVariantRegistry } from "@/editor/surfaces/model/built-in-surface-variant-definitions";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { AuthoringDocumentChrome } from "@/editor/shell/authoring/AuthoringDocumentChrome";
import { readSurfaceViewSettingsFromProseMirrorDoc } from "@/document/model/surface-view-settings";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import { AuthoringSurfaceView } from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
import "./CourseDocumentEditor.css";

export type CourseDocumentAuthoringSource =
  | {
      /**
       * Portable JSON initializes this editor session. Tiptap owns live state
       * after mounting; remount when switching artifacts or sources.
       */
      readonly mode: "document";
      readonly content: JSONContent;
      /** Observes portable updates; the host remains responsible for persistence. */
      readonly onUpdate?: (json: JSONContent) => void;
    }
  | {
      /**
       * Trusted host extensions own editor state. Core does not provide,
       * initialize, persist, or synchronize content in this mode.
       */
      readonly mode: "external";
      readonly stateExtensions: readonly Extension[];
      /** Optional checkpoint/validation signal; it does not grant Core persistence authority. */
      readonly onUpdate?: (json: JSONContent) => void;
    };

export interface CourseDocumentEditorProps {
  artifactId?: string | null;
  /**
   * Initial state source for this mounted editor session. The source is
   * immutable after mounting; callers remount to change source or artifact.
   */
  source: CourseDocumentAuthoringSource;
  editable?: boolean;
  /**
   * Schema and content-capability contributions. These remain distinct from
   * external state-owning extensions.
   */
  schemaExtensions?: readonly Extension[];
  onChange?: (editor: TiptapEditor) => void;
  onReady?: (editor: TiptapEditor) => void;
  suspended?: boolean;
}

const DEFAULT_SCHEMA_EXTENSIONS: readonly Extension[] = [];

export function CourseDocumentEditor({
  artifactId,
  source,
  editable = true,
  schemaExtensions = DEFAULT_SCHEMA_EXTENSIONS,
  onChange,
  onReady,
  suspended = false,
}: CourseDocumentEditorProps) {
  const [initialSource] = useState(source);
  const callbackRef = useRef({
    onChange,
    onReady,
    onUpdate: source.onUpdate,
  });
  callbackRef.current = {
    onChange,
    onReady,
    onUpdate: source.onUpdate,
  };
  const handleChange = useCallback((editor: TiptapEditor) => {
    callbackRef.current.onChange?.(editor);
  }, []);
  const handleReady = useCallback((editor: TiptapEditor) => {
    callbackRef.current.onReady?.(editor);
  }, []);
  const handleUpdate = useCallback((editor: TiptapEditor) => {
    const observer = callbackRef.current.onUpdate;
    if (observer) observer(editor.getJSON());
  }, []);
  const validation = useMemo(
    () =>
      initialSource.mode === "document"
        ? validateCourseSurfaceLifecycle({
            content: initialSource.content,
            registry: builtInSurfaceVariantRegistry,
          })
        : { ok: true as const },
    [initialSource],
  );

  if (!validation.ok) {
    return <div role="status">This course document is invalid and cannot be edited.</div>;
  }

  return (
    <MountedCourseDocumentEditor
      artifactId={artifactId}
      source={initialSource}
      editable={editable}
      schemaExtensions={schemaExtensions}
      onChange={handleChange}
      onReady={handleReady}
      onUpdate={handleUpdate}
      suspended={suspended}
    />
  );
}

interface RequiredEditorProps {
  artifactId: string | null | undefined;
  source: CourseDocumentAuthoringSource;
  editable: boolean;
  schemaExtensions: readonly Extension[];
  onChange: ((editor: TiptapEditor) => void) | undefined;
  onReady: ((editor: TiptapEditor) => void) | undefined;
  onUpdate: (editor: TiptapEditor) => void;
  suspended: boolean;
}

function MountedCourseDocumentEditor({
  artifactId,
  source,
  editable,
  schemaExtensions,
  onChange,
  onReady,
  onUpdate,
  suspended,
}: RequiredEditorProps) {
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);
  const authoringExtensions = useMemo(
    () => [
      ...createCourseDocumentAuthoringExtensions({ editable }),
      ...schemaExtensions,
      ...(source.mode === "external" ? source.stateExtensions : []),
    ],
    [editable, schemaExtensions, source],
  );

  const editor = useEditor({
    immediatelyRender: false,
    content: source.mode === "document" ? source.content : null,
    editable: editable && !suspended,
    extensions: authoringExtensions,
    onCreate: ({ editor: e }) => {
      onReady?.(e);
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(e);
      onUpdate(e);
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
