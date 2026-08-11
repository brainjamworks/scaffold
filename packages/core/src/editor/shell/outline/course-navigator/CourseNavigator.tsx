import type { EmbeddedNodeId } from "@scaffold/contracts";
import { PlusIcon as Plus } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type {
  SemanticDocumentController,
  SemanticHierarchyViewController,
} from "@/document/authoring/semantic-document";
import type { SemanticItem } from "@/document/model/semantic-document";
import type { SurfaceId } from "@/document/model/course-structure";
import type { OverlayBoundaryResolution } from "@/ui/overlays/portal-host-context";
import { Button } from "@/ui/components/Button/Button";
import { iconSm } from "@/ui/tokens/icon-sizes";

import type {
  DocumentOutlineAuthoringPort,
  DocumentOutlineRowViewport,
} from "../SemanticSubtreeOutline";
import {
  DocumentOutlineSectionDialogs,
  type CourseSectionDialogRequest,
} from "../DocumentOutlineSectionDialogs";
import type { CourseOutlineStructureAuthoringPort } from "../course-outline-structure-authoring";
import {
  CourseOutlineSurfaceDragSession,
  type CourseOutlineSurfaceDragProjection,
} from "../CourseOutlineSurfaceDragSession";
import { deriveCourseOutlineSurfaceDropTargets } from "../course-outline-surface-drop-targets";
import { CourseOverview } from "./CourseOverview";
import { SurfaceStructureView } from "./SurfaceStructureView";
import "./course-navigator.css";

type CourseNavigatorController = Pick<
  SemanticDocumentController,
  "getSnapshot" | "subscribe" | "select"
>;

type CourseNavigatorView =
  | { readonly kind: "overview" }
  | { readonly kind: "surface-structure"; readonly surfaceId: EmbeddedNodeId };

export type CourseNavigatorNavigation =
  | { readonly kind: "overview" }
  | { readonly kind: "surface-structure"; readonly returnToOverview: () => void };

export interface CourseNavigatorSurfaceActionPort {
  openSettings(surfaceId: SurfaceId): boolean;
  duplicateSurface(surfaceId: SurfaceId): boolean;
  deleteSurface(surfaceId: SurfaceId): boolean;
}

export function CourseNavigator({
  authoring,
  controller,
  viewController,
  viewport,
  sectionDialogOverlayBoundary,
  structureAuthoring,
  surfaceActions,
  onNavigationChange,
}: {
  readonly authoring?: DocumentOutlineAuthoringPort;
  readonly controller: CourseNavigatorController;
  readonly viewController: SemanticHierarchyViewController;
  readonly viewport: DocumentOutlineRowViewport;
  readonly sectionDialogOverlayBoundary?: OverlayBoundaryResolution;
  readonly structureAuthoring?: CourseOutlineStructureAuthoringPort;
  readonly surfaceActions?: CourseNavigatorSurfaceActionPort;
  readonly onNavigationChange?: (navigation: CourseNavigatorNavigation) => void;
}) {
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [view, setView] = useState<CourseNavigatorView>({ kind: "overview" });
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<ReadonlySet<EmbeddedNodeId>>(
    () => new Set(),
  );
  const [sectionDialog, setSectionDialog] = useState<CourseSectionDialogRequest>(null);
  const [status, setStatus] = useState("");
  const [surfaceDragProjection, setSurfaceDragProjection] =
    useState<CourseOutlineSurfaceDragProjection | null>(null);
  const surfaceControls = useRef(new Map<string, HTMLButtonElement>());
  const sectionActionControls = useRef(new Map<string, HTMLButtonElement>());
  const dialogReturnControl = useRef<HTMLButtonElement | null>(null);
  const returnSurfaceId = useRef<EmbeddedNodeId | null>(null);
  const drilledSurface =
    view.kind === "surface-structure"
      ? (snapshot.semantics.itemById.get(view.surfaceId) ?? null)
      : null;
  const selectedSurfaceId = findOwningSurfaceId(
    snapshot.selectedId,
    snapshot.semantics.itemById,
    snapshot.semantics.parentById,
  );

  const returnToOverview = useCallback(() => {
    const surfaceId = returnSurfaceId.current;
    setView({ kind: "overview" });
    globalThis.queueMicrotask(() => surfaceControls.current.get(surfaceId ?? "")?.focus());
  }, []);

  useEffect(() => {
    if (view.kind === "surface-structure" && !drilledSurface) {
      setView({ kind: "overview" });
    }
  }, [drilledSurface, view]);

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
  const registerSectionActionControl = (sectionId: string, element: HTMLButtonElement | null) => {
    if (element) sectionActionControls.current.set(sectionId, element);
    else sectionActionControls.current.delete(sectionId);
  };

  const closeSectionDialog = () => {
    setSectionDialog(null);
    const returnControl = dialogReturnControl.current;
    globalThis.queueMicrotask(() => returnControl?.focus());
  };

  const selectSurface = (item: SemanticItem) => {
    void controller.select(item.id, { origin: "document-outline", focusEditor: false });
  };

  const finishStructureAction = (
    result: { readonly ok: true } | { readonly ok: false; readonly message: string },
    successMessage: string,
  ) => setStatus(result.ok ? successMessage : result.message);

  const finishSurfaceAction = (ok: boolean, successMessage: string) => {
    setStatus(ok ? successMessage : "This Surface action is no longer available.");
  };

  const renameSurface = (item: SemanticItem, value: string): boolean => {
    if (!authoring) return false;
    const result = authoring.write(item, value);
    setStatus(result.ok ? "Surface name updated." : result.message);
    return result.ok;
  };

  if (view.kind === "surface-structure" && drilledSurface) {
    return (
      <SurfaceStructureView
        {...(authoring ? { authoring } : {})}
        controller={controller}
        item={drilledSurface}
        viewController={viewController}
        viewport={viewport}
      />
    );
  }

  const addSectionButton = structureAuthoring ? (
    <Button
      aria-label="Add Course Section"
      className="sc-course-navigator-add-section"
      size="sm"
      variant="ghost"
      type="button"
      onClick={(event) => {
        dialogReturnControl.current = event.currentTarget;
        setSectionDialog({ kind: "create" });
      }}
    >
      <Plus aria-hidden size={iconSm} weight="bold" />
      Add
    </Button>
  ) : null;

  const overview = (
    <div className="sc-course-navigator">
      {addSectionButton ? (
        <div
          aria-label="Course overview actions"
          className="sc-course-navigator-overview-actions"
          role="group"
        >
          <span className="sc-course-navigator-overview-label">Sections</span>
          {addSectionButton}
        </div>
      ) : null}
      <CourseOverview
        collapsedSectionIds={collapsedSectionIds}
        roots={snapshot.semantics.roots}
        surfaceDragProjection={surfaceDragProjection}
        selectedId={selectedSurfaceId}
        registerSurfaceControl={registerSurfaceControl}
        onSelectSurface={selectSurface}
        onShowSurfaceStructure={(item) => {
          returnSurfaceId.current = item.id;
          setView({ kind: "surface-structure", surfaceId: item.id });
        }}
        canDragSurface={(item) =>
          Boolean(
            structureAuthoring &&
            deriveCourseOutlineSurfaceDropTargets(snapshot.semantics.roots, item.id).some(
              ({ destination }) => structureAuthoring.canMoveSurface(item.id, destination),
            ),
          )
        }
        movementAvailable={Boolean(structureAuthoring)}
        onSectionExpandedChange={(sectionId, expanded) => {
          setCollapsedSectionIds((current) => {
            const next = new Set(current);
            if (expanded) next.delete(sectionId);
            else next.add(sectionId);
            return next;
          });
        }}
        onRenameSection={(item) => {
          dialogReturnControl.current = sectionActionControls.current.get(item.id) ?? null;
          setSectionDialog({ kind: "rename", item });
        }}
        onDuplicateSection={(item) => {
          if (structureAuthoring) {
            finishStructureAction(
              structureAuthoring.duplicateCourseSection(item.id),
              "Course Section duplicated.",
            );
          }
        }}
        onDeleteSection={(item) => {
          if (!structureAuthoring) return;
          dialogReturnControl.current = sectionActionControls.current.get(item.id) ?? null;
          const surfaces = item.children.filter((child) => child.kind === "surface");
          if (surfaces.length === 0) {
            finishStructureAction(
              structureAuthoring.deleteCourseSection({
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
        onRenameSurface={renameSurface}
        onDuplicateSurface={(item) =>
          finishSurfaceAction(
            Boolean(surfaceActions?.duplicateSurface(item.id)),
            "Surface duplicated.",
          )
        }
        onDeleteSurface={(item) =>
          finishSurfaceAction(Boolean(surfaceActions?.deleteSurface(item.id)), "Surface deleted.")
        }
        onSurfaceSettings={(item) =>
          finishSurfaceAction(
            Boolean(surfaceActions?.openSettings(item.id)),
            "Surface settings opened.",
          )
        }
        registerSectionActionControl={registerSectionActionControl}
      />
      <p
        className="sc-document-outline-status sc-document-outline-status--visually-hidden"
        role="status"
      >
        {status}
      </p>
      {structureAuthoring ? (
        <DocumentOutlineSectionDialogs
          {...(sectionDialogOverlayBoundary
            ? { overlayBoundary: sectionDialogOverlayBoundary }
            : {})}
          port={structureAuthoring}
          request={sectionDialog}
          onClose={closeSectionDialog}
          onResult={finishStructureAction}
        />
      ) : null}
    </div>
  );

  return structureAuthoring ? (
    <CourseOutlineSurfaceDragSession
      port={structureAuthoring}
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
  itemById: ReadonlyMap<EmbeddedNodeId, SemanticItem>,
  parentById: ReadonlyMap<EmbeddedNodeId, EmbeddedNodeId | null>,
): EmbeddedNodeId | null {
  let id = selectedId;
  while (id) {
    if (itemById.get(id)?.kind === "surface") return id;
    id = parentById.get(id) ?? null;
  }
  return null;
}
