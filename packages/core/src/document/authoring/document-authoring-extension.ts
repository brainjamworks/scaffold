import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import {
  createControlBindingRegistryStorageExtension,
  createControlCapabilityCatalogueStorageExtension,
} from "@/document/control-binding";
import type { DocumentTreeDefinitionLookup } from "@/document/model/document-tree";
import { createSemanticTargetInteractionEnvironmentStorageExtension } from "@/document/semantic-target-interaction";

import {
  createDocumentAuthoringLifecycle,
  type DocumentAuthoringLifecycle,
} from "./document-authoring-lifecycle";
import { documentAuthoringPluginKey } from "./document-authoring-storage";

export function createDocumentAuthoringExtension(definitions: DocumentTreeDefinitionLookup) {
  return Extension.create({
    name: "documentAuthoringLifecycle",

    addExtensions() {
      const requireLifecycle = (
        state: Parameters<typeof documentAuthoringPluginKey.getState>[0],
      ): DocumentAuthoringLifecycle => {
        const lifecycle = documentAuthoringPluginKey.getState(state);
        if (!lifecycle) {
          throw new Error("Document authoring extension is not installed for this editor");
        }
        return lifecycle;
      };
      return [
        createControlCapabilityCatalogueStorageExtension({
          getCatalogue: (editor) =>
            requireLifecycle(editor.state).documentTree.getControlCapabilities(),
        }),
        createControlBindingRegistryStorageExtension({
          getRegistry: (editor) => requireLifecycle(editor.state).controlBindings,
        }),
        createSemanticTargetInteractionEnvironmentStorageExtension({
          getEnvironment: (editor) => requireLifecycle(editor.state).targetInteractions,
        }),
      ];
    },

    onDestroy() {
      documentAuthoringPluginKey.getState(this.editor.state)?.dispose();
    },

    addProseMirrorPlugins() {
      return [
        new Plugin<DocumentAuthoringLifecycle>({
          key: documentAuthoringPluginKey,
          state: {
            init: (_configuration, state) => createDocumentAuthoringLifecycle(state, definitions),
            apply: (transaction, lifecycle, _oldState, newState) => {
              lifecycle.applyTransaction(transaction, newState);
              return lifecycle;
            },
          },
        }),
      ];
    },
  });
}
