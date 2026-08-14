import type { EmbeddedNodeId } from "@scaffold/contracts";
import { describe, expect, it, vi } from "vite-plus/test";

import type { SemanticDocumentSnapshot } from "@/document/model/semantic-document";

import {
  SemanticHierarchyViewController,
  type SemanticHierarchyViewport,
} from "./semantic-hierarchy-view-controller";
import type { SemanticDocumentControllerSnapshot } from "./semantic-document-controller";
import type { SemanticNavigationOptions, SemanticNavigationResult } from "./semantic-navigation";

describe("SemanticHierarchyViewController", () => {
  it("keeps expansion local while two views reveal one shared selection", async () => {
    const semantics = semanticSnapshot([
      [id("surface"), null],
      [id("region"), id("surface")],
      [id("paragraph"), id("region")],
    ]);
    const controller = new FakeSemanticDocumentController(semantics);
    const outlineViewport = viewport();
    const timelineViewport = viewport();
    const outline = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport: outlineViewport,
    });
    const timeline = new SemanticHierarchyViewController({
      controller,
      origin: "presentation-timeline",
      viewport: timelineViewport,
    });

    outline.setExpanded(id("region"), true);
    expect([...outline.getSnapshot().expandedIds]).toEqual([id("region")]);
    expect([...timeline.getSnapshot().expandedIds]).toEqual([]);

    await controller.select(id("paragraph"), { origin: "document-outline" });
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

  it("reconciles expansion and selection when semantic items are deleted", () => {
    const controller = new FakeSemanticDocumentController(
      semanticSnapshot([
        [id("surface"), null],
        [id("region"), id("surface")],
        [id("paragraph"), id("region")],
      ]),
    );
    const view = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport: viewport(),
    });

    view.setExpanded(id("surface"), true);
    view.setExpanded(id("region"), true);
    controller.replace(semanticSnapshot([[id("surface"), null]]), id("surface"), "editor");

    expect([...view.getSnapshot().expandedIds]).toEqual([id("surface")]);
    expect(view.getSnapshot().selectedId).toBe(id("surface"));
    view.destroy();
  });

  it("keeps select, focus, expansion and viewport reveal as independent options", async () => {
    const controller = new FakeSemanticDocumentController(
      semanticSnapshot([
        [id("surface"), null],
        [id("paragraph"), id("surface")],
      ]),
    );
    const rowViewport = viewport();
    const view = new SemanticHierarchyViewController({
      controller,
      origin: "document-outline",
      viewport: rowViewport,
    });

    await view.reveal(id("paragraph"), {
      select: false,
      focus: false,
      expandAncestors: false,
    });

    expect(controller.selectCalls).toEqual([]);
    expect([...view.getSnapshot().expandedIds]).toEqual([]);
    expect(rowViewport.reveal).toHaveBeenLastCalledWith(id("paragraph"));

    await view.reveal(id("paragraph"), {
      select: true,
      focus: true,
      expandAncestors: true,
    });

    expect(controller.selectCalls).toEqual([
      {
        id: id("paragraph"),
        options: { origin: "document-outline", focusEditor: true },
      },
    ]);
    expect([...view.getSnapshot().expandedIds]).toEqual([id("surface")]);
    view.destroy();
  });

  it("does not scroll an older reveal after a newer selection starts", async () => {
    const semantics = semanticSnapshot([
      [id("surface"), null],
      [id("first"), id("surface")],
      [id("second"), id("surface")],
    ]);
    const controller = new DeferredSemanticDocumentController(semantics);
    const rowViewport = viewport();
    const view = new SemanticHierarchyViewController({
      controller,
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

function semanticSnapshot(
  parents: readonly (readonly [EmbeddedNodeId, EmbeddedNodeId | null])[],
): SemanticDocumentSnapshot {
  const itemById = new Map(
    parents.map(([itemId]) => [
      itemId,
      {
        id: itemId,
        kind: "published-child" as const,
        nodeType: "test",
        definitionId: null,
        label: itemId,
        summary: null,
        presentation: { actionIds: [], disabledReason: null },
        presentationContainer: null,
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

function viewport(): SemanticHierarchyViewport & { reveal: ReturnType<typeof vi.fn> } {
  return { reveal: vi.fn(async () => undefined) };
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

  async select(
    itemId: EmbeddedNodeId,
    options: SemanticNavigationOptions,
  ): Promise<SemanticNavigationResult> {
    this.selectCalls.push({ id: itemId, options });
    this.replace(this.#snapshot.semantics, itemId, options.origin);
    return { kind: "reached", id: itemId };
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

class DeferredSemanticDocumentController extends FakeSemanticDocumentController {
  readonly #pending = new Map<
    EmbeddedNodeId,
    { resolve: (result: SemanticNavigationResult) => void }
  >();

  override select(
    itemId: EmbeddedNodeId,
    _options: SemanticNavigationOptions,
  ): Promise<SemanticNavigationResult> {
    return new Promise((resolve) => this.#pending.set(itemId, { resolve }));
  }

  resolve(itemId: EmbeddedNodeId): void {
    this.#pending.get(itemId)?.resolve({ kind: "reached", id: itemId });
    this.#pending.delete(itemId);
  }
}
