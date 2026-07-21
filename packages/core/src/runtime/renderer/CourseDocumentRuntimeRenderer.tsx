import { type Editor as TiptapEditor, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";

import { readSurfaceViewSettings } from "@/document/model/surface-view-settings";
import { createCourseDocumentRuntimeExtensions } from "@/composition/runtime/create-runtime-composition";

import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import {
  RuntimeSurfaceVisibility,
  type RuntimeSurfaceStateMap,
  setRuntimeSurfaceStates,
  setRuntimeVisibleSurfaceId,
} from "./runtime-surface-visibility";
import { RuntimeSurfaceView } from "@/editor/surfaces/runtime/views/RuntimeSurfaceView";
import "./CourseDocumentRuntimeRenderer.css";

export interface CourseDocumentRuntimeRendererProps {
  artifactId?: string | null;
  initialContent?: JSONContent | null;
  onReady?: (editor: TiptapEditor) => void;
  surfaceStates?: RuntimeSurfaceStateMap;
  visibleSurfaceId?: string;
}

export function CourseDocumentRuntimeRenderer({
  artifactId,
  initialContent = null,
  onReady,
  surfaceStates,
  visibleSurfaceId,
}: CourseDocumentRuntimeRendererProps) {
  const surfaceViewSettings = readSurfaceViewSettings(initialContent);

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      ...(initialContent ? { content: initialContent } : {}),
      extensions: [...createCourseDocumentRuntimeExtensions(), RuntimeSurfaceVisibility],
      onCreate: ({ editor: e }) => {
        onReady?.(e);
      },
    },
    [initialContent],
  );

  useEffect(() => {
    if (!editor) return;

    if (surfaceStates) {
      setRuntimeSurfaceStates(editor, surfaceStates);
    } else {
      setRuntimeVisibleSurfaceId(editor, visibleSurfaceId);
    }
  }, [editor, surfaceStates, visibleSurfaceId]);

  if (!editor) {
    return null;
  }

  if (!surfaceViewSettings) {
    return null;
  }

  return (
    <div data-testid="course-document-runtime-renderer">
      <ScaffoldArtifactIdentityProvider artifactId={artifactId ?? null}>
        <RuntimeSurfaceView settings={surfaceViewSettings}>
          <EditorContent className="sc-course-document-runtime-renderer__content" editor={editor} />
        </RuntimeSurfaceView>
      </ScaffoldArtifactIdentityProvider>
    </div>
  );
}
