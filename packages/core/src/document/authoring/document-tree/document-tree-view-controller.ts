import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { EditorNavigationController, EditorSelectionOrigin } from "../editor-navigation";
import type { DocumentTreeStore } from "./document-tree-store";

export interface DocumentTreeViewport {
  reveal(id: EmbeddedNodeId): Promise<void> | void;
}

export interface DocumentTreeViewSnapshot {
  readonly expandedIds: ReadonlySet<EmbeddedNodeId>;
  readonly selectedId: EmbeddedNodeId | null;
}

export interface DocumentTreeRevealOptions {
  readonly select: boolean;
  readonly focus: boolean;
  readonly expandAncestors: boolean;
}

type HierarchySelectionOrigin = Extract<
  EditorSelectionOrigin,
  "document-outline" | "presentation-timeline"
>;

type DocumentTreeStorePort = Pick<DocumentTreeStore, "getSnapshot" | "subscribe">;
type EditorNavigationPort = Pick<
  EditorNavigationController,
  "getSelectionSnapshot" | "subscribeSelection" | "showTarget"
>;

export interface DocumentTreeViewControllerInput {
  readonly tree: DocumentTreeStorePort;
  readonly navigation: EditorNavigationPort;
  readonly origin: HierarchySelectionOrigin;
  readonly viewport: DocumentTreeViewport;
}

export class DocumentTreeViewController {
  readonly #tree: DocumentTreeStorePort;
  readonly #navigation: EditorNavigationPort;
  readonly #origin: HierarchySelectionOrigin;
  readonly #viewport: DocumentTreeViewport;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribeTree: () => void;
  readonly #unsubscribeSelection: () => void;
  #expandedIds = new Set<EmbeddedNodeId>();
  #snapshot: DocumentTreeViewSnapshot;
  #requestToken = 0;
  #destroyed = false;

  constructor({ tree, navigation, origin, viewport }: DocumentTreeViewControllerInput) {
    this.#tree = tree;
    this.#navigation = navigation;
    this.#origin = origin;
    this.#viewport = viewport;
    this.#snapshot = createViewSnapshot([], navigation.getSelectionSnapshot().selectedId);
    this.#unsubscribeTree = tree.subscribe(this.#synchronize);
    this.#unsubscribeSelection = navigation.subscribeSelection(this.#synchronize);

    if (this.#snapshot.selectedId) {
      void this.reveal(this.#snapshot.selectedId, {
        select: true,
        focus: false,
        expandAncestors: true,
      });
    }
  }

  readonly getSnapshot = (): DocumentTreeViewSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#destroyed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async reveal(id: EmbeddedNodeId, options: DocumentTreeRevealOptions): Promise<void> {
    if (this.#destroyed) return;
    const tree = this.#tree.getSnapshot();
    if (!tree.itemById.has(id)) return;
    const token = ++this.#requestToken;

    if (options.expandAncestors) this.#expandAncestors(id);

    if (options.select && this.#navigation.getSelectionSnapshot().selectedId !== id) {
      await this.#navigation.showTarget(id, {
        origin: this.#origin,
        focusEditor: options.focus,
      });
      if (!this.#isCurrent(token)) return;
    }

    await this.#viewport.reveal(id);
    if (!this.#isCurrent(token)) return;
  }

  setExpanded(id: EmbeddedNodeId, expanded: boolean): void {
    if (this.#destroyed || !this.#tree.getSnapshot().itemById.has(id)) return;
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
    this.#unsubscribeTree();
    this.#unsubscribeSelection();
    this.#listeners.clear();
  }

  readonly #synchronize = (): void => {
    if (this.#destroyed) return;
    const tree = this.#tree.getSnapshot();
    const selection = this.#navigation.getSelectionSnapshot();
    const nextExpandedIds = new Set([...this.#expandedIds].filter((id) => tree.itemById.has(id)));
    const selectedChanged = selection.selectedId !== this.#snapshot.selectedId;
    const expansionChanged = !sameSet(this.#expandedIds, nextExpandedIds);

    if (selectedChanged || expansionChanged) {
      this.#expandedIds = nextExpandedIds;
      this.#snapshot = createViewSnapshot(nextExpandedIds, selection.selectedId);
      this.#publish();
    }

    if (selectedChanged && selection.selectedId) {
      void this.reveal(selection.selectedId, {
        select: true,
        focus: false,
        expandAncestors: true,
      });
    }
  };

  #expandAncestors(id: EmbeddedNodeId): void {
    const parentById = this.#tree.getSnapshot().parentById;
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
    this.#snapshot = createViewSnapshot(
      expandedIds,
      this.#navigation.getSelectionSnapshot().selectedId,
    );
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
): DocumentTreeViewSnapshot {
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
