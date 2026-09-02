import { type Editor as TiptapEditor, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";

import "@/editor/shell/authoring/cursors.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { AuthoringDocumentChrome } from "@/editor/shell/authoring/AuthoringDocumentChrome";
import { readSurfaceViewSettingsFromProseMirrorDoc } from "@/document/model/surface-view-settings";
import { getSemanticDocumentControllerForEditor } from "@/document/authoring/semantic-document";
import { createAuthoringSemanticNavigationEnvironment } from "@/document/authoring/semantic-document/authoring-semantic-navigation-environment";
import { getCourseDocumentAuthoringEnvironmentState } from "@/composition/authoring/create-authoring-composition";
import {
  canonicalizeAuthoringDocument,
  type DocumentEstablishmentIssue,
  type UnavailableContentRef,
} from "@/document/model/establishment";
import {
  getCourseDocumentAuthoringMountState,
  type CourseDocumentAuthoringMount,
} from "@/document/authoring/prepared-authoring-mount";
import { PersistedCourseThemeSchema } from "@/schemas/course-document";
import { CourseThemeProvider } from "@/theme/course/CourseThemeProvider";
import type { ScaffoldColorMode } from "@/theme/state/color-mode";
import { AuthoringSurfaceView } from "@/editor/surfaces/authoring/views/AuthoringSurfaceView";
import "./CourseDocumentEditor.css";

export interface CourseDocumentEditorProps {
  artifactId?: string | null;
  /** Unscaled host geometry used by Slideshow authoring overlays. */
  authoringOverlayCollisionBoundary?: Element | null;
  /** Opaque input produced by Core's complete authoring preparation boundary. */
  mount: CourseDocumentAuthoringMount;
  onChange?: (editor: TiptapEditor) => void;
  onReady?: (editor: TiptapEditor) => void;
  onUpdate?: (json: JSONContent, unavailableContent: readonly UnavailableContentRef[]) => void;
  onDocumentError?: (failure: CourseDocumentAuthoringFailure) => void;
  onUnavailableContentChange?: (content: readonly UnavailableContentRef[]) => void;
  courseAppearance?: ScaffoldColorMode;
  suspended?: boolean;
}

export type CourseDocumentAuthoringFailure =
  | {
      readonly status: "canonicalization-failed";
      readonly issues: readonly DocumentEstablishmentIssue[];
    }
  | {
      readonly status: "requires-scaffold-plus";
    }
  | {
      readonly status: "unsupported-core-format";
      readonly documentVersion: number;
      readonly supportedVersion: number;
      readonly message: string;
    };

export function CourseDocumentEditor({
  artifactId,
  authoringOverlayCollisionBoundary,
  mount,
  onChange,
  onReady,
  onUpdate,
  onDocumentError,
  onUnavailableContentChange,
  courseAppearance = "light",
  suspended = false,
}: CourseDocumentEditorProps) {
  const [initialMount] = useState(mount);
  const mountState = useMemo(
    () => getCourseDocumentAuthoringMountState(initialMount),
    [initialMount],
  );
  const environmentState = useMemo(
    () => getCourseDocumentAuthoringEnvironmentState(mountState.environment),
    [mountState.environment],
  );
  const callbackRef = useRef({
    onChange,
    onDocumentError,
    onReady,
    onUpdate,
    onUnavailableContentChange,
  });
  callbackRef.current = {
    onChange,
    onDocumentError,
    onReady,
    onUpdate,
    onUnavailableContentChange,
  };

  useEffect(() => {
    callbackRef.current.onUnavailableContentChange?.(mountState.unavailableContent);
  }, [mountState]);
  const handleChange = useCallback((editor: TiptapEditor) => {
    callbackRef.current.onChange?.(editor);
  }, []);
  const handleReady = useCallback((editor: TiptapEditor) => {
    callbackRef.current.onReady?.(editor);
  }, []);
  const handleUpdate = useCallback(
    (editor: TiptapEditor) => {
      const observer = callbackRef.current.onUpdate;
      const canonical = canonicalizeAuthoringDocument({
        workingDocument: editor.getJSON(),
        capabilities: environmentState.capabilities,
        authoringSchema: environmentState.schema,
        expectedRequiresScaffoldPlus: mountState.expectedRequiresScaffoldPlus,
        productAccess: mountState.productAccess,
      });
      if (canonical.status === "invalid") {
        callbackRef.current.onDocumentError?.({
          status: "canonicalization-failed",
          issues: canonical.issues,
        });
        return;
      }
      if (canonical.status === "unsupported-core-format") {
        callbackRef.current.onDocumentError?.(canonical);
        return;
      }
      if (canonical.status === "requires-scaffold-plus") {
        callbackRef.current.onDocumentError?.(canonical);
        return;
      }
      callbackRef.current.onUnavailableContentChange?.(canonical.unavailableContent);
      observer?.(canonical.canonicalDocument, canonical.unavailableContent);
    },
    [environmentState, mountState.expectedRequiresScaffoldPlus, mountState.productAccess],
  );

  return (
    <MountedCourseDocumentEditor
      artifactId={artifactId}
      authoringOverlayCollisionBoundary={authoringOverlayCollisionBoundary}
      content={mountState.workingDocument}
      composition={environmentState.composition}
      editable={environmentState.editable}
      authoringExtensions={environmentState.extensions}
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
  content: JSONContent;
  composition: ReturnType<typeof getCourseDocumentAuthoringEnvironmentState>["composition"];
  editable: boolean;
  authoringExtensions: ReturnType<typeof getCourseDocumentAuthoringEnvironmentState>["extensions"];
  onChange: ((editor: TiptapEditor) => void) | undefined;
  onReady: ((editor: TiptapEditor) => void) | undefined;
  onUpdate: (editor: TiptapEditor) => void;
  courseAppearance: ScaffoldColorMode;
  suspended: boolean;
}

function MountedCourseDocumentEditor({
  artifactId,
  authoringOverlayCollisionBoundary,
  content,
  composition,
  editable,
  authoringExtensions,
  onChange,
  onReady,
  onUpdate,
  courseAppearance,
  suspended,
}: RequiredEditorProps) {
  const [overlayContainer, setOverlayContainer] = useState<HTMLDivElement | null>(null);
  const editor = useEditor({
    immediatelyRender: false,
    content,
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

  useEffect(() => {
    if (!editor || !overlayContainer) return;
    const controller = getSemanticDocumentControllerForEditor(editor);
    controller.setNavigationEditor({
      dispatch: (transaction) => editor.view.dispatch(transaction),
      focus: () => editor.view.focus(),
    });
    controller.setNavigationEnvironment(
      createAuthoringSemanticNavigationEnvironment({
        blockDefinitions: composition.capabilities.blocks.registry,
        getSnapshot: () => controller.getSnapshot().semantics,
        root: overlayContainer,
        view: editor.view,
      }),
    );
    return () => {
      controller.clearNavigation();
    };
  }, [composition.capabilities.blocks.registry, editor, overlayContainer]);

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
          courseAppearance={courseAppearance}
          editable={editable}
          editor={editor}
          overlayContainer={overlayContainer}
          surfaceAuthoringChrome={composition.surfaces.chrome}
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
