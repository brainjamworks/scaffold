import { Extension, type Editor } from "@tiptap/core";

import type { ControlBindingRegistry } from "./control-binding";

const CONTROL_BINDING_REGISTRY_STORAGE = "controlBindingRegistryStorage";

export type ControlBindingRegistryPort = Pick<ControlBindingRegistry, "register" | "get">;

interface ControlBindingRegistryStorage {
  getRegistry(): ControlBindingRegistryPort;
}

export function createControlBindingRegistryStorageExtension({
  getRegistry,
}: {
  readonly getRegistry: (editor: Editor) => ControlBindingRegistryPort;
}) {
  return Extension.create<Record<string, never>, ControlBindingRegistryStorage>({
    name: CONTROL_BINDING_REGISTRY_STORAGE,

    addStorage() {
      return {
        getRegistry() {
          throw new Error("Control Binding registry storage is not initialized");
        },
      };
    },

    onBeforeCreate() {
      this.storage.getRegistry = () => getRegistry(this.editor);
      Object.freeze(this.storage);
    },
  });
}

export function getControlBindingRegistryForEditor(editor: Editor): ControlBindingRegistryPort {
  const registry = tryGetControlBindingRegistryForEditor(editor);
  if (registry) return registry;
  throw new Error("Control Binding registry extension is not installed for this editor");
}

export function tryGetControlBindingRegistryForEditor(
  editor: Editor,
): ControlBindingRegistryPort | null {
  const editorStorage = editor.storage as unknown as Record<string, unknown>;
  const storage = editorStorage[CONTROL_BINDING_REGISTRY_STORAGE] as
    | Partial<ControlBindingRegistryStorage>
    | undefined;
  if (!storage?.getRegistry) return null;
  return storage.getRegistry();
}
