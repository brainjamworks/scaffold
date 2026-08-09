import type { Editor } from "@tiptap/core";
import { PluginKey, type EditorState } from "@tiptap/pm/state";
import { useSyncExternalStore } from "react";

import type {
  SemanticDocumentController,
  SemanticDocumentControllerSnapshot,
} from "./semantic-document-controller";

export const semanticDocumentPluginKey = new PluginKey<SemanticDocumentController>(
  "semanticDocumentController",
);

export function getSemanticDocumentControllerForEditor(
  editor: Editor,
): SemanticDocumentController {
  return getSemanticDocumentControllerForState(editor.state);
}

export function getSemanticDocumentControllerForState(
  state: EditorState,
): SemanticDocumentController {
  const controller = semanticDocumentPluginKey.getState(state);
  if (!controller) {
    throw new Error("Semantic Document Controller extension is not installed for this editor");
  }
  return controller;
}

export function useSemanticDocumentControllerSnapshot(
  editor: Editor,
): SemanticDocumentControllerSnapshot {
  const controller = getSemanticDocumentControllerForEditor(editor);
  return useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
}
