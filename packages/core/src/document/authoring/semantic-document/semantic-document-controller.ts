import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import {
  projectSemanticDocument,
  type SemanticDefinitionLookup,
  type SemanticDocumentSnapshot,
} from "@/document/model/semantic-document";

import { projectAuthoringCourseStructure } from "../course-structure/project-authoring-course-structure";
import { SemanticContainerAdapterRegistry } from "./semantic-container-adapter-registry";
import {
  SemanticNavigationCoordinator,
  type SemanticNavigationEditor,
  type SemanticNavigationEnvironment,
  type SemanticNavigationOptions,
  type SemanticNavigationResult,
} from "./semantic-navigation";
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
  readonly navigationEditor?: SemanticNavigationEditor;
}

export class SemanticDocumentController {
  readonly containerAdapters = new SemanticContainerAdapterRegistry();
  readonly #definitions: SemanticDefinitionLookup;
  readonly #listeners = new Set<() => void>();
  readonly #navigation: SemanticNavigationCoordinator;
  #courseStructure: ProjectedCourseStructure;
  #snapshot: SemanticDocumentControllerSnapshot;
  #destroyed = false;

  constructor({ state, definitions, navigationEditor }: CreateSemanticDocumentControllerInput) {
    this.#definitions = definitions;
    const projected = projectState(state, definitions, 0);
    this.#courseStructure = projected.courseStructure;
    const selectedId = projectSemanticSelection(state.selection, projected.semantics.itemById);
    this.#snapshot = createControllerSnapshot(
      projected.semantics,
      selectedId,
      selectedId ? "editor" : null,
    );
    this.#navigation = new SemanticNavigationCoordinator({
      registry: this.containerAdapters,
      getSemantics: () => this.#snapshot.semantics,
      getCourseStructure: () => this.#courseStructure,
      ...(navigationEditor ? { editor: navigationEditor } : {}),
    });
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

  setNavigationEditor(editor: SemanticNavigationEditor): void {
    this.#navigation.setEditor(editor);
  }

  setNavigationEnvironment(environment: SemanticNavigationEnvironment): void {
    this.#navigation.setEnvironment(environment);
  }

  select(
    id: EmbeddedNodeId,
    options: SemanticNavigationOptions,
  ): Promise<SemanticNavigationResult> {
    return this.#navigation.select(id, options);
  }

  reportComponentSelection(id: EmbeddedNodeId): void {
    if (!this.#snapshot.semantics.itemById.has(id)) {
      if (import.meta.env.DEV) {
        console.warn(`Ignored component selection for unpublished semantic item "${id}".`);
      }
      return;
    }
    this.#navigation.interrupt();
    this.#replaceSelection(id, "component");
  }

  applyTransaction(transaction: Transaction, state: EditorState): void {
    if (this.#destroyed || (!transaction.docChanged && !transaction.selectionSet)) return;

    const previous = this.#snapshot;
    const transactionMeta = transaction.selectionSet
      ? readSemanticSelectionTransactionMeta(transaction)
      : null;
    if (transaction.selectionSet && !transactionMeta) this.#navigation.interrupt();

    const projected = transaction.docChanged
      ? projectState(state, this.#definitions, previous.semantics.revision + 1)
      : null;
    if (projected) this.#courseStructure = projected.courseStructure;
    const semantics = projected?.semantics ?? previous.semantics;
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
    this.#navigation.interrupt();
    this.containerAdapters.clear();
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

interface ProjectedSemanticState {
  readonly semantics: SemanticDocumentSnapshot;
  readonly courseStructure: ProjectedCourseStructure;
}

function projectState(
  state: EditorState,
  definitions: SemanticDefinitionLookup,
  revision: number,
): ProjectedSemanticState {
  const courseStructure = projectAuthoringCourseStructure(state.doc);
  if (!courseStructure) {
    throw new Error("Cannot project semantic document from invalid Course Structure");
  }

  return {
    semantics: projectSemanticDocument({
      doc: state.doc,
      courseStructure,
      definitions,
      revision,
    }),
    courseStructure,
  };
}
