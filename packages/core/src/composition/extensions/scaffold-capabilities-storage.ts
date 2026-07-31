import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";

import type { ResolvedScaffoldCapabilities } from "@/composition/model/resolved-scaffold-capabilities";

const SCAFFOLD_CAPABILITIES_STORAGE = "scaffoldCapabilities";
const scaffoldCapabilitiesPluginKey = new PluginKey<ResolvedScaffoldCapabilities>(
  "scaffoldCapabilities",
);

export interface ScaffoldCapabilitiesStorage {
  readonly capabilities: ResolvedScaffoldCapabilities;
}

export function createScaffoldCapabilitiesStorageExtension(
  capabilities: ResolvedScaffoldCapabilities,
) {
  return Extension.create<Record<string, never>, ScaffoldCapabilitiesStorage>({
    name: SCAFFOLD_CAPABILITIES_STORAGE,

    addStorage() {
      return { capabilities };
    },

    onBeforeCreate() {
      Object.freeze(this.storage);
    },

    addProseMirrorPlugins() {
      return [
        new Plugin<ResolvedScaffoldCapabilities>({
          key: scaffoldCapabilitiesPluginKey,
          state: {
            init: () => capabilities,
            apply: (_transaction, currentCapabilities) => currentCapabilities,
          },
        }),
      ];
    },
  });
}

export function getScaffoldCapabilitiesForEditor(editor: Editor): ResolvedScaffoldCapabilities {
  const editorStorage = editor.storage as unknown as Record<string, unknown>;
  const storage = editorStorage[SCAFFOLD_CAPABILITIES_STORAGE] as
    | Partial<ScaffoldCapabilitiesStorage>
    | undefined;

  if (!storage?.capabilities) {
    throw new Error("Scaffold capabilities extension is not installed for this editor");
  }

  return storage.capabilities;
}

export function getScaffoldCapabilitiesForState(state: EditorState): ResolvedScaffoldCapabilities {
  const capabilities = scaffoldCapabilitiesPluginKey.getState(state);

  if (!capabilities) {
    throw new Error("Scaffold capabilities plugin is not installed for this editor state");
  }

  return capabilities;
}
