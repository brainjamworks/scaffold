import type { ReactNode } from "react";

import { createAriaElementId } from "@/ui/accessibility/aria-element-id";

export type AccordionVariant = "default" | "borderless";

export interface AccordionOptions {
  allowMultiple: boolean;
  label: string;
  variant: AccordionVariant;
}

export interface AccordionSectionSummary {
  id: string;
  defaultOpen: boolean;
}

interface LayoutNodeLike {
  childCount: number;
  child(index: number): {
    attrs: Record<string, unknown>;
  };
}

export function readAccordionOptions(value: unknown): AccordionOptions {
  const options = readObject(value);
  return {
    allowMultiple: options["allowMultiple"] === true,
    label: parseText(options["label"]) ?? "Accordion",
    variant: options["variant"] === "borderless" ? "borderless" : "default",
  };
}

export function readAccordionSections(
  layoutNode: LayoutNodeLike | null | undefined,
): AccordionSectionSummary[] {
  if (!layoutNode) return [];

  return Array.from({ length: layoutNode.childCount }, (_, index) => {
    const section = layoutNode.child(index);
    const options = readObject(section.attrs["options"]);

    return {
      id: readRequiredAccordionNodeId(section.attrs["id"], "section"),
      defaultOpen: options["defaultOpen"] === true,
    };
  });
}

export function defaultOpenAccordionSectionIds(
  sections: readonly AccordionSectionSummary[],
): string[] {
  return sections.filter((section) => section.defaultOpen).map((section) => section.id);
}

export function accordionOpenSectionIds({
  defaultOpenIds,
  storedOpenIds,
}: {
  defaultOpenIds: readonly string[];
  storedOpenIds: readonly string[] | undefined;
}): readonly string[] {
  return storedOpenIds ?? defaultOpenIds;
}

export function isAccordionSectionOpen({
  defaultOpenIds,
  sectionId,
  storedOpenIds,
}: {
  defaultOpenIds: readonly string[];
  sectionId: string;
  storedOpenIds: readonly string[] | undefined;
}): boolean {
  return accordionOpenSectionIds({ defaultOpenIds, storedOpenIds }).includes(sectionId);
}

export function nextAccordionSectionForKey({
  key,
  sectionId,
  sections,
}: {
  key: string;
  sectionId: string;
  sections: readonly AccordionSectionSummary[];
}): AccordionSectionSummary | null {
  const currentIndex = sections.findIndex((section) => section.id === sectionId);
  if (currentIndex < 0) return null;

  const nextIndexForKey = (() => {
    if (key === "ArrowDown") return currentIndex + 1;
    if (key === "ArrowUp") return currentIndex - 1;
    if (key === "Home") return 0;
    if (key === "End") return sections.length - 1;
    return null;
  })();

  if (nextIndexForKey === null) return null;
  return sections[wrapIndex(nextIndexForKey, sections.length)] ?? null;
}

export function focusAccordionTrigger(layoutId: string, sectionId: string): void {
  window.requestAnimationFrame(() => {
    const next = document.getElementById(accordionTriggerId(layoutId, sectionId));
    if (next instanceof HTMLButtonElement) next.focus();
  });
}

export function accordionTriggerId(layoutId: string, sectionId: string): string {
  return createAriaElementId("accordion-trigger", layoutId, sectionId);
}

export function accordionPanelId(layoutId: string, sectionId: string): string {
  return createAriaElementId("accordion-panel", layoutId, sectionId);
}

export function readRequiredAccordionNodeId(
  value: unknown,
  nodeType: "layout" | "section",
): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  throw new Error(`${nodeType} node is missing a stable id.`);
}

export function AccordionLayoutShell({
  children,
  footer,
  options,
}: {
  children: ReactNode;
  footer?: ReactNode;
  options: AccordionOptions;
}) {
  return (
    <div
      role="group"
      aria-label={options.label}
      data-scaffold-accordion=""
      data-scaffold-accordion-multiple={options.allowMultiple ? "true" : undefined}
      data-variant={options.variant}
      className="sc-accordion"
    >
      {children}
      {footer}
    </div>
  );
}

export function AccordionSectionFrame({
  after,
  before,
  children,
  state,
}: {
  after?: ReactNode;
  before?: ReactNode;
  children: ReactNode;
  state?: "open" | "closed";
}) {
  return (
    <div data-state={state} className="sc-accordion-section__frame">
      {before}
      {children}
      {after}
    </div>
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

function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  return ((index % length) + length) % length;
}
