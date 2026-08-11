import { SemanticSubtreeOutline, type SemanticSubtreeOutlineProps } from "./SemanticSubtreeOutline";
import { useSyncExternalStore } from "react";
import {
  CourseNavigator,
  type CourseNavigatorNavigation,
  type CourseNavigatorSurfaceActionPort,
} from "./course-navigator/CourseNavigator";

export interface DocumentOutlineProps extends SemanticSubtreeOutlineProps {
  readonly surfaceActions?: CourseNavigatorSurfaceActionPort;
  readonly onCourseNavigatorNavigationChange?: (navigation: CourseNavigatorNavigation) => void;
}
export type { DocumentOutlineAuthoringPort } from "./SemanticSubtreeOutline";
export { DocumentOutlineRowViewport } from "./SemanticSubtreeOutline";

export function DocumentOutline(props: DocumentOutlineProps) {
  const snapshot = useSyncExternalStore(
    props.controller.subscribe,
    props.controller.getSnapshot,
    props.controller.getSnapshot,
  );
  if (snapshot.semantics.mode === "slideshow") {
    return (
      <CourseNavigator
        {...(props.onCourseNavigatorNavigationChange
          ? { onNavigationChange: props.onCourseNavigatorNavigationChange }
          : {})}
        authoring={props.authoring}
        controller={props.controller}
        sectionDialogOverlayBoundary={props.sectionDialogOverlayBoundary}
        structureAuthoring={props.structureAuthoring}
        surfaceActions={props.surfaceActions}
        viewController={props.viewController}
        viewport={props.viewport}
      />
    );
  }
  return <SemanticSubtreeOutline {...props} />;
}
