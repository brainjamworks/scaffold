import type { Editor } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import { useSyncExternalStore } from "react";

import { documentAuthoringPluginKey } from "../document-authoring-storage";
import type {
  EditorNavigationController,
  EditorSelectionSnapshot,
} from "./editor-navigation-controller";

export function getEditorNavigationForEditor(editor: Editor): EditorNavigationController {
  return getEditorNavigationForState(editor.state);
}

export function getEditorNavigationForState(state: EditorState): EditorNavigationController {
  const lifecycle = documentAuthoringPluginKey.getState(state);
  if (!lifecycle) {
    throw new Error("Document authoring extension is not installed for this editor");
  }
  return lifecycle.editorNavigation;
}

export function useEditorSelectionSnapshot(editor: Editor): EditorSelectionSnapshot {
  const navigation = getEditorNavigationForEditor(editor);
  return useSyncExternalStore(
    navigation.subscribeSelection,
    navigation.getSelectionSnapshot,
    navigation.getSelectionSnapshot,
  );
}
