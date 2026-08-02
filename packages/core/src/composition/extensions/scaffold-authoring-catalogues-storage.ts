import { Extension, type Editor } from "@tiptap/core";

import type { InsertCatalog } from "@/editor/insertion/insert-catalog";
import type { SurfaceCreationCatalog } from "@/editor/surfaces/authoring/surface-creation-catalog";

const SCAFFOLD_AUTHORING_CATALOGUES_STORAGE = "scaffoldAuthoringCatalogues";

export interface ScaffoldAuthoringCatalogues {
  readonly inDocument: InsertCatalog;
  readonly surfaceCreation: SurfaceCreationCatalog;
}

export interface ScaffoldAuthoringCataloguesStorage {
  readonly catalogues: ScaffoldAuthoringCatalogues;
}

export function createScaffoldAuthoringCataloguesStorageExtension(
  catalogues: ScaffoldAuthoringCatalogues,
) {
  return Extension.create<Record<string, never>, ScaffoldAuthoringCataloguesStorage>({
    name: SCAFFOLD_AUTHORING_CATALOGUES_STORAGE,

    addStorage() {
      return { catalogues };
    },

    onBeforeCreate() {
      Object.freeze(this.storage);
    },
  });
}

export function getScaffoldAuthoringCataloguesForEditor(
  editor: Editor,
): ScaffoldAuthoringCatalogues {
  const editorStorage = editor.storage as unknown as Record<string, unknown>;
  const storage = editorStorage[SCAFFOLD_AUTHORING_CATALOGUES_STORAGE] as
    | Partial<ScaffoldAuthoringCataloguesStorage>
    | undefined;

  if (!storage?.catalogues) {
    throw new Error("Scaffold authoring catalogues extension is not installed for this editor");
  }

  return storage.catalogues;
}
