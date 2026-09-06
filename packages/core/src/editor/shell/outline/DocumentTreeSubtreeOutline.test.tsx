// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { DocumentTreeViewController } from "@/document/authoring/document-tree/document-tree-view-controller";
import type { EditorSelectionSnapshot } from "@/document/authoring/editor-navigation";
import type { DocumentTreeSnapshot, DocumentTreeItem } from "@/document/model/document-tree";

import {
  DocumentOutlineRowViewport,
  DocumentTreeSubtreeOutline,
} from "./DocumentTreeSubtreeOutline";

describe("DocumentTreeSubtreeOutline", () => {
  it("renders only roots selected from the shared semantic snapshot", () => {
    const component = item("component", "rich-text", "Heading");
    const selectedSurface = item("surface-1", "surface", "Introduction", [component]);
    const otherSurface = item("surface-2", "surface", "Summary");
    const controller = new FakeDocumentOwners(snapshotFromRoots([selectedSurface, otherSurface]));
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <DocumentTreeSubtreeOutline
        ariaLabel="Introduction structure"
        tree={controller}
        navigation={controller}
        selectRoots={(snapshot) => snapshot.itemById.get(selectedSurface.id)?.children ?? []}
        viewController={viewController}
        viewport={viewport}
      />,
    );

    expect(screen.getByRole("tree", { name: "Introduction structure" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "Heading" })).toBeInTheDocument();
    expect(screen.queryByRole("treeitem", { name: "Introduction" })).toBeNull();
    expect(screen.queryByRole("treeitem", { name: "Summary" })).toBeNull();
  });
});

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
    presentationContainer: null,
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
    mode: "page",
    roots,
    itemById,
    parentById,
    locationById: new Map(),
    diagnostics: [],
  };
}

class FakeDocumentOwners {
  readonly #listeners = new Set<() => void>();
  readonly #tree: DocumentTreeSnapshot;
  readonly #selection: EditorSelectionSnapshot = { selectedId: null, selectionOrigin: null };

  constructor(semantics: DocumentTreeSnapshot) {
    this.#tree = semantics;
  }

  getSnapshot = () => this.#tree;
  getSelectionSnapshot = () => this.#selection;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  subscribeSelection = this.subscribe;

  async showTarget(itemId: EmbeddedNodeId) {
    return { kind: "reached" as const, id: itemId };
  }
}
