import { type Editor as TiptapEditor, type Extension, type JSONContent } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";

import "@/editor/shell/authoring/cursors.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { validateCourseSurfaceLifecycle } from "@/document/model/validation";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { AuthoringDocumentChrome } from "@/editor/shell/authoring/AuthoringDocumentChrome";
import { readSurfaceViewSettingsFromProseMirrorDoc } from "@/document/model/surface-view-settings";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import type { ScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import type { ResolvedCourseTheme } from "@/theme/model";
import { CourseThemeScope } from "@/theme/presentation";
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
  composition: ScaffoldAuthoringComposition;
  editable?: boolean;
  /**
   * Schema and content-capability contributions. These remain distinct from
   * external state-owning extensions.
   */
  schemaExtensions?: readonly Extension[];
  onChange?: (editor: TiptapEditor) => void;
  onReady?: (editor: TiptapEditor) => void;
  resolvedTheme?: ResolvedCourseTheme;
  suspended?: boolean;
}

const DEFAULT_SCHEMA_EXTENSIONS: readonly Extension[] = [];

export function CourseDocumentEditor({
  artifactId,
  source,
  composition,
  editable = true,
  schemaExtensions = DEFAULT_SCHEMA_EXTENSIONS,
  onChange,
  onReady,
  resolvedTheme,
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
            registry: composition.capabilities.surfaces.registry,
          })
        : { ok: true as const },
    [composition, initialSource],
  );

  if (!validation.ok) {
    return <div role="status">This course document is invalid and cannot be edited.</div>;
  }

  return (
    <MountedCourseDocumentEditor
      artifactId={artifactId}
      source={initialSource}
      composition={composition}
      editable={editable}
      schemaExtensions={schemaExtensions}
      onChange={handleChange}
      onReady={handleReady}
      onUpdate={handleUpdate}
      resolvedTheme={resolvedTheme}
      suspended={suspended}
    />
  );
}

interface RequiredEditorProps {
  artifactId: string | null | undefined;
  source: CourseDocumentAuthoringSource;
  composition: ScaffoldAuthoringComposition;
  editable: boolean;
  schemaExtensions: readonly Extension[];
  onChange: ((editor: TiptapEditor) => void) | undefined;
  onReady: ((editor: TiptapEditor) => void) | undefined;
  onUpdate: (editor: TiptapEditor) => void;
  resolvedTheme: ResolvedCourseTheme | undefined;
  suspended: boolean;
}

function MountedCourseDocumentEditor({
  artifactId,
  source,
  composition,
  editable,
  schemaExtensions,
  onChange,
  onReady,
  onUpdate,
  resolvedTheme,
  suspended,
}: RequiredEditorProps) {
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);
  const authoringExtensions = useMemo(
    () => [
      ...createCourseDocumentAuthoringExtensions({ editable, composition }),
      ...schemaExtensions,
      ...(source.mode === "document" ? [UndoRedo] : source.stateExtensions),
    ],
    [composition, editable, schemaExtensions, source],
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
          <CourseThemeScope resolvedTheme={resolvedTheme}>
            <AuthoringSurfaceView settings={surfaceViewSettings}>
              <EditorContent className="sc-course-document-editor__content" editor={editor} />
            </AuthoringSurfaceView>
          </CourseThemeScope>
        </AuthoringDocumentChrome>
      </ScaffoldArtifactIdentityProvider>
    </div>
  );
}
