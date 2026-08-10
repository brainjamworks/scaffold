import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { SemanticSelectionOrigin } from "./semantic-selection-origin";
import type { SemanticDocumentController } from "./semantic-document-controller";

export interface SemanticHierarchyViewport {
  reveal(id: EmbeddedNodeId): Promise<void> | void;
}

export interface SemanticHierarchyViewSnapshot {
  readonly expandedIds: ReadonlySet<EmbeddedNodeId>;
  readonly selectedId: EmbeddedNodeId | null;
}

export interface SemanticHierarchyRevealOptions {
  readonly select: boolean;
  readonly focus: boolean;
  readonly expandAncestors: boolean;
}

type HierarchySelectionOrigin = Extract<
  SemanticSelectionOrigin,
  "document-outline" | "presentation-timeline"
>;

type SemanticDocumentControllerPort = Pick<
  SemanticDocumentController,
  "getSnapshot" | "subscribe" | "select"
>;

export interface SemanticHierarchyViewControllerInput {
  readonly controller: SemanticDocumentControllerPort;
  readonly origin: HierarchySelectionOrigin;
  readonly viewport: SemanticHierarchyViewport;
}

export class SemanticHierarchyViewController {
  readonly #controller: SemanticDocumentControllerPort;
  readonly #origin: HierarchySelectionOrigin;
  readonly #viewport: SemanticHierarchyViewport;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: () => void;
  #expandedIds = new Set<EmbeddedNodeId>();
  #snapshot: SemanticHierarchyViewSnapshot;
  #requestToken = 0;
  #destroyed = false;

  constructor({ controller, origin, viewport }: SemanticHierarchyViewControllerInput) {
    this.#controller = controller;
    this.#origin = origin;
    this.#viewport = viewport;
    this.#snapshot = createViewSnapshot([], controller.getSnapshot().selectedId);
    this.#unsubscribe = controller.subscribe(this.#synchronize);

    if (this.#snapshot.selectedId) {
      void this.reveal(this.#snapshot.selectedId, {
        select: true,
        focus: false,
        expandAncestors: true,
      });
    }
  }

  readonly getSnapshot = (): SemanticHierarchyViewSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#destroyed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async reveal(id: EmbeddedNodeId, options: SemanticHierarchyRevealOptions): Promise<void> {
    if (this.#destroyed) return;
    const semantics = this.#controller.getSnapshot().semantics;
    if (!semantics.itemById.has(id)) return;
    const token = ++this.#requestToken;

    if (options.expandAncestors) this.#expandAncestors(id);

    if (options.select && this.#controller.getSnapshot().selectedId !== id) {
      await this.#controller.select(id, {
        origin: this.#origin,
        focusEditor: options.focus,
      });
      if (!this.#isCurrent(token)) return;
    }

    await this.#viewport.reveal(id);
    if (!this.#isCurrent(token)) return;
  }

  setExpanded(id: EmbeddedNodeId, expanded: boolean): void {
    if (this.#destroyed || !this.#controller.getSnapshot().semantics.itemById.has(id)) return;
    if (expanded === this.#expandedIds.has(id)) return;

    const next = new Set(this.#expandedIds);
    if (expanded) next.add(id);
    else next.delete(id);
    this.#replaceExpandedIds(next);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#requestToken += 1;
    this.#unsubscribe();
    this.#listeners.clear();
  }

  readonly #synchronize = (): void => {
    if (this.#destroyed) return;
    const controllerSnapshot = this.#controller.getSnapshot();
    const nextExpandedIds = new Set(
      [...this.#expandedIds].filter((id) => controllerSnapshot.semantics.itemById.has(id)),
    );
    const selectedChanged = controllerSnapshot.selectedId !== this.#snapshot.selectedId;
    const expansionChanged = !sameSet(this.#expandedIds, nextExpandedIds);

    if (selectedChanged || expansionChanged) {
      this.#expandedIds = nextExpandedIds;
      this.#snapshot = createViewSnapshot(nextExpandedIds, controllerSnapshot.selectedId);
      this.#publish();
    }

    if (selectedChanged && controllerSnapshot.selectedId) {
      void this.reveal(controllerSnapshot.selectedId, {
        select: true,
        focus: false,
        expandAncestors: true,
      });
    }
  };

  #expandAncestors(id: EmbeddedNodeId): void {
    const parentById = this.#controller.getSnapshot().semantics.parentById;
    const next = new Set(this.#expandedIds);
    let parentId = parentById.get(id) ?? null;
    while (parentId) {
      next.add(parentId);
      parentId = parentById.get(parentId) ?? null;
    }
    this.#replaceExpandedIds(next);
  }

  #replaceExpandedIds(expandedIds: Set<EmbeddedNodeId>): void {
    if (sameSet(this.#expandedIds, expandedIds)) return;
    this.#expandedIds = expandedIds;
    this.#snapshot = createViewSnapshot(expandedIds, this.#controller.getSnapshot().selectedId);
    this.#publish();
  }

  #publish(): void {
    for (const listener of this.#listeners) listener();
  }

  #isCurrent(token: number): boolean {
    return !this.#destroyed && token === this.#requestToken;
  }
}

function createViewSnapshot(
  expandedIds: Iterable<EmbeddedNodeId>,
  selectedId: EmbeddedNodeId | null,
): SemanticHierarchyViewSnapshot {
  return Object.freeze({
    expandedIds: freezeReadonlySet(expandedIds),
    selectedId,
  });
}

function freezeReadonlySet<Value>(values: Iterable<Value>): ReadonlySet<Value> {
  const source = new Set(values);
  let view: ReadonlySet<Value>;
  view = Object.freeze({
    get size() {
      return source.size;
    },
    has(value: Value) {
      return source.has(value);
    },
    forEach(
      callback: (value: Value, duplicate: Value, set: ReadonlySet<Value>) => void,
      thisArg?: unknown,
    ) {
      source.forEach((value) => callback.call(thisArg, value, value, view));
    },
    entries() {
      return source.entries();
    },
    keys() {
      return source.keys();
    },
    values() {
      return source.values();
    },
    [Symbol.iterator]() {
      return source[Symbol.iterator]();
    },
  });
  return view;
}

function sameSet<Value>(left: ReadonlySet<Value>, right: ReadonlySet<Value>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}
