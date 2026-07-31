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
import { RuntimeSurfacePresentationProvider } from "./runtime-surface-presentation";
import { RuntimeSurfaceView } from "@/editor/surfaces/runtime/views/RuntimeSurfaceView";
import type { ResolvedCourseTheme } from "@/theme/model";
import { CourseThemeScope } from "@/theme/presentation";
import "./CourseDocumentRuntimeRenderer.css";

export interface CourseDocumentRuntimeRendererProps {
  artifactId?: string | null;
  initialContent?: JSONContent | null;
  onReady?: (editor: TiptapEditor) => void;
  resolvedTheme?: ResolvedCourseTheme;
  surfaceStates?: RuntimeSurfaceStateMap;
  visibleSurfaceId?: string;
}

export function CourseDocumentRuntimeRenderer({
  artifactId,
  initialContent = null,
  onReady,
  resolvedTheme,
  surfaceStates,
  visibleSurfaceId,
}: CourseDocumentRuntimeRendererProps) {
  const surfaceViewSettings = readSurfaceViewSettings(initialContent);
  const presentedSurfaceId = surfaceStates
    ? (Object.entries(surfaceStates).find(([, state]) => state === "current")?.[0] ?? null)
    : visibleSurfaceId;

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
        <CourseThemeScope resolvedTheme={resolvedTheme}>
          <RuntimeSurfaceView settings={surfaceViewSettings}>
            <RuntimeSurfacePresentationProvider surfaceId={presentedSurfaceId}>
              <EditorContent
                className="sc-course-document-runtime-renderer__content"
                editor={editor}
              />
            </RuntimeSurfacePresentationProvider>
          </RuntimeSurfaceView>
        </CourseThemeScope>
      </ScaffoldArtifactIdentityProvider>
    </div>
  );
}
