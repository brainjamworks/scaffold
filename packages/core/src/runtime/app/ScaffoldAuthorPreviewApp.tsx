import type { ScaffoldLearnerAppProps } from "./ScaffoldLearnerApp";
import type { PresentationRuntimePreview } from "./ContentRuntimeHost";
import { ScaffoldRuntimeApp } from "./ScaffoldRuntimeApp";

export interface ScaffoldAuthorPreviewAppProps extends ScaffoldLearnerAppProps {
  readonly presentationPreview?: PresentationRuntimePreview;
}

/** @internal Authoring-only runtime entry point. */
export function ScaffoldAuthorPreviewApp(props: ScaffoldAuthorPreviewAppProps) {
  return <ScaffoldRuntimeApp {...props} surfaceExitPolicy="observe-only" />;
}
