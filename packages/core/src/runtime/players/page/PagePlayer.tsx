import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { useMemo, useState } from "react";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";
import { createViewportCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { InteractionDragEnvironmentProvider } from "@/editor/interactions/drag/react/interaction-drag-environment";
import type { ResolvedCourseTheme } from "@/theme/model";
import { DEFAULT_RESOLVED_COURSE_THEME } from "@/theme/presentation/CourseThemeScope";

import {
  CourseDocumentRuntimeRenderer,
  type CourseDocumentRuntimeRendererProps,
} from "../../renderer/CourseDocumentRuntimeRenderer";
import "./PagePlayer.css";

export interface PagePlayerProps {
  artifactId?: string | null;
  composition: CourseDocumentRuntimeRendererProps["composition"];
  initialContent: JSONContent;
  resolvedTheme?: ResolvedCourseTheme;
  surfaceId: string;
  onRendererReady?: (editor: TiptapEditor) => void;
}

export function PagePlayer({
  artifactId,
  composition,
  initialContent,
  resolvedTheme,
  surfaceId,
  onRendererReady,
}: PagePlayerProps) {
  const [playerElement, setPlayerElement] = useState<HTMLDivElement | null>(null);
  const coordinateSpace = useMemo(
    () =>
      playerElement
        ? createViewportCoordinateSpace({
            getRoot: () => playerElement,
            ownerDocument: playerElement.ownerDocument,
          })
        : null,
    [playerElement],
  );
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
        collisionBoundary={playerElement}
        kind="viewport"
      >
        <InteractionDragEnvironmentProvider
          coordinateRoot={playerElement}
          coordinateSpace={coordinateSpace}
        >
          <div className="sc-page-player__content">
            <CourseDocumentRuntimeRenderer
              artifactId={artifactId ?? null}
              composition={composition}
              initialContent={initialContent}
              {...(resolvedTheme ? { resolvedTheme } : {})}
              {...(onRendererReady ? { onReady: onRendererReady } : {})}
            />
          </div>
        </InteractionDragEnvironmentProvider>
      </OverlayBoundary>
    </div>
  );
}
