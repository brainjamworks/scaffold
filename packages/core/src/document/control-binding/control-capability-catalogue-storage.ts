import { Extension, type Editor } from "@tiptap/core";

import type { ControlCapabilityCatalogue } from "./control-capability-catalogue";

const CONTROL_CAPABILITY_CATALOGUE_STORAGE = "controlCapabilityCatalogueStorage";

interface ControlCapabilityCatalogueStorage {
  getCatalogue(): ControlCapabilityCatalogue;
}

export function createControlCapabilityCatalogueStorageExtension({
  getCatalogue,
}: {
  readonly getCatalogue: (editor: Editor) => ControlCapabilityCatalogue;
}) {
  return Extension.create<Record<string, never>, ControlCapabilityCatalogueStorage>({
    name: CONTROL_CAPABILITY_CATALOGUE_STORAGE,

    addStorage() {
      return {
        getCatalogue() {
          throw new Error("Control Capability Catalogue storage is not initialized");
        },
      };
    },

    onBeforeCreate() {
      this.storage.getCatalogue = () => getCatalogue(this.editor);
      Object.freeze(this.storage);
    },
  });
}

export function getControlCapabilityCatalogueForEditor(
  editor: Editor,
): ControlCapabilityCatalogue {
  const catalogue = tryGetControlCapabilityCatalogueForEditor(editor);
  if (catalogue) return catalogue;
  throw new Error("Control Capability Catalogue extension is not installed for this editor");
}

export function tryGetControlCapabilityCatalogueForEditor(
  editor: Editor,
): ControlCapabilityCatalogue | null {
  const editorStorage = editor.storage as unknown as Record<string, unknown>;
  const storage = editorStorage[CONTROL_CAPABILITY_CATALOGUE_STORAGE] as
    | Partial<ControlCapabilityCatalogueStorage>
    | undefined;
  if (!storage?.getCatalogue) return null;
  return storage.getCatalogue();
}
