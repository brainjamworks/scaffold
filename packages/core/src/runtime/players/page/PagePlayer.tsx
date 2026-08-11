import type { Editor as TiptapEditor } from "@tiptap/core";
import { useMemo, useState } from "react";

import { createViewportCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { InteractionDragEnvironmentProvider } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { CourseThemePortalBoundary } from "@/theme/course/CourseThemeProvider";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";

import {
  PreparedCourseDocumentRuntimeRenderer,
  type PreparedRuntimeDocument,
} from "../../renderer/CourseDocumentRuntimeRenderer";
import "./PagePlayer.css";

export interface PagePlayerProps {
  artifactId?: string | null;
  preparedDocument: PreparedRuntimeDocument;
  surfaceId: string;
  onRendererReady?: (editor: TiptapEditor) => void;
}

export function PagePlayer({
  artifactId,
  preparedDocument,
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
        collisionBoundary={playerElement}
        hostBoundary={CourseThemePortalBoundary}
        kind="viewport"
      >
        <InteractionDragEnvironmentProvider
          coordinateRoot={playerElement}
          coordinateSpace={coordinateSpace}
        >
          <div className="sc-page-player__content">
            <PreparedCourseDocumentRuntimeRenderer
              artifactId={artifactId ?? null}
              preparedDocument={preparedDocument}
              {...(onRendererReady ? { onReady: onRendererReady } : {})}
            />
          </div>
        </InteractionDragEnvironmentProvider>
      </OverlayBoundary>
    </div>
  );
}
