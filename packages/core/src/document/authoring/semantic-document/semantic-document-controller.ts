import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import { projectCourseStructure } from "@/document/model/course-structure";
import {
  projectSemanticDocument,
  type SemanticDefinitionLookup,
  type SemanticDocumentSnapshot,
} from "@/document/model/semantic-document";

export interface SemanticDocumentControllerSnapshot {
  readonly semantics: SemanticDocumentSnapshot;
  readonly selectedId: EmbeddedNodeId | null;
  readonly selectionOrigin: null;
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
    this.#snapshot = createControllerSnapshot(projectState(state, definitions, 0), null);
  }

  readonly getSnapshot = (): SemanticDocumentControllerSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#destroyed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  setSelectedId(selectedId: EmbeddedNodeId | null): void {
    if (selectedId && !this.#snapshot.semantics.itemById.has(selectedId)) return;
    if (selectedId === this.#snapshot.selectedId) return;
    this.#snapshot = Object.freeze({ ...this.#snapshot, selectedId });
    this.#publish();
  }

  applyTransaction(transaction: Transaction, state: EditorState): void {
    if (this.#destroyed || !transaction.docChanged) return;

    const previous = this.#snapshot;
    const semantics = projectState(
      state,
      this.#definitions,
      previous.semantics.revision + 1,
    );
    this.#snapshot = createControllerSnapshot(
      semantics,
      reconcileSelectedId(previous, semantics),
    );
    this.#publish();
  }

  destroy(): void {
    this.#destroyed = true;
    this.#listeners.clear();
  }

  #publish(): void {
    for (const listener of this.#listeners) listener();
  }
}

function createControllerSnapshot(
  semantics: SemanticDocumentSnapshot,
  selectedId: EmbeddedNodeId | null,
): SemanticDocumentControllerSnapshot {
  return Object.freeze({
    semantics,
    selectedId,
    selectionOrigin: null,
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
