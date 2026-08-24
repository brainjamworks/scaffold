import { Extension, type Editor } from "@tiptap/core";

import type { SemanticTargetInteractionEnvironment } from "./semantic-target-interaction-environment";

const SEMANTIC_TARGET_INTERACTION_ENVIRONMENT_STORAGE = "semanticTargetInteractionEnvironment";

interface SemanticTargetInteractionEnvironmentStorage {
  getEnvironment(): SemanticTargetInteractionEnvironment;
}

export function createSemanticTargetInteractionEnvironmentStorageExtension({
  getEnvironment,
}: {
  readonly getEnvironment: (editor: Editor) => SemanticTargetInteractionEnvironment;
}) {
  return Extension.create<Record<string, never>, SemanticTargetInteractionEnvironmentStorage>({
    name: SEMANTIC_TARGET_INTERACTION_ENVIRONMENT_STORAGE,

    addStorage() {
      return {
        getEnvironment() {
          throw new Error("Semantic Target Interaction Environment storage is not initialized");
        },
      };
    },

    onBeforeCreate() {
      this.storage.getEnvironment = () => getEnvironment(this.editor);
      Object.freeze(this.storage);
    },
  });
}

export function getSemanticTargetInteractionEnvironmentForEditor(
  editor: Editor,
): SemanticTargetInteractionEnvironment {
  const environment = tryGetSemanticTargetInteractionEnvironmentForEditor(editor);
  if (environment) return environment;

  throw new Error(
    "Semantic Target Interaction Environment extension is not installed for this editor",
  );
}

export function tryGetSemanticTargetInteractionEnvironmentForEditor(
  editor: Editor,
): SemanticTargetInteractionEnvironment | null {
  const editorStorage = editor.storage as unknown as Record<string, unknown>;
  const storage = editorStorage[SEMANTIC_TARGET_INTERACTION_ENVIRONMENT_STORAGE] as
    | Partial<SemanticTargetInteractionEnvironmentStorage>
    | undefined;

  if (!storage?.getEnvironment) return null;

  return storage.getEnvironment();
}
