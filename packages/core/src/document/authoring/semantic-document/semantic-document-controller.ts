import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import { projectCourseStructure } from "@/document/model/course-structure";
import {
  projectSemanticDocument,
  type SemanticDefinitionLookup,
  type SemanticDocumentSnapshot,
} from "@/document/model/semantic-document";

import {
  readSemanticSelectionTransactionMeta,
  type SemanticSelectionOrigin,
} from "./semantic-selection-origin";
import { projectSemanticSelection } from "./semantic-selection-projection";

export interface SemanticDocumentControllerSnapshot {
  readonly semantics: SemanticDocumentSnapshot;
  readonly selectedId: EmbeddedNodeId | null;
  readonly selectionOrigin: SemanticSelectionOrigin | null;
}

export interface CreateSemanticDocumentControllerInput {
  readonly state: EditorState;
  readonly definitions: SemanticDefinitionLookup;
}

export class SemanticDocumentController {
  readonly #definitions: SemanticDefinitionLookup;
  readonly #listeners = new Set<() => void>();
  #snapshot: SemanticDocumentControllerSnapshot;
  #destroyed = false;

  constructor({ state, definitions }: CreateSemanticDocumentControllerInput) {
    this.#definitions = definitions;
    const semantics = projectState(state, definitions, 0);
    const selectedId = projectSemanticSelection(state.selection, semantics.itemById);
    this.#snapshot = createControllerSnapshot(semantics, selectedId, selectedId ? "editor" : null);
  }

  readonly getSnapshot = (): SemanticDocumentControllerSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#destroyed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  setSelectedId(selectedId: EmbeddedNodeId | null): void {
    if (selectedId === null) return;
    this.reportComponentSelection(selectedId);
  }

  reportComponentSelection(id: EmbeddedNodeId): void {
    if (!this.#snapshot.semantics.itemById.has(id)) {
      if (import.meta.env.DEV) {
        console.warn(`Ignored component selection for unpublished semantic item "${id}".`);
      }
      return;
    }
    this.#replaceSelection(id, "component");
  }

  applyTransaction(transaction: Transaction, state: EditorState): void {
    if (this.#destroyed || (!transaction.docChanged && !transaction.selectionSet)) return;

    const previous = this.#snapshot;
    const semantics = transaction.docChanged
      ? projectState(state, this.#definitions, previous.semantics.revision + 1)
      : previous.semantics;
    let selectedId = transaction.docChanged
      ? reconcileSelectedId(previous, semantics)
      : previous.selectedId;
    let selectionOrigin = selectedId ? previous.selectionOrigin : null;

    if (
      transaction.docChanged &&
      !transaction.selectionSet &&
      previous.selectionOrigin === "editor"
    ) {
      selectedId = projectSemanticSelection(state.selection, semantics.itemById);
      selectionOrigin = selectedId ? "editor" : null;
    } else if (transaction.selectionSet) {
      const transactionMeta = readSemanticSelectionTransactionMeta(transaction);
      if (transactionMeta && semantics.itemById.has(transactionMeta.intendedId)) {
        selectedId = transactionMeta.intendedId;
        selectionOrigin = transactionMeta.origin;
      } else {
        selectedId = projectSemanticSelection(state.selection, semantics.itemById);
        selectionOrigin = selectedId ? "editor" : null;
      }
    }

    if (
      !transaction.docChanged &&
      selectedId === previous.selectedId &&
      selectionOrigin === previous.selectionOrigin
    ) {
      return;
    }
    this.#snapshot = createControllerSnapshot(semantics, selectedId, selectionOrigin);
    this.#publish();
  }

  destroy(): void {
    this.#destroyed = true;
    this.#listeners.clear();
  }

  #publish(): void {
    for (const listener of this.#listeners) listener();
  }

  #replaceSelection(selectedId: EmbeddedNodeId, selectionOrigin: SemanticSelectionOrigin): void {
    if (
      selectedId === this.#snapshot.selectedId &&
      selectionOrigin === this.#snapshot.selectionOrigin
    ) {
      return;
    }
    this.#snapshot = createControllerSnapshot(
      this.#snapshot.semantics,
      selectedId,
      selectionOrigin,
    );
    this.#publish();
  }
}

function createControllerSnapshot(
  semantics: SemanticDocumentSnapshot,
  selectedId: EmbeddedNodeId | null,
  selectionOrigin: SemanticSelectionOrigin | null,
): SemanticDocumentControllerSnapshot {
  return Object.freeze({
    semantics,
    selectedId,
    selectionOrigin,
  });
}

function reconcileSelectedId(
  previous: SemanticDocumentControllerSnapshot,
  semantics: SemanticDocumentSnapshot,
): EmbeddedNodeId | null {
  let candidate = previous.selectedId;
  while (candidate && !semantics.itemById.has(candidate)) {
    candidate = previous.semantics.parentById.get(candidate) ?? null;
  }
  return candidate;
}

function projectState(
  state: EditorState,
  definitions: SemanticDefinitionLookup,
  revision: number,
): SemanticDocumentSnapshot {
  const courseStructure = projectCourseStructure(state.doc.toJSON());
  if (!courseStructure) {
    throw new Error("Cannot project semantic document from invalid Course Structure");
  }

  return projectSemanticDocument({ doc: state.doc, courseStructure, definitions, revision });
}
