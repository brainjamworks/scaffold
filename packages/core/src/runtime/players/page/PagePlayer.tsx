import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { useMemo, useState } from "react";

import { createViewportCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { InteractionDragEnvironmentProvider } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { CourseThemePortalBoundary } from "@/theme/course/CourseThemeProvider";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";

import {
  CourseDocumentRuntimeRenderer,
  type CourseDocumentRuntimeRendererProps,
} from "../../renderer/CourseDocumentRuntimeRenderer";
import "./PagePlayer.css";

export interface PagePlayerProps {
  artifactId?: string | null;
  composition: CourseDocumentRuntimeRendererProps["composition"];
  initialContent: JSONContent;
  surfaceId: string;
  onRendererReady?: (editor: TiptapEditor) => void;
}

export function PagePlayer({
  artifactId,
  composition,
  initialContent,
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
            <CourseDocumentRuntimeRenderer
              artifactId={artifactId ?? null}
              composition={composition}
              initialContent={initialContent}
              {...(onRendererReady ? { onReady: onRendererReady } : {})}
            />
          </div>
        </InteractionDragEnvironmentProvider>
      </OverlayBoundary>
    </div>
  );
}
