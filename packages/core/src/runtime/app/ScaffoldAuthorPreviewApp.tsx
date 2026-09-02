import type { ScaffoldLearnerAppProps } from "./ScaffoldLearnerApp";
import { ScaffoldRuntimeApp } from "./ScaffoldRuntimeApp";

/** @internal Authoring-only runtime entry point. */
export function ScaffoldAuthorPreviewApp(props: ScaffoldLearnerAppProps) {
  return <ScaffoldRuntimeApp {...props} surfaceExitPolicy="observe-only" />;
}
