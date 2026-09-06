import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { useSyncExternalStore } from "react";

import { documentAuthoringPluginKey } from "../document-authoring-storage";
import type { DocumentTreeStore } from "./document-tree-store";

export function getDocumentTreeForEditor(editor: Editor): DocumentTreeStore {
  return getDocumentTreeForState(editor.state);
}

export function getDocumentTreeForState(state: EditorState): DocumentTreeStore {
  const lifecycle = documentAuthoringPluginKey.getState(state);
  if (!lifecycle) {
    throw new Error("Document authoring extension is not installed for this editor");
  }
  return lifecycle.documentTree;
}

export function useDocumentTreeSnapshot(editor: Editor) {
  const store = getDocumentTreeForEditor(editor);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
