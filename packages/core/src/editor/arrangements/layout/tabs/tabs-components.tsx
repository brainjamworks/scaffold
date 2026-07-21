import type { KeyboardEvent, ReactNode } from "react";

import { createAriaElementId } from "@/ui/accessibility/aria-element-id";

export type TabsVariant = "default" | "pills" | "underline";
export type RenderedTabsVariant = "default" | "pills";

export interface TabsOptions {
  variant: TabsVariant;
  label: string;
}

export interface TabsSectionSummary {
  id: string;
  label: string;
  defaultOpen: boolean;
}

interface LayoutNodeLike {
  childCount: number;
  child(index: number): {
    attrs: Record<string, unknown>;
  };
}

export function readTabsOptions(value: unknown): TabsOptions {
  const options = readObject(value);
  return {
    variant: parseTabsVariant(options["variant"]),
    label: parseText(options["label"]) ?? "Tabs",
  };
}

export function readTabsSections(
  layoutNode: LayoutNodeLike | null | undefined,
): TabsSectionSummary[] {
  if (!layoutNode) return [];

  return Array.from({ length: layoutNode.childCount }, (_, index) => {
    const section = layoutNode.child(index);
    const options = readObject(section.attrs["options"]);
    const id = readRequiredTabsNodeId(section.attrs["id"], "section");
    const label =
      parseText(options["label"]) ?? parseText(section.attrs["label"]) ?? `Tab ${index + 1}`;

    return {
      id,
      label,
      defaultOpen: section.attrs["defaultOpen"] === true,
    };
  });
}

export function normalizeActiveTabId(
  activeId: string | undefined,
  sections: readonly TabsSectionSummary[],
): string | null {
  if (activeId && sections.some((section) => section.id === activeId)) {
    return activeId;
  }
  return sections[0]?.id ?? null;
}

export function renderTabsVariant(variant: TabsVariant): RenderedTabsVariant {
  return variant === "pills" ? "pills" : "default";
}

export function tabsGhostPresentation(variant: TabsVariant): "tab" | "tab-pills" | "tab-underline" {
  if (variant === "pills") return "tab-pills";
  if (variant === "underline") return "tab-underline";
  return "tab";
}

export function tabTriggerId(layoutId: string, sectionId: string): string {
  return createAriaElementId("tabs-trigger", layoutId, sectionId);
}

export function tabPanelId(layoutId: string, sectionId: string): string {
  return createAriaElementId("tabs-panel", layoutId, sectionId);
}

export function readRequiredTabsNodeId(value: unknown, nodeType: "layout" | "section"): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  throw new Error(`${nodeType} node is missing a stable id.`);
}

export function nextTabForKey({
  key,
  sectionId,
  sections,
}: {
  key: string;
  sectionId: string;
  sections: readonly TabsSectionSummary[];
}): TabsSectionSummary | null {
  const currentIndex = sections.findIndex((section) => section.id === sectionId);
  if (currentIndex < 0) return null;

  const nextIndexForKey = (() => {
    if (key === "ArrowRight") return currentIndex + 1;
    if (key === "ArrowLeft") return currentIndex - 1;
    if (key === "Home") return 0;
    if (key === "End") return sections.length - 1;
    return null;
  })();

  if (nextIndexForKey === null) return null;
  return sections[wrapIndex(nextIndexForKey, sections.length)] ?? null;
}

export function focusTabTrigger(layoutId: string, sectionId: string): void {
  window.requestAnimationFrame(() => {
    const next = document.getElementById(tabTriggerId(layoutId, sectionId));
    if (next instanceof HTMLButtonElement) next.focus();
  });
}

export function tabsPanelAttributes({
  layoutId,
  sectionId,
  isActive,
}: {
  layoutId: string;
  sectionId: string;
  isActive: boolean;
}) {
  return {
    role: "tabpanel",
    id: tabPanelId(layoutId, sectionId),
    "aria-labelledby": tabTriggerId(layoutId, sectionId),
    hidden: !isActive,
    "data-state": isActive ? "active" : "inactive",
  } as const;
}

export function TabsList({
  label,
  variant,
  children,
}: {
  label: string;
  variant: RenderedTabsVariant;
  children: ReactNode;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      contentEditable={false}
      data-scaffold-tabs-list=""
      data-variant={variant}
      className="sc-tabs__list"
    >
      {children}
    </div>
  );
}

export function TabsItem({ isActive, children }: { isActive: boolean; children: ReactNode }) {
  return (
    <div
      data-state={isActive ? "active" : "inactive"}
      data-scaffold-tabs-item=""
      className="sc-tabs__item"
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  layoutId,
  section,
  isActive,
  onActivate,
  onKeyDown,
}: {
  layoutId: string;
  section: TabsSectionSummary;
  isActive: boolean;
  onActivate: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      id={tabTriggerId(layoutId, section.id)}
      role="tab"
      aria-selected={isActive}
      aria-controls={tabPanelId(layoutId, section.id)}
      tabIndex={isActive ? 0 : -1}
      data-state={isActive ? "active" : "inactive"}
      data-scaffold-tabs-trigger=""
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className="sc-tabs__trigger"
    >
      <span className="sc-tabs__trigger-label">{section.label}</span>
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

function parseTabsVariant(value: unknown): TabsVariant {
  return value === "pills" || value === "underline" ? value : "default";
}

function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}
