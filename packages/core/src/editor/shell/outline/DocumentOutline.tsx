import type { SemanticDocumentController } from "@/document/authoring/semantic-document";
import type { SemanticSubtreeOutlineProps } from "./SemanticSubtreeOutline";
import {
  DocumentNavigator,
  type DocumentNavigatorNavigation,
  type DocumentNavigatorSurfaceActionPort,
} from "./document-navigator/DocumentNavigator";
import type { CourseOutlineStructureAuthoringPort } from "./course-outline-structure-authoring";
import type { OverlayBoundaryResolution } from "@/ui/overlays/portal-host-context";

export interface DocumentOutlineProps extends SemanticSubtreeOutlineProps {
  readonly controller: SemanticSubtreeOutlineProps["controller"] &
    Pick<SemanticDocumentController, "reportComponentSelection">;
  readonly sectionDialogOverlayBoundary?: OverlayBoundaryResolution;
  readonly structureAuthoring?: CourseOutlineStructureAuthoringPort;
  readonly surfaceActions?: DocumentNavigatorSurfaceActionPort;
  readonly onDocumentNavigatorNavigationChange?: (navigation: DocumentNavigatorNavigation) => void;
}
export type { DocumentOutlineAuthoringPort } from "./SemanticSubtreeOutline";
export { DocumentOutlineRowViewport } from "./SemanticSubtreeOutline";

export function DocumentOutline(props: DocumentOutlineProps) {
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
