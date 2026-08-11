import type { EmbeddedNodeId } from "@scaffold/contracts";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import type {
  SemanticDocumentController,
  SemanticHierarchyViewController,
} from "@/document/authoring/semantic-document";
import type { SemanticNavigationResult } from "@/document/authoring/semantic-document/semantic-navigation";
import type { SemanticDocumentSnapshot, SemanticItem } from "@/document/model/semantic-document";
import { iconSm } from "@/ui/tokens/icon-sizes";
import type { OverlayBoundaryResolution } from "@/ui/overlays/portal-host-context";

import { DocumentOutlineRow } from "./DocumentOutlineRow";
import {
  DocumentOutlineSectionDialogs,
  type CourseSectionDialogRequest,
} from "./DocumentOutlineSectionDialogs";
import type { CourseOutlineStructureAuthoringPort } from "./course-outline-structure-authoring";
import {
  CourseOutlineSurfaceDragSession,
  CourseOutlineSurfaceDropTarget,
} from "./CourseOutlineSurfaceDragSession";
import { deriveCourseOutlineSurfaceDropTargets } from "./course-outline-surface-drop-targets";
import "./document-outline.css";

type SemanticSubtreeOutlineController = Pick<
  SemanticDocumentController,
  "getSnapshot" | "subscribe" | "select"
>;

export interface SemanticSubtreeOutlineProps {
  readonly ariaLabel?: string;
  readonly authoring?: DocumentOutlineAuthoringPort;
  readonly controller: SemanticSubtreeOutlineController;
  readonly selectRoots?: (snapshot: SemanticDocumentSnapshot) => readonly SemanticItem[];
  readonly sectionDialogOverlayBoundary?: OverlayBoundaryResolution;
  readonly structureAuthoring?: CourseOutlineStructureAuthoringPort;
  readonly viewController: SemanticHierarchyViewController;
  readonly viewport: DocumentOutlineRowViewport;
}

export interface DocumentOutlineAuthoringPort {
  read(
    item: Pick<SemanticItem, "id" | "nodeType">,
  ):
    | { readonly ok: true; readonly value: string | null }
    | { readonly ok: false; readonly message: string };
  write(
    item: Pick<SemanticItem, "id" | "nodeType">,
    value: string,
  ): { readonly ok: true } | { readonly ok: false; readonly message: string };
}

interface VisibleOutlineItem {
  readonly item: SemanticItem;
  readonly level: number;
}

export class DocumentOutlineRowViewport {
  readonly #rows = new Map<EmbeddedNodeId, HTMLElement>();
  #pendingReveal: { readonly id: EmbeddedNodeId; readonly resolve: () => void } | null = null;
  #destroyed = false;

  register(id: EmbeddedNodeId, row: HTMLElement): () => void {
    if (this.#destroyed) return () => undefined;
    this.#rows.set(id, row);
    if (this.#pendingReveal?.id === id) {
      row.scrollIntoView({ block: "nearest" });
      const pending = this.#pendingReveal;
      this.#pendingReveal = null;
      pending.resolve();
    }
    return () => {
      if (this.#rows.get(id) === row) this.#rows.delete(id);
    };
  }

  focus(id: EmbeddedNodeId): void {
    this.#rows.get(id)?.focus();
  }

  reveal(id: EmbeddedNodeId): Promise<void> {
    if (this.#destroyed) return Promise.resolve();
    const row = this.#rows.get(id);
    if (row) {
      row.scrollIntoView({ block: "nearest" });
      return Promise.resolve();
    }

    this.#pendingReveal?.resolve();
    return new Promise((resolve) => {
      this.#pendingReveal = { id, resolve };
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#pendingReveal?.resolve();
    this.#pendingReveal = null;
    this.#rows.clear();
  }
}

export function SemanticSubtreeOutline({
  ariaLabel = "Document outline",
  authoring,
  controller,
  selectRoots = selectAllRoots,
  sectionDialogOverlayBoundary,
  structureAuthoring,
  viewController,
  viewport,
}: SemanticSubtreeOutlineProps) {
  const controllerSnapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const viewSnapshot = useSyncExternalStore(
    viewController.subscribe,
    viewController.getSnapshot,
    viewController.getSnapshot,
  );
  const roots = selectRoots(controllerSnapshot.semantics);
  const courseStructureAuthoring =
    controllerSnapshot.semantics.mode === "slideshow" ? structureAuthoring : undefined;
  const initialCourseSectionIds = roots
    .filter((item) => item.kind === "course-section")
    .map((item) => item.id);
  const seenCourseSectionIds = useRef(new Set(initialCourseSectionIds));
  const [autoExpandedIds, setAutoExpandedIds] = useState<ReadonlySet<EmbeddedNodeId>>(
    () => new Set(initialCourseSectionIds),
  );
  const expandedIds = useMemo(
    () => new Set([...viewSnapshot.expandedIds, ...autoExpandedIds]),
    [viewSnapshot.expandedIds, autoExpandedIds],
  );
  const visibleItems = useMemo(
    () => flattenVisibleItems(roots, expandedIds),
    [roots, expandedIds],
  );
  const visibleIds = useMemo(
    () => new Set(visibleItems.map(({ item }) => item.id)),
    [visibleItems],
  );
  const defaultFocusedId =
    (viewSnapshot.selectedId && visibleIds.has(viewSnapshot.selectedId)
      ? viewSnapshot.selectedId
      : visibleItems[0]?.item.id) ?? null;
  const [focusedId, setFocusedId] = useState<EmbeddedNodeId | null>(defaultFocusedId);
  const [editingId, setEditingId] = useState<EmbeddedNodeId | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [navigationMessage, setNavigationMessage] = useState("");
  const [sectionDialog, setSectionDialog] = useState<CourseSectionDialogRequest>(null);
  const actionReturnId = useRef<EmbeddedNodeId | null>(null);
  const currentFocusedId = focusedId && visibleIds.has(focusedId) ? focusedId : defaultFocusedId;

  useEffect(() => {
    const currentIds = new Set(
      roots
        .filter((item) => item.kind === "course-section")
        .map((item) => item.id),
    );
    const newlySeen = [...currentIds].filter((id) => !seenCourseSectionIds.current.has(id));
    seenCourseSectionIds.current = currentIds;
    setAutoExpandedIds((current) => {
      const next = new Set([...current].filter((id) => currentIds.has(id)));
      for (const id of newlySeen) next.add(id);
      return setsEqual(current, next) ? current : next;
    });
  }, [roots]);

  useEffect(() => {
    if (viewSnapshot.selectedId && visibleIds.has(viewSnapshot.selectedId)) {
      setFocusedId(viewSnapshot.selectedId);
    }
  }, [viewSnapshot.selectedId, visibleIds]);

  function focusRow(id: EmbeddedNodeId): void {
    setFocusedId(id);
    viewport.focus(id);
  }

  async function activate(item: SemanticItem): Promise<void> {
    setFocusedId(item.id);
    const result = await controller.select(item.id, {
      origin: "document-outline",
      focusEditor: false,
    });
    setNavigationMessage(
      navigationResultMessage(result, controller.getSnapshot().semantics.itemById),
    );
  }

  function startRename(item: SemanticItem): void {
    if (!authoring) return;
    const result = authoring.read(item);
    if (!result.ok) {
      setNavigationMessage(result.message);
      return;
    }
    setFocusedId(item.id);
    setRenameDraft(result.value ?? item.label);
    setEditingId(item.id);
    setNavigationMessage("");
  }

  function finishRename(item: SemanticItem, commit: boolean): void {
    const result = commit && authoring ? authoring.write(item, renameDraft) : { ok: true as const };
    setEditingId(null);
    setRenameDraft("");
    setNavigationMessage(result.ok ? (commit ? "Outline label updated." : "") : result.message);
    setFocusedId(item.id);
    globalThis.queueMicrotask(() => viewport.focus(item.id));
  }

  function finishStructureAction(
    result: { readonly ok: true } | { readonly ok: false; readonly message: string },
    successMessage: string,
  ): void {
    setNavigationMessage(result.ok ? successMessage : result.message);
  }

  function restoreActionFocus(): void {
    const id = actionReturnId.current;
    setSectionDialog(null);
    if (!id) return;
    setFocusedId(id);
    globalThis.queueMicrotask(() => viewport.focus(id));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, item: SemanticItem): void {
    const index = visibleItems.findIndex(({ item: visible }) => visible.id === item.id);
    if (index < 0) return;

    let nextId: EmbeddedNodeId | null = null;
    if (event.key === "F2" && authoring) startRename(item);
    else if (event.key === "ArrowDown") nextId = visibleItems[index + 1]?.item.id ?? null;
    else if (event.key === "ArrowUp") nextId = visibleItems[index - 1]?.item.id ?? null;
    else if (event.key === "Home") nextId = visibleItems[0]?.item.id ?? null;
    else if (event.key === "End") nextId = visibleItems.at(-1)?.item.id ?? null;
    else if (event.key === "ArrowRight" && item.children.length > 0) {
      if (!expandedIds.has(item.id)) viewController.setExpanded(item.id, true);
      else nextId = item.children[0]?.id ?? null;
    } else if (event.key === "ArrowLeft") {
      if (expandedIds.has(item.id)) {
        setAutoExpandedIds((current) => {
          if (!current.has(item.id)) return current;
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
        viewController.setExpanded(item.id, false);
      } else nextId = controllerSnapshot.semantics.parentById.get(item.id) ?? null;
    } else if (event.key === "Enter" || event.key === " ") {
      void activate(item);
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (nextId) focusRow(nextId);
  }

  if (roots.length === 0) {
    return (
      <div className="sc-document-outline-empty">
        <p>This document has no outline items yet.</p>
      </div>
    );
  }

  const outline = (
    <div className="sc-document-outline-content">
      {controllerSnapshot.semantics.diagnostics.length > 0 ? (
        <div className="sc-document-outline-diagnostic">
          <WarningCircle aria-hidden size={iconSm} />
          <span>
            {controllerSnapshot.semantics.diagnostics.length} outline{" "}
            {controllerSnapshot.semantics.diagnostics.length === 1 ? "item" : "items"} could not be
            included.
          </span>
        </div>
      ) : null}
      {courseStructureAuthoring ? (
        <button
          className="sc-document-outline-add-section"
          type="button"
          onClick={() => {
            actionReturnId.current = currentFocusedId;
            setSectionDialog({ kind: "create" });
          }}
        >
          Add Course Section
        </button>
      ) : null}
      <ul aria-label={ariaLabel} className="sc-document-outline-tree" role="tree">
        {renderItems(roots, 1)}
      </ul>
      <p
        className="sc-document-outline-status sc-document-outline-status--visually-hidden"
        role="status"
      >
        {navigationMessage}
      </p>
      {courseStructureAuthoring ? (
        <DocumentOutlineSectionDialogs
          overlayBoundary={sectionDialogOverlayBoundary}
          port={courseStructureAuthoring}
          request={sectionDialog}
          onClose={restoreActionFocus}
          onResult={finishStructureAction}
        />
      ) : null}
    </div>
  );
  return courseStructureAuthoring ? (
    <CourseOutlineSurfaceDragSession port={courseStructureAuthoring} onResult={finishStructureAction}>
      {outline}
    </CourseOutlineSurfaceDragSession>
  ) : (
    outline
  );

  function renderItems(items: readonly SemanticItem[], level: number): React.ReactNode {
    return items.map((item) => {
      const expanded = expandedIds.has(item.id);
      const sectionDrop = sectionDropFor(item);
      return (
        <li key={item.id} role="none">
          <DocumentOutlineRow
            draft={item.id === editingId ? renameDraft : ""}
            editing={item.id === editingId}
            expanded={expanded}
            focused={item.id === currentFocusedId}
            item={item}
            level={level}
            renameAvailable={Boolean(authoring)}
            rowActions={
              courseStructureAuthoring &&
              item.kind === "course-section"
                ? {
                    item,
                    onEditSectionTitle: (selectedItem) => {
                      actionReturnId.current = selectedItem.id;
                      setSectionDialog({ kind: "rename", item: selectedItem });
                    },
                    onDuplicateSection: (selectedItem) => {
                      actionReturnId.current = selectedItem.id;
                      finishStructureAction(
                        courseStructureAuthoring.duplicateCourseSection(selectedItem.id),
                        "Course Section duplicated.",
                      );
                      globalThis.queueMicrotask(() => viewport.focus(selectedItem.id));
                    },
                    onDeleteSection: (selectedItem) => {
                      actionReturnId.current = selectedItem.id;
                      const surfaces = selectedItem.children.filter(
                        (child) => child.kind === "surface",
                      );
                      if (surfaces.length === 0) {
                        finishStructureAction(
                          courseStructureAuthoring.deleteCourseSection({
                            courseSectionId: selectedItem.id,
                            expectedSurfaceIds: [],
                          }),
                          "Empty Course Section deleted.",
                        );
                        return;
                      }
                      setSectionDialog({
                        kind: "delete",
                        item: selectedItem,
                        surfaceIds: surfaces.map((surface) => surface.id),
                        surfaceLabels: surfaces.map((surface) => surface.label),
                      });
                    },
                  }
                : undefined
            }
            selected={item.id === viewSnapshot.selectedId}
            surfaceDrag={surfaceDragFor(item)}
            viewport={viewport}
            onActivate={(selectedItem) => void activate(selectedItem)}
            onCancelRename={(selectedItem) => finishRename(selectedItem, false)}
            onCommitRename={(selectedItem) => finishRename(selectedItem, true)}
            onDraftChange={setRenameDraft}
            onKeyDown={handleKeyDown}
            onRename={startRename}
            onToggle={(selectedItem, nextExpanded) => {
              if (!nextExpanded) {
                setAutoExpandedIds((current) => {
                  if (!current.has(selectedItem.id)) return current;
                  const next = new Set(current);
                  next.delete(selectedItem.id);
                  return next;
                });
              }
              viewController.setExpanded(selectedItem.id, nextExpanded);
            }}
          />
          {expanded && item.children.length > 0 ? (
            <ul role="group">{renderItems(item.children, level + 1)}</ul>
          ) : null}
          {sectionDrop ? (
            <CourseOutlineSurfaceDropTarget
              destination={sectionDrop.destination}
              label={item.label}
              level={level + 1}
              targetId={`section:${item.id}`}
            />
          ) : null}
        </li>
      );
    });
  }

  function surfaceDragFor(item: SemanticItem) {
    if (!courseStructureAuthoring || item.kind !== "surface") return undefined;
    const targets = deriveCourseOutlineSurfaceDropTargets(
      controllerSnapshot.semantics.roots,
      item.id,
    ).filter(({ destination }) => courseStructureAuthoring.canMoveSurface(item.id, destination));
    return {
      handle: targets.length > 0,
      destinations: [
        { beforeSurfaceId: item.id },
        { afterSurfaceId: item.id },
      ],
    };
  }

  function sectionDropFor(item: SemanticItem) {
    if (!courseStructureAuthoring || item.kind !== "course-section") return undefined;
    return {
      destination: { intoCourseSectionId: item.id, edge: "end" as const },
    };
  }
}

function selectAllRoots(snapshot: SemanticDocumentSnapshot): readonly SemanticItem[] {
  return snapshot.roots;
}

function setsEqual<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function flattenVisibleItems(
  roots: readonly SemanticItem[],
  expandedIds: ReadonlySet<EmbeddedNodeId>,
): readonly VisibleOutlineItem[] {
  const visible: VisibleOutlineItem[] = [];
  const visit = (items: readonly SemanticItem[], level: number) => {
    for (const item of items) {
      visible.push({ item, level });
      if (expandedIds.has(item.id)) visit(item.children, level + 1);
    }
  };
  visit(roots, 1);
  return visible;
}

function navigationResultMessage(
  result: SemanticNavigationResult,
  itemById: ReadonlyMap<EmbeddedNodeId, SemanticItem>,
): string {
  if (result.kind === "missing") return "This item is no longer available.";
  if (result.kind === "interrupted") return "Navigation was interrupted. Try again.";
  if (result.kind === "reached-owner") {
    const ownerLabel = itemById.get(result.ownerId)?.label;
    return ownerLabel
      ? `Opened the nearest available item, ${ownerLabel}.`
      : "Opened the nearest available item.";
  }
  return "";
}
