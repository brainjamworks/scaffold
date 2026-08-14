// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { SemanticHierarchyViewController } from "@/document/authoring/semantic-document/semantic-hierarchy-view-controller";
import type { SemanticDocumentControllerSnapshot } from "@/document/authoring/semantic-document/semantic-document-controller";
import type { SemanticDocumentSnapshot, SemanticItem } from "@/document/model/semantic-document";

import {
  DocumentOutlineRowViewport,
  SemanticSubtreeOutline,
} from "./SemanticSubtreeOutline";

describe("SemanticSubtreeOutline", () => {
  it("renders only roots selected from the shared semantic snapshot", () => {
    const component = item("component", "rich-text", "Heading");
    const selectedSurface = item("surface-1", "surface", "Introduction", [component]);
    const otherSurface = item("surface-2", "surface", "Summary");
    const controller = new FakeSemanticDocumentController(
      snapshotFromRoots([selectedSurface, otherSurface]),
    );
    const viewport = new DocumentOutlineRowViewport();
    const viewController = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });

    render(
      <SemanticSubtreeOutline
        ariaLabel="Introduction structure"
        controller={controller}
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
    presentationContainer: null,
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
    mode: "page",
    roots,
    itemById,
    parentById,
    locationById: new Map(),
    diagnostics: [],
  };
}

class FakeSemanticDocumentController {
  readonly #listeners = new Set<() => void>();
  readonly #snapshot: SemanticDocumentControllerSnapshot;

  constructor(semantics: SemanticDocumentSnapshot) {
    this.#snapshot = { semantics, selectedId: null, selectionOrigin: null };
  }

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async select(itemId: EmbeddedNodeId) {
    return { kind: "reached" as const, id: itemId };
  }
}
