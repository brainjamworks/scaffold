import { SemanticSubtreeOutline, type SemanticSubtreeOutlineProps } from "./SemanticSubtreeOutline";
import { useSyncExternalStore } from "react";
import {
  DocumentNavigator,
  type DocumentNavigatorNavigation,
  type DocumentNavigatorSurfaceActionPort,
} from "./course-navigator/DocumentNavigator";
import type { CourseOutlineStructureAuthoringPort } from "./course-outline-structure-authoring";
import type { OverlayBoundaryResolution } from "@/ui/overlays/portal-host-context";

export interface DocumentOutlineProps extends SemanticSubtreeOutlineProps {
  readonly sectionDialogOverlayBoundary?: OverlayBoundaryResolution;
  readonly structureAuthoring?: CourseOutlineStructureAuthoringPort;
  readonly surfaceActions?: DocumentNavigatorSurfaceActionPort;
  readonly onDocumentNavigatorNavigationChange?: (navigation: DocumentNavigatorNavigation) => void;
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
      <DocumentNavigator
        {...(props.onDocumentNavigatorNavigationChange
          ? { onNavigationChange: props.onDocumentNavigatorNavigationChange }
          : {})}
        {...(props.authoring ? { authoring: props.authoring } : {})}
        {...(props.sectionDialogOverlayBoundary
          ? { sectionDialogOverlayBoundary: props.sectionDialogOverlayBoundary }
          : {})}
        {...(props.structureAuthoring ? { structureAuthoring: props.structureAuthoring } : {})}
        {...(props.surfaceActions ? { surfaceActions: props.surfaceActions } : {})}
        controller={props.controller}
        viewController={props.viewController}
        viewport={props.viewport}
      />
    );
  }
  return <SemanticSubtreeOutline {...props} />;
}
