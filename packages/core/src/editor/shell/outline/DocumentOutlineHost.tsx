import { ArrowLeftIcon as ArrowLeft, XIcon as X } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { SemanticHierarchyViewController } from "@/document/authoring/semantic-document/semantic-hierarchy-view-controller";
import { getSemanticDocumentControllerForEditor } from "@/document/authoring/semantic-document/semantic-document-storage";
import { setSemanticLabelChecked } from "@/document/model/commands/semantic-label";
import type { SurfaceId } from "@/document/model/course-structure";
import { readAuthoredSemanticLabel } from "@/document/model/semantic-document/semantic-labels";
import {
  registerAuthoringInteractionHost,
  resolveAuthoringInteractionRoot,
} from "@/editor/interactions/dom/authoring-root";
import { createViewportCoordinateSpace } from "@/editor/interactions/drag/dom/dom-coordinate-space";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { getInteractionFacadeStoreForEditor } from "@/editor/interactions/targets/prosemirror/facade/interaction-facade-storage";
import { InteractionDragEnvironmentProvider } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { createAuthoringNodeTarget } from "@/editor/prosemirror/authoring-target";
import {
  deleteSurface,
  duplicateSurface,
} from "@/editor/surfaces/authoring/commands/surface-document-commands";
import { IconButton } from "@/ui/components/IconButton/IconButton";
import { Button } from "@/ui/components/Button/Button";
import { OverlayBoundary } from "@/ui/overlays/OverlayBoundary";
import { useOverlayBoundary } from "@/ui/overlays/portal-host-context";
import { iconSm } from "@/ui/tokens/icon-sizes";

import {
  DocumentOutline,
  DocumentOutlineRowViewport,
  type DocumentOutlineAuthoringPort,
} from "./DocumentOutline";
import { createCourseOutlineStructureAuthoringPort } from "./course-outline-structure-authoring";
import type {
  DocumentNavigatorNavigation,
  DocumentNavigatorSurfaceActionPort,
} from "./course-navigator/DocumentNavigator";

export interface DocumentOutlineHostProps {
  readonly editor: Editor;
  readonly onClose: () => void;
}

export function DocumentOutlineHost({ editor, onClose }: DocumentOutlineHostProps) {
  const applicationOverlayBoundary = useOverlayBoundary();
  const controller = getSemanticDocumentControllerForEditor(editor);
  const semanticSnapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const authoring = useMemo(() => createDocumentOutlineAuthoringPort(editor), [editor]);
  const structureAuthoring = useMemo(
    () => createCourseOutlineStructureAuthoringPort(editor),
    [editor],
  );
  const surfaceActions = useMemo(() => createDocumentNavigatorSurfaceActionPort(editor), [editor]);
  const viewport = useMemo(() => new DocumentOutlineRowViewport(), []);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [dragRoot, setDragRoot] = useState<HTMLDivElement | null>(null);
  const coordinateSpace = useMemo(
    () =>
      dragRoot
        ? createViewportCoordinateSpace({
            getRoot: () => dragRoot,
            ownerDocument: dragRoot.ownerDocument,
          })
        : null,
    [dragRoot],
  );
  const [viewController, setViewController] = useState<SemanticHierarchyViewController | null>(
    null,
  );
  const [documentNavigatorNavigation, setDocumentNavigatorNavigation] =
    useState<DocumentNavigatorNavigation>({ kind: "overview" });
  const usesDocumentNavigator = semanticSnapshot.semantics.mode === "slideshow";

  useEffect(() => {
    const next = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });
    setViewController(next);

    return () => {
      next.destroy();
      setViewController((current) => (current === next ? null : current));
    };
  }, [controller, viewport]);

  useEffect(() => () => viewport.destroy(), [viewport]);

  useEffect(() => {
    if (!host) return;
    return registerAuthoringInteractionHost(resolveAuthoringInteractionRoot(editor.view.dom), host);
  }, [editor, host]);

  return (
    <aside
      ref={setHost}
      aria-label="Document Outline"
      className="sc-authoring-outline-dock"
      data-testid="authoring-outline-dock"
    >
      <header className="sc-authoring-outline-dock-header">
        {usesDocumentNavigator && documentNavigatorNavigation.kind === "surface-structure" ? (
          <Button
            aria-label="Back to Course overview"
            className="sc-authoring-outline-dock-back"
            size="sm"
            type="button"
            variant="ghost"
            onClick={documentNavigatorNavigation.returnToOverview}
          >
            <ArrowLeft aria-hidden size={iconSm} />
            Course overview
          </Button>
        ) : (
          <h2 className="sc-authoring-outline-dock-title">
            {usesDocumentNavigator ? "Course overview" : "Course Outline"}
          </h2>
        )}
        <IconButton
          aria-label="Close Document Outline"
          size="md"
          type="button"
          variant="ghost"
          onClick={onClose}
        >
          <X aria-hidden size={iconSm} />
        </IconButton>
      </header>
      <div ref={setDragRoot} className="sc-authoring-outline-dock-scroll">
        <OverlayBoundary container={host} collisionBoundary={host} kind="viewport">
          <OutlineDragEnvironment coordinateRoot={dragRoot} coordinateSpace={coordinateSpace}>
            {viewController ? (
              <DocumentOutline
                {...(applicationOverlayBoundary.status === "unscoped"
                  ? {}
                  : { sectionDialogOverlayBoundary: applicationOverlayBoundary })}
                authoring={authoring}
                controller={controller}
                onDocumentNavigatorNavigationChange={setDocumentNavigatorNavigation}
                structureAuthoring={structureAuthoring}
                surfaceActions={surfaceActions}
                viewController={viewController}
                viewport={viewport}
              />
            ) : null}
          </OutlineDragEnvironment>
        </OverlayBoundary>
      </div>
    </aside>
  );
}

export function createDocumentNavigatorSurfaceActionPort(
  editor: Editor,
): DocumentNavigatorSurfaceActionPort {
  return Object.freeze({
    openSettings(surfaceId: SurfaceId) {
      if (editor.isDestroyed) return false;
      return getInteractionFacadeStoreForEditor(editor)
        .getState()
        .commands.openSettings({ kind: InteractionTargetKind.Surface, id: surfaceId });
    },
    duplicateSurface(surfaceId: SurfaceId) {
      return !editor.isDestroyed && duplicateSurface(editor, surfaceId);
    },
    deleteSurface(surfaceId: SurfaceId) {
      return !editor.isDestroyed && deleteSurface(editor, surfaceId);
    },
  });
}

function OutlineDragEnvironment({
  children,
  coordinateRoot,
  coordinateSpace,
}: {
  readonly children: ReactNode;
  readonly coordinateRoot: HTMLDivElement | null;
  readonly coordinateSpace: ReturnType<typeof createViewportCoordinateSpace> | null;
}) {
  const overlayBoundary = useOverlayBoundary();
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    if (overlayBoundary.status !== "ready" || !coordinateRoot || !coordinateSpace) return;
    const frame = requestAnimationFrame(() => setSettled(true));
    return () => cancelAnimationFrame(frame);
  }, [coordinateRoot, coordinateSpace, overlayBoundary]);

  if (!settled) return null;
  return (
    <InteractionDragEnvironmentProvider
      coordinateRoot={coordinateRoot}
      coordinateSpace={coordinateSpace}
    >
      {children}
    </InteractionDragEnvironmentProvider>
  );
}

export function createDocumentOutlineAuthoringPort(editor: Editor): DocumentOutlineAuthoringPort {
  const port: DocumentOutlineAuthoringPort = {
    read(item) {
      if (editor.isDestroyed) {
        return { ok: false, message: "The authoring editor is no longer available." };
      }
      const target = createAuthoringNodeTarget(editor, item);
      const resolved = target.read();
      if (!resolved) {
        return {
          ok: false,
          message:
            target.status === "missing"
              ? "The authoring target no longer exists."
              : "The authoring target identity is invalid.",
        };
      }
      return {
        ok: true,
        value: readAuthoredSemanticLabel(resolved.node.attrs["semanticLabel"]),
      };
    },
    write(item, value) {
      const target = createAuthoringNodeTarget(editor, item);
      const result = target.transact((tr, resolved) =>
        setSemanticLabelChecked({ tr, target: resolved, value }),
      );
      return result.ok ? { ok: true } : { ok: false, message: result.issue.message };
    },
  };
  return Object.freeze(port);
}
