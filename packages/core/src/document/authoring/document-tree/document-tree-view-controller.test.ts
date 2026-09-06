import type { EmbeddedNodeId } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { DocumentTreeSnapshot } from "@/document/model/document-tree";

import {
  DocumentTreeViewController,
  type DocumentTreeViewport,
} from "./document-tree-view-controller";
import type { EditorSelectionSnapshot } from "../editor-navigation";
import type {
  EditorNavigationOptions,
  EditorNavigationResult,
} from "../editor-navigation/editor-navigation";

describe("DocumentTreeViewController", () => {
  it("keeps expansion local while two views reveal one shared selection", async () => {
    const semantics = documentTreeSnapshot([
      [id("surface"), null],
      [id("region"), id("surface")],
      [id("paragraph"), id("region")],
    ]);
    const controller = new FakeDocumentOwners(semantics);
    const outlineViewport = viewport();
    const timelineViewport = viewport();
    const outline = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport: outlineViewport,
    });
    const timeline = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "presentation-timeline",
      viewport: timelineViewport,
    });

    outline.setExpanded(id("region"), true);
    expect([...outline.getSnapshot().expandedIds]).toEqual([id("region")]);
    expect([...timeline.getSnapshot().expandedIds]).toEqual([]);

    await controller.showTarget(id("paragraph"), { origin: "document-outline" });
    await Promise.resolve();

    expect([...outline.getSnapshot().expandedIds]).toEqual([id("region"), id("surface")]);
    expect([...timeline.getSnapshot().expandedIds]).toEqual([id("region"), id("surface")]);
    expect(outline.getSnapshot().selectedId).toBe(id("paragraph"));
    expect(timeline.getSnapshot().selectedId).toBe(id("paragraph"));
    expect(outlineViewport.reveal).toHaveBeenCalledWith(id("paragraph"));
    expect(timelineViewport.reveal).toHaveBeenCalledWith(id("paragraph"));

    outline.setExpanded(id("region"), false);
    expect([...outline.getSnapshot().expandedIds]).toEqual([id("surface")]);
    expect([...timeline.getSnapshot().expandedIds]).toEqual([id("region"), id("surface")]);

    outline.destroy();
    timeline.destroy();
  });

  it("reconciles expansion and selection when document tree items are deleted", () => {
    const controller = new FakeDocumentOwners(
      documentTreeSnapshot([
        [id("surface"), null],
        [id("region"), id("surface")],
        [id("paragraph"), id("region")],
      ]),
    );
    const view = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport: viewport(),
    });

    view.setExpanded(id("surface"), true);
    view.setExpanded(id("region"), true);
    controller.replace(documentTreeSnapshot([[id("surface"), null]]), id("surface"), "editor");

    expect([...view.getSnapshot().expandedIds]).toEqual([id("surface")]);
    expect(view.getSnapshot().selectedId).toBe(id("surface"));
    view.destroy();
  });

  it("keeps select, focus, expansion and viewport reveal as independent options", async () => {
    const controller = new FakeDocumentOwners(
      documentTreeSnapshot([
        [id("surface"), null],
        [id("paragraph"), id("surface")],
      ]),
    );
    const rowViewport = viewport();
    const view = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport: rowViewport,
    });

    await view.reveal(id("paragraph"), {
      select: false,
      focus: false,
      expandAncestors: false,
    });

    expect(controller.showTargetCalls).toEqual([]);
    expect([...view.getSnapshot().expandedIds]).toEqual([]);
    expect(rowViewport.reveal).toHaveBeenLastCalledWith(id("paragraph"));

    await view.reveal(id("paragraph"), {
      select: true,
      focus: true,
      expandAncestors: true,
    });

    expect(controller.showTargetCalls).toEqual([
      {
        id: id("paragraph"),
        options: { origin: "document-outline", focusEditor: true },
      },
    ]);
    expect([...view.getSnapshot().expandedIds]).toEqual([id("surface")]);
    view.destroy();
  });

  it("does not scroll an older reveal after a newer selection starts", async () => {
    const semantics = documentTreeSnapshot([
      [id("surface"), null],
      [id("first"), id("surface")],
      [id("second"), id("surface")],
    ]);
    const controller = new DeferredDocumentOwners(semantics);
    const rowViewport = viewport();
    const view = new DocumentTreeViewController({
      tree: controller,
      navigation: controller,
      origin: "document-outline",
      viewport: rowViewport,
    });

    const first = view.reveal(id("first"), {
      select: true,
      focus: false,
      expandAncestors: true,
    });
    const second = view.reveal(id("second"), {
      select: true,
      focus: false,
      expandAncestors: true,
    });

    controller.resolve(id("first"));
    await first;
    expect(rowViewport.reveal).not.toHaveBeenCalledWith(id("first"));

    controller.resolve(id("second"));
    await second;
    expect(rowViewport.reveal).toHaveBeenCalledWith(id("second"));
    view.destroy();
  });
});

function id(value: string): EmbeddedNodeId {
  return value.padEnd(12, "0") as EmbeddedNodeId;
}

function documentTreeSnapshot(
  parents: readonly (readonly [EmbeddedNodeId, EmbeddedNodeId | null])[],
): DocumentTreeSnapshot {
  const itemById = new Map(
    parents.map(([itemId]) => [
      itemId,
      {
        id: itemId,
        kind: "exposed-child" as const,
        nodeType: "test",
        definitionId: null,
        label: itemId,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
        children: [],
      },
    ]),
  );
  return {
    revision: 0,
    mode: "page",
    roots: [],
    itemById,
    parentById: new Map(parents),
    locationById: new Map(),
    diagnostics: [],
  };
}

function viewport(): DocumentTreeViewport & { reveal: ReturnType<typeof vi.fn> } {
  return { reveal: vi.fn(async () => undefined) };
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

  async showTarget(
    itemId: EmbeddedNodeId,
    options: EditorNavigationOptions,
  ): Promise<EditorNavigationResult> {
    this.showTargetCalls.push({ id: itemId, options });
    this.replace(this.#tree, itemId, options.origin);
    return { kind: "reached", id: itemId };
  }

  replace(
    semantics: DocumentTreeSnapshot,
    selectedId: EmbeddedNodeId | null,
    selectionOrigin: EditorSelectionSnapshot["selectionOrigin"],
  ): void {
    this.#tree = semantics;
    this.#selection = { selectedId, selectionOrigin };
    for (const listener of this.#listeners) listener();
  }
}

class DeferredDocumentOwners extends FakeDocumentOwners {
  readonly #pending = new Map<
    EmbeddedNodeId,
    { resolve: (result: EditorNavigationResult) => void }
  >();

  override showTarget(
    itemId: EmbeddedNodeId,
    _options: EditorNavigationOptions,
  ): Promise<EditorNavigationResult> {
    return new Promise((resolve) => this.#pending.set(itemId, { resolve }));
  }

  resolve(itemId: EmbeddedNodeId): void {
    this.#pending.get(itemId)?.resolve({ kind: "reached", id: itemId });
    this.#pending.delete(itemId);
  }
}
