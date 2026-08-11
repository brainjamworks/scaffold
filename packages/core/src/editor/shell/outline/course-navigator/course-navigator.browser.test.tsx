import type { EmbeddedNodeId } from "@scaffold/contracts";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { SemanticHierarchyViewController } from "@/document/authoring/semantic-document/semantic-hierarchy-view-controller";
import type { SemanticDocumentControllerSnapshot } from "@/document/authoring/semantic-document/semantic-document-controller";
import type { SemanticNavigationOptions } from "@/document/authoring/semantic-document/semantic-navigation";
import type { SemanticDocumentSnapshot, SemanticItem } from "@/document/model/semantic-document";
import { DocumentOutlineRowViewport } from "../SemanticSubtreeOutline";
import { CourseNavigator } from "./CourseNavigator";

describe("Course Navigator", () => {
  it("moves between the Surface overview and one Surface structure", async () => {
    const heading = item("heading", "rich-text", "Heading");
    const surface = item("surface", "surface", "Introduction", [heading]);
    const section = item("section", "course-section", "Section 1", [surface]);
    const controller = new FakeSemanticDocumentController(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });
    const rendered = await renderBrowserReact(
      <CourseNavigator
        controller={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    try {
      await expect.element(page.getByRole("heading", { name: "Section 1" })).toBeVisible();
      await userEvent.click(page.getByRole("button", { name: "Select Surface Introduction" }));
      expect(controller.selectCalls.at(-1)?.id).toBe(surface.id);
      await userEvent.click(page.getByRole("button", { name: "Show structure for Introduction" }));
      await expect.element(page.getByRole("tree", { name: "Introduction structure" })).toBeVisible();
      await expect.element(page.getByRole("treeitem", { name: "Heading" })).toBeVisible();
      await userEvent.click(page.getByRole("button", { name: "Back to Course overview" }));
      await expect
        .poll(() => document.activeElement?.getAttribute("aria-label"))
        .toBe("Select Surface Introduction");
    } finally {
      await rendered.unmount();
      viewController.destroy();
      viewport.destroy();
    }
  });
});

function id(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0") as EmbeddedNodeId;
}

function item(
  value: string,
  kind: SemanticItem["kind"],
  label: string,
  children: readonly SemanticItem[] = [],
): SemanticItem {
  return {
    id: id(value),
    kind,
    nodeType: kind,
    definitionId: null,
    label,
    summary: null,
    presentation: { actionIds: [], disabledReason: null },
    children,
  };
}

function snapshotFromRoots(roots: readonly SemanticItem[]): SemanticDocumentSnapshot {
  const itemById = new Map<EmbeddedNodeId, SemanticItem>();
  const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>();
  const visit = (entry: SemanticItem, parentId: EmbeddedNodeId | null) => {
    itemById.set(entry.id, entry);
    parentById.set(entry.id, parentId);
    entry.children.forEach((child) => visit(child, entry.id));
  };
  roots.forEach((root) => visit(root, null));
  return {
    revision: 1,
    mode: "slideshow",
    roots,
    itemById,
    parentById,
    locationById: new Map(),
    diagnostics: [],
  };
}

class FakeSemanticDocumentController {
  readonly selectCalls: Array<{ id: EmbeddedNodeId; options: SemanticNavigationOptions }> = [];
  readonly #listeners = new Set<() => void>();
  #snapshot: SemanticDocumentControllerSnapshot;

  constructor(semantics: SemanticDocumentSnapshot) {
    this.#snapshot = { semantics, selectedId: null, selectionOrigin: null };
  }

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async select(itemId: EmbeddedNodeId, options: SemanticNavigationOptions) {
    this.selectCalls.push({ id: itemId, options });
    this.#snapshot = { ...this.#snapshot, selectedId: itemId, selectionOrigin: options.origin };
    for (const listener of this.#listeners) listener();
    return { kind: "reached" as const, id: itemId };
  }
}
