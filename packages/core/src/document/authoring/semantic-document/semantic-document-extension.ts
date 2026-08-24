import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import type { SemanticDefinitionLookup } from "@/document/model/semantic-document";
import { createSemanticTargetInteractionEnvironmentStorageExtension } from "@/document/semantic-target-interaction";

import { SemanticDocumentController } from "./semantic-document-controller";
import { semanticDocumentPluginKey } from "./semantic-document-storage";

export function createSemanticDocumentExtension(definitions: SemanticDefinitionLookup) {
  return Extension.create({
    name: "semanticDocumentController",

    addExtensions() {
      return [
        createSemanticTargetInteractionEnvironmentStorageExtension({
          getEnvironment: (editor) => {
            const controller = semanticDocumentPluginKey.getState(editor.state);
            if (!controller) {
              throw new Error(
                "Semantic Document Controller extension is not installed for this editor",
              );
            }
            return controller.semanticTargetInteractions;
          },
        }),
      ];
    },

    onDestroy() {
      semanticDocumentPluginKey.getState(this.editor.state)?.destroy();
    },

    addProseMirrorPlugins() {
      return [
        new Plugin<SemanticDocumentController>({
          key: semanticDocumentPluginKey,
          state: {
            init: (_configuration, state) => new SemanticDocumentController({ state, definitions }),
            apply: (transaction, controller, _oldState, newState) => {
              controller.applyTransaction(transaction, newState);
              return controller;
            },
          },
        }),
      ];
    },
  });
}
