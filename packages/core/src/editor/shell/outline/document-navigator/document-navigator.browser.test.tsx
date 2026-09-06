import type { EmbeddedNodeId } from "@scaffold/contracts";
import { useState, type ComponentProps } from "react";
import { render as renderBrowserReact } from "vitest-browser-react";
import { describe, expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser/context";

import { DocumentTreeViewController } from "@/document/authoring/document-tree/document-tree-view-controller";
import type { EditorSelectionSnapshot } from "@/document/authoring/editor-navigation";
import type { EditorNavigationOptions } from "@/document/authoring/editor-navigation/editor-navigation";
import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";
import { DocumentOutlineRowViewport } from "../DocumentTreeSubtreeOutline";
import { DocumentNavigator, type DocumentNavigatorNavigation } from "./DocumentNavigator";

describe("Document Navigator", () => {
  it("moves between the Surface overview and one Surface structure", async () => {
    const heading = item("heading", "rich-text", "Heading");
    const surface = item("surface", "surface", "Introduction", [heading]);
    const section = item("section", "course-section", "Section 1", [surface]);
    const controller = new FakeDocumentOwners(snapshotFromRoots([section]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });
    const rendered = await renderBrowserReact(
      <DocumentNavigatorHarness
        tree={controller}
        navigation={controller}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    try {
      await expect.element(page.getByRole("heading", { name: "Section 1" })).toBeVisible();
      await userEvent.click(page.getByRole("button", { name: "Select Course Section Section 1" }));
      await expect
        .element(page.getByRole("button", { name: "Select Course Section Section 1" }))
        .toHaveAttribute("aria-pressed", "true");
      expect(controller.showTargetCalls).toEqual([]);
      await userEvent.click(page.getByRole("button", { name: "Select Surface Introduction" }));
      expect(controller.showTargetCalls.at(-1)?.id).toBe(surface.id);
      await userEvent.click(page.getByRole("button", { name: "Show structure for Introduction" }));
      await expect
        .element(page.getByRole("tree", { name: "Introduction structure" }))
        .toBeVisible();
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

function DocumentNavigatorHarness(props: ComponentProps<typeof DocumentNavigator>) {
  const [navigation, setNavigation] = useState<DocumentNavigatorNavigation>({ kind: "overview" });

  return (
    <>
      {navigation.kind === "surface-structure" ? (
        <button
          aria-label="Back to Course overview"
          type="button"
          onClick={navigation.returnToOverview}
        >
          Course overview
        </button>
      ) : null}
      <DocumentNavigator {...props} onNavigationChange={setNavigation} />
    </>
  );
}

function id(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0") as EmbeddedNodeId;
}

function item(
  value: string,
  kind: DocumentTreeItem["kind"],
  label: string,
  children: readonly DocumentTreeItem[] = [],
): DocumentTreeItem {
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

function snapshotFromRoots(roots: readonly DocumentTreeItem[]): DocumentTreeSnapshot {
  const itemById = new Map<EmbeddedNodeId, DocumentTreeItem>();
  const parentById = new Map<EmbeddedNodeId, EmbeddedNodeId | null>();
  const visit = (entry: DocumentTreeItem, parentId: EmbeddedNodeId | null) => {
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

class FakeDocumentOwners {
  readonly showTargetCalls: Array<{ id: EmbeddedNodeId; options: EditorNavigationOptions }> = [];
  readonly #listeners = new Set<() => void>();
  #tree: DocumentTreeSnapshot;
  #selection: EditorSelectionSnapshot;

  constructor(semantics: DocumentTreeSnapshot) {
    this.#tree = semantics;
    this.#selection = { selectedId: null, selectionOrigin: null };
  }

  getSnapshot = () => this.#tree;
  getSelectionSnapshot = () => this.#selection;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  subscribeSelection = this.subscribe;

  reportComponentSelection(itemId: EmbeddedNodeId) {
    this.#selection = { selectedId: itemId, selectionOrigin: "component" };
    for (const listener of this.#listeners) listener();
  }

  async showTarget(itemId: EmbeddedNodeId, options: EditorNavigationOptions) {
    this.showTargetCalls.push({ id: itemId, options });
    this.#selection = { selectedId: itemId, selectionOrigin: options.origin };
    for (const listener of this.#listeners) listener();
    return { kind: "reached" as const, id: itemId };
  }
}
