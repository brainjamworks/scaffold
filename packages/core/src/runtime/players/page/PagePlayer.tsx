import type { Editor as TiptapEditor, JSONContent } from "@tiptap/core";
import { useState } from "react";

import { OverlayBoundary } from "@/ui/components/OverlayBoundary/OverlayBoundary";

import { CourseDocumentRuntimeRenderer } from "../../renderer/CourseDocumentRuntimeRenderer";
import "./PagePlayer.css";

export interface PagePlayerProps {
  artifactId?: string | null;
  initialContent: JSONContent;
  surfaceId: string;
  onRendererReady?: (editor: TiptapEditor) => void;
}

export function PagePlayer({
  artifactId,
  initialContent,
  surfaceId,
  onRendererReady,
}: PagePlayerProps) {
  const [playerElement, setPlayerElement] = useState<HTMLDivElement | null>(null);
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
      <OverlayBoundary container={playerElement} kind="viewport">
        <div className="sc-page-player__content">
          <CourseDocumentRuntimeRenderer
            artifactId={artifactId ?? null}
            initialContent={initialContent}
            {...(onRendererReady ? { onReady: onRendererReady } : {})}
          />
        </div>
      </OverlayBoundary>
    </div>
  );
}
