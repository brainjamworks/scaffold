import type { ScaffoldLearnerAppProps } from "./ScaffoldLearnerApp";
import type { AuthorPreviewRuntimeMount } from "./ContentRuntimeHost";
import { ScaffoldRuntimeApp } from "./ScaffoldRuntimeApp";
import { createSlideshowRuntimeProgramSource } from "./slideshow-runtime-program-source";

export { createSlideshowRuntimeProgramSource };

export interface ScaffoldAuthorPreviewAppProps extends ScaffoldLearnerAppProps {
  readonly authorPreviewRuntimeMount: AuthorPreviewRuntimeMount;
}

/** @internal Authoring-only runtime entry point. */
export function ScaffoldAuthorPreviewApp({
  authorPreviewRuntimeMount,
  ...props
}: ScaffoldAuthorPreviewAppProps) {
  return (
    <ScaffoldRuntimeApp
      {...props}
      surfaceExitPolicy="observe-only"
      authorPreviewRuntimeMount={authorPreviewRuntimeMount}
    />
  );
}
