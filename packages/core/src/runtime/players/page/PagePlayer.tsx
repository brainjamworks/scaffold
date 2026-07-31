import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { useState } from "react";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";
import type { ResolvedCourseTheme } from "@/theme/model";
import { DEFAULT_RESOLVED_COURSE_THEME } from "@/theme/presentation/CourseThemeScope";

import { CourseDocumentRuntimeRenderer } from "../../renderer/CourseDocumentRuntimeRenderer";
import "./PagePlayer.css";

export interface PagePlayerProps {
  artifactId?: string | null;
  initialContent: JSONContent;
  resolvedTheme?: ResolvedCourseTheme;
  surfaceId: string;
  onRendererReady?: (editor: TiptapEditor) => void;
}

export function PagePlayer({
  artifactId,
  initialContent,
  resolvedTheme,
  surfaceId,
  onRendererReady,
}: PagePlayerProps) {
  const [playerElement, setPlayerElement] = useState<HTMLDivElement | null>(null);
  const effectiveTheme = resolvedTheme ?? DEFAULT_RESOLVED_COURSE_THEME;
  const playerAttributes = {
    "data-runtime-player": "page",
    "data-runtime-surface-id": surfaceId,
  };

  return (
    <div
      ref={setPlayerElement}
      data-testid="page-player"
      className="sc-page-player"
      {...playerAttributes}
    >
      <OverlayBoundary
        container={playerElement}
        hostClassName="sc-course-theme-portal-scope"
        hostColorScheme={effectiveTheme.mode}
        hostCssVariables={effectiveTheme.cssTokens}
        kind="viewport"
      >
        <div className="sc-page-player__content">
          <CourseDocumentRuntimeRenderer
            artifactId={artifactId ?? null}
            initialContent={initialContent}
            {...(resolvedTheme ? { resolvedTheme } : {})}
            {...(onRendererReady ? { onReady: onRendererReady } : {})}
          />
        </div>
      </OverlayBoundary>
    </div>
  );
}
