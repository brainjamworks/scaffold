import { CaretLeftIcon as CaretLeft, CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import type { KeyboardEvent, ReactNode } from "react";

import { createAriaElementId } from "@/ui/accessibility/aria-element-id";
import { iconSm } from "@/ui/tokens/icon-sizes";

interface LayoutNodeLike {
  childCount: number;
  child(index: number): {
    attrs: Record<string, unknown>;
  };
}

export interface PaginatedPageSummary {
  id: string;
  label: string;
  index: number;
}

export function readPaginatedPages(
  layoutNode: LayoutNodeLike | null | undefined,
): PaginatedPageSummary[] {
  if (!layoutNode) return [];

  return Array.from({ length: layoutNode.childCount }, (_, index) => {
    const section = layoutNode.child(index);
    const options = readObject(section.attrs["options"]);
    const id = readRequiredPaginatedNodeId(section.attrs["id"], "section");
    const label =
      parseText(options["label"]) ?? parseText(section.attrs["label"]) ?? `Page ${index + 1}`;

    return { id, index, label };
  });
}

export function normalizeActivePageId(
  activeId: string | undefined,
  pages: readonly PaginatedPageSummary[],
): string | null {
  if (activeId && pages.some((page) => page.id === activeId)) return activeId;
  return pages[0]?.id ?? null;
}

export function activePageIndex(
  activeId: string | null,
  pages: readonly PaginatedPageSummary[],
): number {
  const index = pages.findIndex((page) => page.id === activeId);
  return index < 0 ? 0 : index;
}

export function pageForOffset(
  activeId: string | null,
  pages: readonly PaginatedPageSummary[],
  offset: number,
): PaginatedPageSummary | null {
  if (pages.length === 0) return null;
  const current = activePageIndex(activeId, pages);
  const nextIndex = current + offset;
  if (nextIndex < 0 || nextIndex >= pages.length) return null;
  return pages[nextIndex] ?? null;
}

export function nextPageForKey({
  key,
  pageId,
  pages,
}: {
  key: string;
  pageId: string;
  pages: readonly PaginatedPageSummary[];
}): PaginatedPageSummary | null {
  const currentIndex = pages.findIndex((page) => page.id === pageId);
  if (currentIndex < 0) return null;

  if (key === "ArrowRight") return pages[currentIndex + 1] ?? null;
  if (key === "ArrowLeft") return pages[currentIndex - 1] ?? null;
  if (key === "Home") return pages[0] ?? null;
  if (key === "End") return pages[pages.length - 1] ?? null;
  return null;
}

export function readRequiredPaginatedNodeId(
  value: unknown,
  nodeType: "layout" | "section",
): string {
  if (typeof value === "string" && value.trim().length > 0) return value;
  throw new Error(`${nodeType} node is missing a stable id.`);
}

export function paginatedPageButtonId(layoutId: string, pageId: string): string {
  return createAriaElementId("paginated-page-button", layoutId, pageId);
}

export function paginatedPagePanelId(layoutId: string, pageId: string): string {
  return createAriaElementId("paginated-page-panel", layoutId, pageId);
}

export function paginatedPanelAttributes({
  layoutId,
  pageId,
  isActive,
}: {
  layoutId: string;
  pageId: string;
  isActive: boolean;
}) {
  return {
    role: "region",
    id: paginatedPagePanelId(layoutId, pageId),
    "aria-labelledby": paginatedPageButtonId(layoutId, pageId),
    hidden: !isActive,
    "data-state": isActive ? "active" : "inactive",
  } as const;
}

export function focusPaginatedPageButton(layoutId: string, pageId: string): void {
  window.requestAnimationFrame(() => {
    const next = document.getElementById(paginatedPageButtonId(layoutId, pageId));
    if (next instanceof HTMLButtonElement) next.focus();
  });
}

export function PaginatedLayoutShell({
  activeId,
  children,
  footer,
  layoutId,
  onActivate,
  pages,
}: {
  activeId: string | null;
  children: ReactNode;
  footer?: ReactNode;
  layoutId: string;
  onActivate: (pageId: string) => void;
  pages: readonly PaginatedPageSummary[];
}) {
  const currentIndex = activePageIndex(activeId, pages);
  const previousPage = pageForOffset(activeId, pages, -1);
  const nextPage = pageForOffset(activeId, pages, 1);

  return (
    <>
      <div className="sc-paginated-layout__viewport">{children}</div>
      <nav aria-label="Pages" contentEditable={false} className="sc-paginated-layout__nav">
        <button
          type="button"
          aria-label="Previous page"
          disabled={!previousPage}
          onClick={() => {
            if (previousPage) onActivate(previousPage.id);
          }}
          className="sc-paginated-layout__step"
        >
          <CaretLeft size={iconSm} aria-hidden />
        </button>
        <ol className="sc-paginated-layout__pages">
          {pages.map((page) => (
            <li key={page.id} className="sc-paginated-layout__page-item">
              <PaginatedPageButton
                isActive={page.id === activeId}
                layoutId={layoutId}
                onActivate={() => onActivate(page.id)}
                onKeyDown={(event) => {
                  const next = nextPageForKey({
                    key: event.key,
                    pageId: page.id,
                    pages,
                  });
                  if (!next) return;
                  event.preventDefault();
                  onActivate(next.id);
                  focusPaginatedPageButton(layoutId, next.id);
                }}
                page={page}
              />
            </li>
          ))}
        </ol>
        {footer}
        <button
          type="button"
          aria-label="Next page"
          disabled={!nextPage}
          onClick={() => {
            if (nextPage) onActivate(nextPage.id);
          }}
          className="sc-paginated-layout__step"
        >
          <CaretRight size={iconSm} aria-hidden />
        </button>
        <span className="sc-paginated-layout__count">
          {pages.length > 0 ? currentIndex + 1 : 0}/{pages.length}
        </span>
      </nav>
    </>
  );
}

export function PaginatedPageButton({
  isActive,
  layoutId,
  onActivate,
  onKeyDown,
  page,
}: {
  isActive: boolean;
  layoutId: string;
  onActivate: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  page: PaginatedPageSummary;
}) {
  return (
    <button
      type="button"
      id={paginatedPageButtonId(layoutId, page.id)}
      aria-label={page.label}
      aria-current={isActive ? "page" : undefined}
      aria-controls={paginatedPagePanelId(layoutId, page.id)}
      data-state={isActive ? "active" : "inactive"}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className="sc-paginated-layout__page"
    >
      <span aria-hidden className="sc-paginated-layout__page-label">
        {page.index + 1}
      </span>
    </button>
  );
}

function readObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parseText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
