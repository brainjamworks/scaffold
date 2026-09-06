import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import {
  createControlCapabilityCatalogue,
  type ControlCapabilityCatalogue,
} from "@/document/control-binding";
import type { ProjectedCourseStructure } from "@/document/model/course-structure";
import {
  buildDocumentTree,
  type DocumentTreeDefinitionLookup,
  type DocumentTreeSnapshot,
} from "@/document/model/document-tree";

import { projectAuthoringCourseStructure } from "../course-structure/project-authoring-course-structure";

export interface CreateDocumentTreeStoreInput {
  readonly document: ProseMirrorNode;
  readonly definitions: DocumentTreeDefinitionLookup;
}

export class DocumentTreeStore {
  readonly #definitions: DocumentTreeDefinitionLookup;
  readonly #listeners = new Set<() => void>();
  #controlCapabilities: ControlCapabilityCatalogue;
  #courseStructure: ProjectedCourseStructure;
  #snapshot: DocumentTreeSnapshot;
  #disposed = false;

  constructor({ document, definitions }: CreateDocumentTreeStoreInput) {
    this.#definitions = definitions;
    const projection = projectDocument(document, definitions, 0);
    this.#snapshot = projection.tree;
    this.#courseStructure = projection.courseStructure;
    this.#controlCapabilities = createControlCapabilityCatalogue({
      snapshot: projection.tree,
      definitions,
    });
  }

  readonly getSnapshot = (): DocumentTreeSnapshot => this.#snapshot;

  readonly getCourseStructure = (): ProjectedCourseStructure => this.#courseStructure;

  readonly getControlCapabilities = (): ControlCapabilityCatalogue => this.#controlCapabilities;

  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => undefined;
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  updateDocument(document: ProseMirrorNode): void {
    if (this.#disposed) return;
    const projection = projectDocument(document, this.#definitions, this.#snapshot.revision + 1);
    const controlCapabilities = createControlCapabilityCatalogue({
      snapshot: projection.tree,
      definitions: this.#definitions,
    });

    this.#courseStructure = projection.courseStructure;
    this.#controlCapabilities = controlCapabilities;
    this.#snapshot = projection.tree;
    for (const listener of this.#listeners) listener();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#listeners.clear();
  }
}

interface ProjectedDocument {
  readonly tree: DocumentTreeSnapshot;
  readonly courseStructure: ProjectedCourseStructure;
}

function projectDocument(
  document: ProseMirrorNode,
  definitions: DocumentTreeDefinitionLookup,
  revision: number,
): ProjectedDocument {
  const courseStructure = projectAuthoringCourseStructure(document);
  if (!courseStructure) {
    throw new Error("Cannot build document tree from invalid Course Structure");
  }

  return {
    tree: buildDocumentTree({
      doc: document,
      courseStructure,
      definitions,
      revision,
    }),
    courseStructure,
  };
}
