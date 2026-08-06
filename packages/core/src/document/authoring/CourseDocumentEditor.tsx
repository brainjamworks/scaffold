import { type Editor as TiptapEditor, type Extension, type JSONContent } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";

import "@/editor/shell/authoring/cursors.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { AuthoringDocumentChrome } from "@/editor/shell/authoring/AuthoringDocumentChrome";
import { readSurfaceViewSettingsFromProseMirrorDoc } from "@/document/model/surface-view-settings";
import { createCourseDocumentAuthoringExtensions } from "@/composition/authoring/create-authoring-composition";
import type { ScaffoldAuthoringComposition } from "@/composition/authoring/scaffold-authoring-composition";
import { PersistedCourseThemeSchema } from "@/schemas/course-document";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
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
      /** Optional checkpoint signal; it does not grant Core persistence authority. */
      readonly onUpdate?: (json: JSONContent) => void;
    };

export interface CourseDocumentEditorProps {
  artifactId?: string | null;
  /** Unscaled host geometry used by Slideshow authoring overlays. */
  authoringOverlayCollisionBoundary?: Element | null;
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
  courseAppearance?: ScaffoldColorMode;
  suspended?: boolean;
}

const DEFAULT_SCHEMA_EXTENSIONS: readonly Extension[] = [];

export function CourseDocumentEditor({
  artifactId,
  authoringOverlayCollisionBoundary,
  source,
  composition,
  editable = true,
  schemaExtensions = DEFAULT_SCHEMA_EXTENSIONS,
  onChange,
  onReady,
  courseAppearance = "light",
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
  return (
    <MountedCourseDocumentEditor
      artifactId={artifactId}
      authoringOverlayCollisionBoundary={authoringOverlayCollisionBoundary}
      source={initialSource}
      composition={composition}
      editable={editable}
      schemaExtensions={schemaExtensions}
      onChange={handleChange}
      onReady={handleReady}
      onUpdate={handleUpdate}
      courseAppearance={courseAppearance}
      suspended={suspended}
    />
  );
}

interface RequiredEditorProps {
  artifactId: string | null | undefined;
  authoringOverlayCollisionBoundary: Element | null | undefined;
  source: CourseDocumentAuthoringSource;
  composition: ScaffoldAuthoringComposition;
  editable: boolean;
  schemaExtensions: readonly Extension[];
  onChange: ((editor: TiptapEditor) => void) | undefined;
  onReady: ((editor: TiptapEditor) => void) | undefined;
  onUpdate: (editor: TiptapEditor) => void;
  courseAppearance: ScaffoldColorMode;
  suspended: boolean;
}

function MountedCourseDocumentEditor({
  artifactId,
  authoringOverlayCollisionBoundary,
  source,
  composition,
  editable,
  schemaExtensions,
  onChange,
  onReady,
  onUpdate,
  courseAppearance,
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
  const useUnscaledSlideshowOverlayBoundary =
    surfaceViewSettings.mode === "slideshow" && authoringOverlayCollisionBoundary != null;

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
          {...(useUnscaledSlideshowOverlayBoundary
            ? {
                overlayCollisionBoundary: authoringOverlayCollisionBoundary,
                overlayKind: "viewport" as const,
              }
            : {})}
        >
          <ThemedCourseDocumentContent
            editor={editor}
            courseAppearance={courseAppearance}
            surfaceViewSettings={surfaceViewSettings}
          />
        </AuthoringDocumentChrome>
      </ScaffoldArtifactIdentityProvider>
    </div>
  );
}

function ThemedCourseDocumentContent({
  editor,
  courseAppearance,
  surfaceViewSettings,
}: Readonly<{
  editor: TiptapEditor;
  courseAppearance: ScaffoldColorMode;
  surfaceViewSettings: NonNullable<ReturnType<typeof readSurfaceViewSettingsFromProseMirrorDoc>>;
}>) {
  const liveTheme = useEditorState({
    editor,
    selector: ({ editor: liveEditor }) =>
      liveEditor.state.doc.firstChild?.type.name === "courseDocument"
        ? liveEditor.state.doc.firstChild.attrs["theme"]
        : null,
  });
  const parsedTheme = PersistedCourseThemeSchema.safeParse(liveTheme);

  if (!parsedTheme.success) return null;

  return (
    <CourseThemeProvider
      theme={parsedTheme.data}
      appearance={courseAppearance}
      hasBackground={false}
    >
      <AuthoringSurfaceView settings={surfaceViewSettings}>
        <EditorContent className="sc-course-document-editor__content" editor={editor} />
      </AuthoringSurfaceView>
    </CourseThemeProvider>
  );
}
