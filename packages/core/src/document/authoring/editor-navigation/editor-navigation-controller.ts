import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import type { DocumentTreeSnapshot } from "@/document/model/document-tree";
import type { SemanticTargetInteractionCoordinator } from "@/document/semantic-target-interaction";

import {
  EditorNavigationCoordinator,
  type EditorNavigationEditor,
  type EditorNavigationEnvironment,
  type EditorNavigationOptions,
  type EditorNavigationResult,
} from "./editor-navigation";
import {
  readEditorSelectionTransactionMeta,
  type EditorSelectionOrigin,
} from "./editor-selection-origin";
import { projectEditorSelection } from "./editor-selection-projection";

export interface EditorSelectionSnapshot {
  readonly selectedId: EmbeddedNodeId | null;
  readonly selectionOrigin: EditorSelectionOrigin | null;
}

export interface CreateEditorNavigationControllerInput {
  readonly state: EditorState;
  readonly getDocumentTree: () => DocumentTreeSnapshot;
  readonly getCourseStructure: () => ProjectedCourseStructure;
  readonly targetInteractions: SemanticTargetInteractionCoordinator;
  readonly onEnvironmentChanged?: (environment: EditorNavigationEnvironment | null) => void;
  readonly editor?: EditorNavigationEditor;
  readonly environment?: EditorNavigationEnvironment;
}

export class EditorNavigationController {
  readonly #getDocumentTree: () => DocumentTreeSnapshot;
  readonly #listeners = new Set<() => void>();
  readonly #navigation: EditorNavigationCoordinator;
  readonly #onEnvironmentChanged: (environment: EditorNavigationEnvironment | null) => void;
  #documentTree: DocumentTreeSnapshot;
  #snapshot: EditorSelectionSnapshot;
  #disposed = false;

  constructor({
    state,
    getDocumentTree,
    getCourseStructure,
    targetInteractions,
    onEnvironmentChanged = () => undefined,
    editor,
    environment,
  }: CreateEditorNavigationControllerInput) {
    this.#getDocumentTree = getDocumentTree;
    this.#onEnvironmentChanged = onEnvironmentChanged;
    this.#documentTree = getDocumentTree();
    const selectedId = projectEditorSelection(state.selection, this.#documentTree.itemById);
    this.#snapshot = createSelectionSnapshot(selectedId, selectedId ? "editor" : null);
    this.#navigation = new EditorNavigationCoordinator({
      targetInteractions,
      getDocumentTree,
      getCourseStructure,
      ...(editor ? { editor } : {}),
      ...(environment ? { environment } : {}),
    });
  }

  readonly getSelectionSnapshot = (): EditorSelectionSnapshot => this.#snapshot;

  readonly subscribeSelection = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  showTarget(
    id: EmbeddedNodeId,
    options: EditorNavigationOptions,
  ): Promise<EditorNavigationResult> {
    return this.#navigation.showTarget(id, options);
  }

  reportComponentSelection(id: EmbeddedNodeId): void {
    if (!this.#getDocumentTree().itemById.has(id)) {
      if (import.meta.env.DEV) {
        console.warn(`Ignored component selection for unexposed document item "${id}".`);
      }
      return;
    }
    this.#navigation.interrupt();
    this.#replaceSelection(id, "component");
  }

  applySelectionTransaction(transaction: Transaction, state: EditorState): void {
    const transactionMeta = readEditorSelectionTransactionMeta(transaction);
    if (
      this.#disposed ||
      (!transaction.docChanged && !transaction.selectionSet && !transactionMeta)
    ) {
      return;
    }

    const previous = this.#snapshot;
    if ((transaction.selectionSet && !transactionMeta) || transactionMeta?.origin === "editor") {
      this.#navigation.interrupt();
    }

    const tree = this.#getDocumentTree();
    let selectedId = transaction.docChanged
      ? reconcileSelectedId(previous.selectedId, this.#documentTree, tree)
      : previous.selectedId;
    let selectionOrigin = selectedId ? previous.selectionOrigin : null;

    if (
      transaction.docChanged &&
      !transaction.selectionSet &&
      previous.selectionOrigin === "editor"
    ) {
      selectedId = projectEditorSelection(state.selection, tree.itemById);
      selectionOrigin = selectedId ? "editor" : null;
    } else if (transaction.selectionSet || transactionMeta) {
      if (transactionMeta && tree.itemById.has(transactionMeta.intendedId)) {
        selectedId = transactionMeta.intendedId;
        selectionOrigin = transactionMeta.origin;
      } else {
        selectedId = projectEditorSelection(state.selection, tree.itemById);
        selectionOrigin = selectedId ? "editor" : null;
      }
    }

    this.#documentTree = tree;
    if (selectedId === previous.selectedId && selectionOrigin === previous.selectionOrigin) return;
    this.#snapshot = createSelectionSnapshot(selectedId, selectionOrigin);
    for (const listener of this.#listeners) listener();
  }

  setEditor(editor: EditorNavigationEditor): void {
    this.#navigation.setEditor(editor);
  }

  setEnvironment(environment: EditorNavigationEnvironment): void {
    this.#navigation.setEnvironment(environment);
    this.#onEnvironmentChanged(environment);
  }

  clearEnvironment(): void {
    this.#navigation.clearEnvironment();
    this.#onEnvironmentChanged(null);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#navigation.dispose();
    this.#onEnvironmentChanged(null);
    this.#listeners.clear();
  }

  #replaceSelection(selectedId: EmbeddedNodeId, selectionOrigin: EditorSelectionOrigin): void {
    if (
      selectedId === this.#snapshot.selectedId &&
      selectionOrigin === this.#snapshot.selectionOrigin
    ) {
      return;
    }
    this.#snapshot = createSelectionSnapshot(selectedId, selectionOrigin);
    for (const listener of this.#listeners) listener();
  }
}

function createSelectionSnapshot(
  selectedId: EmbeddedNodeId | null,
  selectionOrigin: EditorSelectionOrigin | null,
): EditorSelectionSnapshot {
  return Object.freeze({ selectedId, selectionOrigin });
}

function reconcileSelectedId(
  selectedId: EmbeddedNodeId | null,
  previousTree: DocumentTreeSnapshot,
  currentTree: DocumentTreeSnapshot,
): EmbeddedNodeId | null {
  let candidate = selectedId;
  while (candidate && !currentTree.itemById.has(candidate)) {
    candidate = previousTree.parentById.get(candidate) ?? null;
  }
  return candidate;
}
