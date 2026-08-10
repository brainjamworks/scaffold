import type { EmbeddedNodeId } from "@scaffold/contracts";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import type {
  SemanticDocumentController,
  SemanticHierarchyViewController,
} from "@/document/authoring/semantic-document";
import type { SemanticNavigationResult } from "@/document/authoring/semantic-document/semantic-navigation";
import type { SemanticItem } from "@/document/model/semantic-document";
import { iconSm } from "@/ui/tokens/icon-sizes";

import { DocumentOutlineRow } from "./DocumentOutlineRow";
import "./document-outline.css";

type DocumentOutlineController = Pick<
  SemanticDocumentController,
  "getSnapshot" | "subscribe" | "select"
>;

export interface DocumentOutlineProps {
  readonly controller: DocumentOutlineController;
  readonly viewController: SemanticHierarchyViewController;
  readonly viewport: DocumentOutlineRowViewport;
}

interface VisibleOutlineItem {
  readonly item: SemanticItem;
  readonly level: number;
}

export class DocumentOutlineRowViewport {
  readonly #rows = new Map<EmbeddedNodeId, HTMLElement>();

  register(id: EmbeddedNodeId, row: HTMLElement): () => void {
    this.#rows.set(id, row);
    return () => {
      if (this.#rows.get(id) === row) this.#rows.delete(id);
    };
  }

  focus(id: EmbeddedNodeId): void {
    this.#rows.get(id)?.focus();
  }

  reveal(id: EmbeddedNodeId): void {
    this.#rows.get(id)?.scrollIntoView({ block: "nearest" });
  }
}

export function DocumentOutline({ controller, viewController, viewport }: DocumentOutlineProps) {
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
  const visibleItems = useMemo(
    () => flattenVisibleItems(controllerSnapshot.semantics.roots, viewSnapshot.expandedIds),
    [controllerSnapshot.semantics.roots, viewSnapshot.expandedIds],
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
  const [navigationMessage, setNavigationMessage] = useState("");
  const currentFocusedId = focusedId && visibleIds.has(focusedId) ? focusedId : defaultFocusedId;

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
    await viewController.reveal(item.id, {
      select: false,
      focus: false,
      expandAncestors: true,
    });
    const result = await controller.select(item.id, {
      origin: "document-outline",
      focusEditor: false,
    });
    setNavigationMessage(
      navigationResultMessage(result, controller.getSnapshot().semantics.itemById),
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, item: SemanticItem): void {
    const index = visibleItems.findIndex(({ item: visible }) => visible.id === item.id);
    if (index < 0) return;

    let nextId: EmbeddedNodeId | null = null;
    if (event.key === "ArrowDown") nextId = visibleItems[index + 1]?.item.id ?? null;
    else if (event.key === "ArrowUp") nextId = visibleItems[index - 1]?.item.id ?? null;
    else if (event.key === "Home") nextId = visibleItems[0]?.item.id ?? null;
    else if (event.key === "End") nextId = visibleItems.at(-1)?.item.id ?? null;
    else if (event.key === "ArrowRight" && item.children.length > 0) {
      if (!viewSnapshot.expandedIds.has(item.id)) viewController.setExpanded(item.id, true);
      else nextId = item.children[0]?.id ?? null;
    } else if (event.key === "ArrowLeft") {
      if (viewSnapshot.expandedIds.has(item.id)) viewController.setExpanded(item.id, false);
      else nextId = controllerSnapshot.semantics.parentById.get(item.id) ?? null;
    } else if (event.key === "Enter" || event.key === " ") {
      void activate(item);
    } else {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (nextId) focusRow(nextId);
  }

  if (controllerSnapshot.semantics.roots.length === 0) {
    return (
      <div className="sc-document-outline-empty">
        <p>This document has no outline items yet.</p>
      </div>
    );
  }

  return (
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
      <ul aria-label="Document outline" className="sc-document-outline-tree" role="tree">
        {renderItems(controllerSnapshot.semantics.roots, 1)}
      </ul>
      <p className="sc-document-outline-status" role="status">
        {navigationMessage}
      </p>
    </div>
  );

  function renderItems(items: readonly SemanticItem[], level: number): React.ReactNode {
    return items.map((item) => {
      const expanded = viewSnapshot.expandedIds.has(item.id);
      return (
        <li key={item.id} role="none">
          <DocumentOutlineRow
            expanded={expanded}
            focused={item.id === currentFocusedId}
            item={item}
            level={level}
            selected={item.id === viewSnapshot.selectedId}
            viewport={viewport}
            onActivate={(selectedItem) => void activate(selectedItem)}
            onKeyDown={handleKeyDown}
            onToggle={(selectedItem, nextExpanded) =>
              viewController.setExpanded(selectedItem.id, nextExpanded)
            }
          />
          {expanded && item.children.length > 0 ? (
            <ul role="group">{renderItems(item.children, level + 1)}</ul>
          ) : null}
        </li>
      );
    });
  }
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
