import type { ScaffoldLearnerAppProps } from "./ScaffoldLearnerApp";
import { useMemo } from "react";
import type { AuthorPreviewRuntimeMount, PresentationRuntimePreview } from "./ContentRuntimeHost";
import { ScaffoldRuntimeApp } from "./ScaffoldRuntimeApp";
import { createSlideshowRuntimeProgramSource } from "./slideshow-runtime-program-source";

export { createSlideshowRuntimeProgramSource };

export interface ScaffoldAuthorPreviewAppProps extends ScaffoldLearnerAppProps {
  readonly authorPreviewRuntimeMount?: AuthorPreviewRuntimeMount;
  readonly presentationPreview?: PresentationRuntimePreview;
}

/** @internal Authoring-only runtime entry point. */
export function ScaffoldAuthorPreviewApp({
  authorPreviewRuntimeMount,
  presentationPreview,
  ...props
}: ScaffoldAuthorPreviewAppProps) {
  const legacyPresentationMount = useMemo<AuthorPreviewRuntimeMount | undefined>(
    () =>
      presentationPreview
        ? {
            initialSurfaceId: presentationPreview.activeSurfaceId,
            programSource: createSlideshowRuntimeProgramSource({
              presentation: presentationPreview.program,
            }),
            onPresentationPlaybackPortChange: presentationPreview.onPortChange,
          }
        : undefined,
    [presentationPreview],
  );
  const runtimeMount = authorPreviewRuntimeMount ?? legacyPresentationMount;
  return (
    <ScaffoldRuntimeApp
      {...props}
      surfaceExitPolicy="observe-only"
      {...(runtimeMount ? { authorPreviewRuntimeMount: runtimeMount } : {})}
    />
  );
}
