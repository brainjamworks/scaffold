import type { EditorState, Transaction } from "@tiptap/pm/state";

import {
  createControlBindingRegistry,
  type ControlBindingRegistry,
  type ControlBindingRegistryPort,
} from "@/document/control-binding";
import type { DocumentTreeDefinitionLookup } from "@/document/model/document-tree";
import {
  createSemanticTargetInteractionEnvironment,
  type SemanticTargetInteractionEnvironment,
  type SemanticTargetInteractionEnvironmentOwner,
} from "@/document/semantic-target-interaction";

import { DocumentTreeStore } from "./document-tree/document-tree-store";
import { EditorNavigationController } from "./editor-navigation/editor-navigation-controller";
import type { EditorNavigationEnvironment } from "./editor-navigation/editor-navigation";

export interface DocumentAuthoringLifecycle {
  readonly documentTree: DocumentTreeStore;
  readonly editorNavigation: EditorNavigationController;
  readonly controlBindings: ControlBindingRegistryPort;
  readonly targetInteractions: SemanticTargetInteractionEnvironment;
  applyTransaction(transaction: Transaction, state: EditorState): void;
  dispose(): void;
}

export function createDocumentAuthoringLifecycle(
  state: EditorState,
  definitions: DocumentTreeDefinitionLookup,
): DocumentAuthoringLifecycle {
  const documentTree = new DocumentTreeStore({ document: state.doc, definitions });
  let navigationEnvironment: EditorNavigationEnvironment | null = null;
  const controlBindingRegistry: ControlBindingRegistry = createControlBindingRegistry({
    requireOwnerControlDefinition: (ownerId) =>
      documentTree.getControlCapabilities().requireOwnerControlDefinition(ownerId),
    requireOwnedTargetCapabilities: (ownerId, targetId) =>
      documentTree.getControlCapabilities().requireOwnedTargetCapabilities(ownerId, targetId),
  });
  const controlBindings: ControlBindingRegistryPort = Object.freeze({
    register: (binding) => controlBindingRegistry.register(binding),
    get: (ownerId) => controlBindingRegistry.get(ownerId),
    notifyWhenOwnersMounted: (ownerIds, listener) =>
      controlBindingRegistry.notifyWhenOwnersMounted(ownerIds, listener),
  });
  const targetInteractionOwner: SemanticTargetInteractionEnvironmentOwner =
    createSemanticTargetInteractionEnvironment({
      getSemantics: documentTree.getSnapshot,
      getCourseStructure: documentTree.getCourseStructure,
      surfacePresentation: {
        presentSurface: async (surfaceId, signal) => {
          if (signal.aborted) return;
          const environment = navigationEnvironment;
          if (!environment) {
            throw new Error("Authoring editor navigation environment is not mounted");
          }
          await environment.presentSurface(surfaceId);
        },
      },
    });
  const editorNavigation = new EditorNavigationController({
    state,
    getDocumentTree: documentTree.getSnapshot,
    getCourseStructure: documentTree.getCourseStructure,
    targetInteractions: targetInteractionOwner.environment.coordinator,
    layerActivationRegistry: targetInteractionOwner.environment.registry,
    onEnvironmentChanged: (environment) => {
      navigationEnvironment = environment;
    },
  });
  let disposed = false;

  return Object.freeze({
    documentTree,
    editorNavigation,
    controlBindings,
    targetInteractions: targetInteractionOwner.environment,
    applyTransaction(transaction: Transaction, nextState: EditorState) {
      if (disposed) return;
      if (transaction.docChanged) documentTree.updateDocument(nextState.doc);
      editorNavigation.applySelectionTransaction(transaction, nextState);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      navigationEnvironment = null;
      editorNavigation.dispose();
      controlBindingRegistry.dispose();
      targetInteractionOwner.dispose();
      documentTree.dispose();
    },
  });
}
