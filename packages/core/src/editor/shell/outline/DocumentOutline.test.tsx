// @vitest-environment jsdom

import type { EmbeddedNodeId } from "@scaffold/contracts";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { SemanticHierarchyViewController } from "@/document/authoring/semantic-document/semantic-hierarchy-view-controller";
import type { SemanticDocumentControllerSnapshot } from "@/document/authoring/semantic-document/semantic-document-controller";
import type {
  SemanticNavigationOptions,
  SemanticNavigationResult,
} from "@/document/authoring/semantic-document/semantic-navigation";
import type { SemanticDocumentSnapshot, SemanticItem } from "@/document/model/semantic-document";

import { DocumentOutline, DocumentOutlineRowViewport } from "./DocumentOutline";

const scrollIntoView = vi.fn();

describe("DocumentOutline", () => {
  beforeEach(() => {
    scrollIntoView.mockClear();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  it("renders nested public items, supplied labels and payload-safe diagnostics", () => {
    const fixture = createFixture();
    fixture.view.setExpanded(id("surface"), true);
    fixture.view.setExpanded(id("region"), true);

    render(<DocumentOutline {...fixture.props} />);

    const tree = screen.getByRole("tree", { name: "Document outline" });
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(5);
    expect(screen.getByRole("treeitem", { name: "Overview" })).toHaveAttribute("aria-level", "1");
    expect(screen.getByRole("treeitem", { name: /Main content/ })).toHaveAttribute(
      "aria-level",
      "2",
    );
    expect(screen.getByRole("treeitem", { name: /Paragraph/ })).toHaveAttribute("aria-level", "3");
    expect(screen.getByText("2 outline items could not be included.")).toBeInTheDocument();
    expect(screen.queryByText("must-not-render")).toBeNull();
  });

  it("supports roving tree focus, expansion and selection from the keyboard", async () => {
    const user = userEvent.setup();
    const fixture = createFixture();
    render(<DocumentOutline {...fixture.props} />);

    const surface = screen.getByRole("treeitem", { name: "Overview" });
    surface.focus();
    await user.keyboard("{ArrowRight}");
    expect(surface).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("treeitem", { name: /Main content/ })).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("treeitem", { name: /Untitled/ })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("treeitem", { name: /Overview 2/ })).toHaveFocus();
    await user.keyboard("{Home}{Enter}");

    expect(fixture.controller.selectCalls.at(-1)).toEqual({
      id: id("surface"),
      options: { origin: "document-outline", focusEditor: false },
    });
  });

  it("reveals an external editor selection without taking editor focus", async () => {
    const fixture = createFixture();

    render(
      <>
        <input aria-label="Editor content" />
        <DocumentOutline {...fixture.props} />
      </>,
    );
    const editorInput = screen.getByRole("textbox", { name: "Editor content" });
    editorInput.focus();

    fixture.controller.replace(fixture.snapshot, id("paragraph"), "editor");

    await waitFor(() => {
      expect(screen.getByRole("treeitem", { name: /Paragraph/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
    expect(editorInput).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
  });

  it("announces unavailable and nearest-owner navigation outcomes", async () => {
    const user = userEvent.setup();
    const fixture = createFixture();
    fixture.view.setExpanded(id("surface"), true);
    fixture.controller.nextResult = { kind: "missing", id: id("region") };
    render(<DocumentOutline {...fixture.props} />);

    await user.click(screen.getByRole("treeitem", { name: /Main content/ }));
    expect(screen.getByRole("status")).toHaveTextContent("This item is no longer available.");

    fixture.controller.nextResult = {
      kind: "reached-owner",
      requestedId: id("region"),
      ownerId: id("surface"),
      reason: "child-unavailable",
    };
    await user.click(screen.getByRole("treeitem", { name: /Main content/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Opened the nearest available item");
  });

  it("shows a clear empty state", () => {
    const controller = new FakeSemanticDocumentController(emptySnapshot());
    const viewport = new DocumentOutlineRowViewport();
    const view = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });

    render(<DocumentOutline controller={controller} viewController={view} viewport={viewport} />);

    expect(screen.getByText("This document has no outline items yet.")).toBeInTheDocument();
  });

  it("consumes only the snapshot/controller seam and never requests editor traversal state", () => {
    const fixture = createFixture();
    const controller = new Proxy(fixture.controller, {
      get(target, property, receiver) {
        if (property === "editor" || property === "state" || property === "doc") {
          throw new Error(`Outline requested forbidden traversal property ${String(property)}`);
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const viewport = new DocumentOutlineRowViewport();
    const view = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport,
    });

    render(<DocumentOutline controller={controller} viewController={view} viewport={viewport} />);

    expect(screen.getByRole("tree", { name: "Document outline" })).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "Overview" })).toBeInTheDocument();
    view.destroy();
  });
});

function createFixture() {
  const paragraph = item("paragraph", "rich-text", "Paragraph", "A useful introduction");
  const untitled = item("untitled", "rich-text", "Untitled", null);
  const region = item("region", "region", "Main content", null, [paragraph]);
  const surface = item("surface", "surface", "Overview", null, [region, untitled]);
  const repeatedSurface = item("surface-2", "surface", "Overview 2", null);
  const snapshot = snapshotFromRoots([surface, repeatedSurface]);
  const unsafeDiagnostics = [
    {
      code: "definition-callback-failed" as const,
      ownerId: id("surface"),
      candidateId: null,
      ownerNodeType: "surface",
      candidateNodeType: null,
      privatePayload: "must-not-render",
    },
    {
      code: "invalid-published-candidate" as const,
      ownerId: id("region"),
      candidateId: id("private"),
      ownerNodeType: "region",
      candidateNodeType: "private_answer",
    },
  ];
  const snapshotWithDiagnostics = { ...snapshot, diagnostics: unsafeDiagnostics };
  const controller = new FakeSemanticDocumentController(snapshotWithDiagnostics);
  const viewport = new DocumentOutlineRowViewport();
  const view = new SemanticHierarchyViewController({
    controller,
    origin: "document-outline",
    viewport,
  });
  return {
    controller,
    snapshot: snapshotWithDiagnostics,
    view,
    props: { controller, viewController: view, viewport },
  };
}

function id(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0") as EmbeddedNodeId;
}

function item(
  value: string,
  kind: SemanticItem["kind"],
  label: string,
  summary: string | null,
  children: readonly SemanticItem[] = [],
): SemanticItem {
  return {
    id: id(value),
    kind,
    nodeType: kind,
    definitionId: null,
    label,
    summary,
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
    mode: "page",
    roots,
    itemById,
    parentById,
    locationById: new Map(),
    diagnostics: [],
  };
}

function emptySnapshot(): SemanticDocumentSnapshot {
  return snapshotFromRoots([]);
}

class FakeSemanticDocumentController {
  readonly selectCalls: Array<{ id: EmbeddedNodeId; options: SemanticNavigationOptions }> = [];
  readonly #listeners = new Set<() => void>();
  nextResult: SemanticNavigationResult | null = null;
  #snapshot: SemanticDocumentControllerSnapshot;

  constructor(semantics: SemanticDocumentSnapshot) {
    this.#snapshot = { semantics, selectedId: null, selectionOrigin: null };
  }

  getSnapshot = () => this.#snapshot;

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async select(
    itemId: EmbeddedNodeId,
    options: SemanticNavigationOptions,
  ): Promise<SemanticNavigationResult> {
    this.selectCalls.push({ id: itemId, options });
    const result = this.nextResult ?? { kind: "reached" as const, id: itemId };
    if (result.kind === "reached") this.replace(this.#snapshot.semantics, itemId, options.origin);
    return result;
  }

  replace(
    semantics: SemanticDocumentSnapshot,
    selectedId: EmbeddedNodeId | null,
    selectionOrigin: SemanticDocumentControllerSnapshot["selectionOrigin"],
  ): void {
    this.#snapshot = { semantics, selectedId, selectionOrigin };
    for (const listener of this.#listeners) listener();
  }
}
