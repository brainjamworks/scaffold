import type { EmbeddedNodeId } from "@scaffold/contracts";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type {
  DocumentTreeStore,
  DocumentTreeViewController,
} from "@/document/authoring/document-tree";
import type { EditorNavigationController } from "@/document/authoring/editor-navigation";
import type { DocumentTreeItem } from "@/document/model/document-tree";
import type { SurfaceId } from "@/document/model/course-structure";
import type { OverlayBoundaryResolution } from "@/ui/overlays/portal-host-context";
import { Button } from "@/ui/components/Button/Button";
import { iconSm } from "@/ui/tokens/icon-sizes";

import type {
  DocumentOutlineAuthoringPort,
  DocumentOutlineRowViewport,
} from "../DocumentTreeSubtreeOutline";
import {
  DocumentOutlineSectionDialogs,
  type CourseSectionDialogRequest,
} from "../DocumentOutlineSectionDialogs";
import type { CourseOutlineStructureAuthoringPort } from "../course-outline-structure-authoring";
import { courseOutlineStructureIssueMessage } from "../course-outline-structure-messages";
import {
  CourseOutlineSurfaceDragSession,
  type CourseOutlineSurfaceDragProjection,
} from "../CourseOutlineSurfaceDragSession";
import { deriveCourseOutlineSurfaceDropTargets } from "../course-outline-surface-drop-targets";
import { CourseOverview } from "./CourseOverview";
import { PageOverview } from "./PageOverview";
import { SurfaceStructure } from "./SurfaceStructure";
import "./document-navigator.css";

type DocumentNavigatorTree = Pick<DocumentTreeStore, "getSnapshot" | "subscribe">;
type DocumentNavigatorNavigationController = Pick<
  EditorNavigationController,
  "getSelectionSnapshot" | "reportComponentSelection" | "showTarget" | "subscribeSelection"
>;

type DocumentNavigatorView =
  | { readonly kind: "overview" }
  | { readonly kind: "surface-structure"; readonly surfaceId: EmbeddedNodeId };

export type DocumentNavigatorNavigation =
  | { readonly kind: "overview" }
  | { readonly kind: "surface-structure"; readonly returnToOverview: () => void };

export interface DocumentNavigatorSurfaceActionPort {
  openSettings(surfaceId: SurfaceId): boolean;
  duplicateSurface?(surfaceId: SurfaceId): boolean;
  deleteSurface?(surfaceId: SurfaceId): boolean;
}

export function DocumentNavigator({
  authoring,
  tree,
  navigation,
  viewController,
  viewport,
  sectionDialogOverlayBoundary,
  sectionDialogInteractionOwnerRoot,
  structureAuthoring,
  surfaceActions,
  onNavigationChange,
}: {
  readonly authoring?: DocumentOutlineAuthoringPort;
  readonly tree: DocumentNavigatorTree;
  readonly navigation: DocumentNavigatorNavigationController;
  readonly viewController: DocumentTreeViewController;
  readonly viewport: DocumentOutlineRowViewport;
  readonly sectionDialogOverlayBoundary?: OverlayBoundaryResolution;
  readonly sectionDialogInteractionOwnerRoot?: Element;
  readonly structureAuthoring?: CourseOutlineStructureAuthoringPort;
  readonly surfaceActions?: DocumentNavigatorSurfaceActionPort;
  readonly onNavigationChange?: (navigation: DocumentNavigatorNavigation) => void;
}) {
  const treeSnapshot = useSyncExternalStore(tree.subscribe, tree.getSnapshot, tree.getSnapshot);
  const selectionSnapshot = useSyncExternalStore(
    navigation.subscribeSelection,
    navigation.getSelectionSnapshot,
    navigation.getSelectionSnapshot,
  );
  const hierarchySnapshot = useSyncExternalStore(
    viewController.subscribe,
    viewController.getSnapshot,
    viewController.getSnapshot,
  );
  const isSlideshow = treeSnapshot.mode === "slideshow";
  const courseStructureAuthoring = isSlideshow ? structureAuthoring : undefined;
  const [view, setView] = useState<DocumentNavigatorView>({ kind: "overview" });
  const [sectionDialog, setSectionDialog] = useState<CourseSectionDialogRequest>(null);
  const [status, setStatus] = useState("");
  const [surfaceDragProjection, setSurfaceDragProjection] =
    useState<CourseOutlineSurfaceDragProjection | null>(null);
  const surfaceControls = useRef(new Map<string, HTMLButtonElement>());
  const sectionControlCleanups = useRef(new Map<string, () => void>());
  const sectionActionControls = useRef(new Map<string, HTMLButtonElement>());
  const seenCourseSectionIds = useRef(new Set<EmbeddedNodeId>());
  const locallySelectedSectionId = useRef<EmbeddedNodeId | null>(null);
  const dialogReturnControl = useRef<HTMLButtonElement | null>(null);
  const returnSurfaceId = useRef<EmbeddedNodeId | null>(null);
  const drilledSurface =
    view.kind === "surface-structure" ? (treeSnapshot.itemById.get(view.surfaceId) ?? null) : null;
  const selectedSurfaceId = findOwningSurfaceId(
    selectionSnapshot.selectedId,
    treeSnapshot.itemById,
    treeSnapshot.parentById,
  );
  const externallySelectedItem =
    (selectionSnapshot.selectionOrigin === "editor" ||
      selectionSnapshot.selectionOrigin === "component") &&
    selectionSnapshot.selectedId
      ? (treeSnapshot.itemById.get(selectionSnapshot.selectedId) ?? null)
      : null;
  const externallySelectedDescendantId =
    externallySelectedItem && selectedSurfaceId && externallySelectedItem.id !== selectedSurfaceId
      ? externallySelectedItem.id
      : null;
  const externallySelectedOverviewId =
    externallySelectedItem?.kind === "surface" || externallySelectedItem?.kind === "course-section"
      ? externallySelectedItem.id
      : null;
  const externallySelectedCourseSectionId =
    externallySelectedItem?.kind === "course-section" ? externallySelectedItem.id : null;
  const externalSelectionRouteKey = externallySelectedItem
    ? `${selectionSnapshot.selectionOrigin}:${externallySelectedItem.id}:${selectedSurfaceId ?? ""}`
    : null;
  const handledExternalSelectionRouteKey = useRef(externalSelectionRouteKey);

  const returnToOverview = useCallback(() => {
    const surfaceId = returnSurfaceId.current;
    setView({ kind: "overview" });
    globalThis.queueMicrotask(() => surfaceControls.current.get(surfaceId ?? "")?.focus());
  }, []);

  useLayoutEffect(() => {
    const currentIds = new Set(
      treeSnapshot.roots.filter((item) => item.kind === "course-section").map((item) => item.id),
    );
    for (const sectionId of currentIds) {
      if (!seenCourseSectionIds.current.has(sectionId)) {
        viewController.setExpanded(sectionId, true);
      }
    }
    seenCourseSectionIds.current = currentIds;
  }, [treeSnapshot.roots, viewController]);

  useEffect(() => {
    if (view.kind === "surface-structure" && !drilledSurface) {
      setView({ kind: "overview" });
    }
  }, [drilledSurface, view]);

  useEffect(() => {
    if (handledExternalSelectionRouteKey.current === externalSelectionRouteKey) return;
    handledExternalSelectionRouteKey.current = externalSelectionRouteKey;

    if (externallySelectedDescendantId && selectedSurfaceId) {
      returnSurfaceId.current = selectedSurfaceId;
      setView((current) =>
        current.kind === "surface-structure" && current.surfaceId === selectedSurfaceId
          ? current
          : { kind: "surface-structure", surfaceId: selectedSurfaceId },
      );
    } else if (externallySelectedOverviewId) {
      setView((current) => (current.kind === "overview" ? current : { kind: "overview" }));
      if (externallySelectedCourseSectionId) {
        const selectedLocally =
          locallySelectedSectionId.current === externallySelectedCourseSectionId;
        locallySelectedSectionId.current = null;
        if (!selectedLocally) viewController.setExpanded(externallySelectedCourseSectionId, true);
      }
    }
  }, [
    externalSelectionRouteKey,
    externallySelectedDescendantId,
    externallySelectedCourseSectionId,
    externallySelectedOverviewId,
    selectedSurfaceId,
    viewController,
  ]);

  useEffect(() => {
    onNavigationChange?.(
      view.kind === "surface-structure" && drilledSurface
        ? { kind: "surface-structure", returnToOverview }
        : { kind: "overview" },
    );
  }, [drilledSurface, onNavigationChange, returnToOverview, view.kind]);

  const registerSurfaceControl = (surfaceId: string, element: HTMLButtonElement | null) => {
    if (element) surfaceControls.current.set(surfaceId, element);
    else surfaceControls.current.delete(surfaceId);
  };
  const registerSectionControl = useCallback(
    (sectionId: EmbeddedNodeId, element: HTMLButtonElement | null) => {
      sectionControlCleanups.current.get(sectionId)?.();
      sectionControlCleanups.current.delete(sectionId);
      if (element) {
        sectionControlCleanups.current.set(sectionId, viewport.register(sectionId, element));
      }
    },
    [viewport],
  );
  const registerSectionActionControl = (sectionId: string, element: HTMLButtonElement | null) => {
    if (element) sectionActionControls.current.set(sectionId, element);
    else sectionActionControls.current.delete(sectionId);
  };

  const closeSectionDialog = () => {
    setSectionDialog(null);
    const returnControl = dialogReturnControl.current;
    globalThis.queueMicrotask(() => returnControl?.focus());
  };

  const selectSurface = (item: DocumentTreeItem) => {
    void navigation.showTarget(item.id, { origin: "document-outline", focusEditor: false });
  };

  const selectSection = (item: DocumentTreeItem) => {
    locallySelectedSectionId.current = item.id;
    navigation.reportComponentSelection(item.id);
  };

  const finishStructureAction = (
    result: ReturnType<CourseOutlineStructureAuthoringPort["createCourseSection"]>,
    successMessage: string,
  ) =>
    setStatus(
      result.match({
        ok: () => successMessage,
        err: courseOutlineStructureIssueMessage,
      }),
    );

  const finishSurfaceAction = (ok: boolean, successMessage: string) => {
    setStatus(ok ? successMessage : "This Surface action is no longer available.");
  };

  const renameSurface = (item: DocumentTreeItem, value: string): boolean => {
    if (!authoring) return false;
    const result = authoring.write(item, value);
    setStatus(result.ok ? "Surface name updated." : result.message);
    return result.ok;
  };

  const showSurfaceStructure = (item: DocumentTreeItem) => {
    returnSurfaceId.current = item.id;
    setView({ kind: "surface-structure", surfaceId: item.id });
  };

  const surfaceSettings = surfaceActions
    ? (item: DocumentTreeItem) =>
        finishSurfaceAction(surfaceActions.openSettings(item.id), "Surface settings opened.")
    : undefined;
  const duplicateSurface =
    isSlideshow && surfaceActions?.duplicateSurface
      ? (item: DocumentTreeItem) =>
          finishSurfaceAction(
            surfaceActions.duplicateSurface?.(item.id) ?? false,
            "Surface duplicated.",
          )
      : undefined;
  const deleteSurfaceAction =
    isSlideshow && surfaceActions?.deleteSurface
      ? (item: DocumentTreeItem) =>
          finishSurfaceAction(surfaceActions.deleteSurface?.(item.id) ?? false, "Surface deleted.")
      : undefined;

  if (view.kind === "surface-structure" && drilledSurface) {
    return (
      <SurfaceStructure
        {...(authoring ? { authoring } : {})}
        item={drilledSurface}
        navigation={navigation}
        tree={tree}
        viewController={viewController}
        viewport={viewport}
      />
    );
  }

  const addSectionButton = courseStructureAuthoring ? (
    <Button
      aria-label="Add Course Section"
      className="sc-document-navigator-add-section"
      size="sm"
      variant="ghost"
      type="button"
      onClick={() =>
        finishStructureAction(
          courseStructureAuthoring.createCourseSection(),
          "Course Section added.",
        )
      }
    >
      <Plus aria-hidden size={iconSm} weight="bold" />
      Add
    </Button>
  ) : null;

  const overview = (
    <div className="sc-document-navigator">
      {addSectionButton ? (
        <div
          aria-label="Course overview actions"
          className="sc-document-navigator-overview-actions"
          role="group"
        >
          <span className="sc-document-navigator-overview-label">Sections</span>
          {addSectionButton}
        </div>
      ) : null}
      {isSlideshow ? (
        <CourseOverview
          expandedSectionIds={hierarchySnapshot.expandedIds}
          roots={treeSnapshot.roots}
          surfaceDragProjection={surfaceDragProjection}
          selectedId={selectionSnapshot.selectedId}
          selectedSurfaceId={selectedSurfaceId}
          registerSectionControl={registerSectionControl}
          registerSurfaceControl={registerSurfaceControl}
          onSelectSection={selectSection}
          onSelectSurface={selectSurface}
          onShowSurfaceStructure={showSurfaceStructure}
          canDragSurface={(item) =>
            Boolean(
              courseStructureAuthoring &&
              deriveCourseOutlineSurfaceDropTargets(treeSnapshot.roots, item.id).some(
                ({ destination }) => courseStructureAuthoring.canMoveSurface(item.id, destination),
              ),
            )
          }
          movementAvailable={Boolean(courseStructureAuthoring)}
          onSectionExpandedChange={(sectionId, expanded) =>
            viewController.setExpanded(sectionId, expanded)
          }
          onRenameSection={(item) => {
            dialogReturnControl.current = sectionActionControls.current.get(item.id) ?? null;
            setSectionDialog({ kind: "rename", item });
          }}
          onDuplicateSection={(item) => {
            if (courseStructureAuthoring) {
              finishStructureAction(
                courseStructureAuthoring.duplicateCourseSection(item.id),
                "Course Section duplicated.",
              );
            }
          }}
          onDeleteSection={(item) => {
            if (!courseStructureAuthoring) return;
            dialogReturnControl.current = sectionActionControls.current.get(item.id) ?? null;
            const surfaces = item.children.filter((child) => child.kind === "surface");
            if (surfaces.length === 0) {
              finishStructureAction(
                courseStructureAuthoring.deleteCourseSection({
                  courseSectionId: item.id,
                  expectedSurfaceIds: [],
                }),
                "Empty Course Section deleted.",
              );
              return;
            }
            setSectionDialog({
              kind: "delete",
              item,
              surfaceIds: surfaces.map((surface) => surface.id),
              surfaceLabels: surfaces.map((surface) => surface.label),
            });
          }}
          {...(authoring ? { onRenameSurface: renameSurface } : {})}
          {...(duplicateSurface ? { onDuplicateSurface: duplicateSurface } : {})}
          {...(deleteSurfaceAction ? { onDeleteSurface: deleteSurfaceAction } : {})}
          {...(surfaceSettings ? { onSurfaceSettings: surfaceSettings } : {})}
          registerSectionActionControl={registerSectionActionControl}
        />
      ) : (
        <PageOverview
          roots={treeSnapshot.roots}
          selectedSurfaceId={selectedSurfaceId}
          registerSurfaceControl={registerSurfaceControl}
          onSelectSurface={selectSurface}
          onShowSurfaceStructure={showSurfaceStructure}
          {...(authoring ? { onRenameSurface: renameSurface } : {})}
          {...(surfaceSettings ? { onSurfaceSettings: surfaceSettings } : {})}
        />
      )}
      <p
        className="sc-document-outline-status sc-document-outline-status--visually-hidden"
        role="status"
      >
        {status}
      </p>
      {courseStructureAuthoring ? (
        <DocumentOutlineSectionDialogs
          {...(sectionDialogInteractionOwnerRoot
            ? { interactionOwnerRoot: sectionDialogInteractionOwnerRoot }
            : {})}
          {...(sectionDialogOverlayBoundary
            ? { overlayBoundary: sectionDialogOverlayBoundary }
            : {})}
          port={courseStructureAuthoring}
          request={sectionDialog}
          onClose={closeSectionDialog}
          onDeleteScopeChange={(surfaceIds) =>
            setSectionDialog((current) =>
              current?.kind === "delete"
                ? {
                    ...current,
                    surfaceIds,
                    surfaceLabels: surfaceIds.map(
                      (surfaceId) =>
                        treeSnapshot.itemById.get(surfaceId)?.label ?? "Unavailable Surface",
                    ),
                  }
                : current,
            )
          }
          onResult={finishStructureAction}
        />
      ) : null}
    </div>
  );

  return courseStructureAuthoring ? (
    <CourseOutlineSurfaceDragSession
      port={courseStructureAuthoring}
      onProjectionChange={setSurfaceDragProjection}
      onResult={finishStructureAction}
    >
      {overview}
    </CourseOutlineSurfaceDragSession>
  ) : (
    overview
  );
}

function findOwningSurfaceId(
  selectedId: EmbeddedNodeId | null,
  itemById: ReadonlyMap<EmbeddedNodeId, DocumentTreeItem>,
  parentById: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId | null>,
): EmbeddedNodeId | null {
  let id = selectedId;
  while (id) {
    if (itemById.get(id)?.kind === "surface") return id;
    id = parentById.get(id) ?? null;
  }
  return null;
}
