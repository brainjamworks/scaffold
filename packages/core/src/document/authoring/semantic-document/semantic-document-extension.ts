import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import type { SemanticDefinitionLookup } from "@/document/model/semantic-document";

import { SemanticDocumentController } from "./semantic-document-controller";
import { semanticDocumentPluginKey } from "./semantic-document-storage";

export function createSemanticDocumentExtension(definitions: SemanticDefinitionLookup) {
  return Extension.create({
    name: "semanticDocumentController",

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
          view: (view) => ({
            destroy: () => semanticDocumentPluginKey.getState(view.state)?.destroy(),
          }),
        }),
      ];
    },
  });
}
