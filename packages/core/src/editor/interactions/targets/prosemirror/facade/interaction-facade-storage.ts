import type { Editor } from "@tiptap/core";

import { createInteractionStore, type InteractionStore } from "../../facade/interaction-store";

const SCAFFOLD_INTERACTION_OWNER_STORAGE = "scaffoldInteractionOwner";

export interface ScaffoldInteractionOwnerStorage {
  facadeStore: InteractionStore;
}

export function createScaffoldInteractionOwnerStorage(): ScaffoldInteractionOwnerStorage {
  return {
    facadeStore: createInteractionStore(),
  };
}

export function getInteractionFacadeStoreForEditor(editor: Editor): InteractionStore {
  const facadeStore = findInteractionFacadeStoreForEditor(editor);
  if (!facadeStore) {
    throw new Error("Scaffold interaction-owner extension is not installed for this editor");
  }
  return facadeStore;
}

export function findInteractionFacadeStoreForEditor(editor: Editor): InteractionStore | null {
  const editorStorage = editor.storage as unknown as Record<string, unknown>;
  const storage = editorStorage[SCAFFOLD_INTERACTION_OWNER_STORAGE] as
    | Partial<ScaffoldInteractionOwnerStorage>
    | undefined;
  return storage?.facadeStore ?? null;
}
