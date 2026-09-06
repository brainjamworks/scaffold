import type { EditorNavigationController } from "@/document/authoring/editor-navigation";
import type { DocumentTreeSubtreeOutlineProps } from "./DocumentTreeSubtreeOutline";
import {
  DocumentNavigator,
  type DocumentNavigatorNavigation,
  type DocumentNavigatorSurfaceActionPort,
} from "./document-navigator/DocumentNavigator";
import type { CourseOutlineStructureAuthoringPort } from "./course-outline-structure-authoring";
import type { OverlayBoundaryResolution } from "@/ui/overlays/portal-host-context";

export interface DocumentOutlineProps extends DocumentTreeSubtreeOutlineProps {
  readonly navigation: DocumentTreeSubtreeOutlineProps["navigation"] &
    Pick<EditorNavigationController, "reportComponentSelection">;
  readonly sectionDialogOverlayBoundary?: OverlayBoundaryResolution;
  readonly sectionDialogInteractionOwnerRoot?: Element;
  readonly structureAuthoring?: CourseOutlineStructureAuthoringPort;
  readonly surfaceActions?: DocumentNavigatorSurfaceActionPort;
  readonly onDocumentNavigatorNavigationChange?: (navigation: DocumentNavigatorNavigation) => void;
}
export type { DocumentOutlineAuthoringPort } from "./DocumentTreeSubtreeOutline";
export { DocumentOutlineRowViewport } from "./DocumentTreeSubtreeOutline";

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
      {...(props.sectionDialogInteractionOwnerRoot
        ? { sectionDialogInteractionOwnerRoot: props.sectionDialogInteractionOwnerRoot }
        : {})}
      {...(props.structureAuthoring ? { structureAuthoring: props.structureAuthoring } : {})}
      {...(props.surfaceActions ? { surfaceActions: props.surfaceActions } : {})}
      navigation={props.navigation}
      tree={props.tree}
      viewController={props.viewController}
      viewport={props.viewport}
    />
  );
}
