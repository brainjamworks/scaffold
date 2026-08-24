import { Extension } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";

import { SemanticContainerAdapterRegistry } from "../semantic-container-adapter-registry";
import { semanticDocumentPluginKey } from "../semantic-document-storage";
import type { SemanticDocumentController } from "../semantic-document-controller";

export function createSemanticContainerAdapterTestExtension() {
  const registry = new SemanticContainerAdapterRegistry();
  const controller = { containerAdapters: registry } as SemanticDocumentController;
  const extension = Extension.create({
    name: "semantic_container_adapter_test",
    addProseMirrorPlugins() {
      return [
        new Plugin<SemanticDocumentController>({
          key: semanticDocumentPluginKey,
          state: {
            init: () => controller,
            apply: (_transaction, current) => current,
          },
        }),
      ];
    },
  });
  return { extension, registry };
}
