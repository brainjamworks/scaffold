import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";

import { getScaffoldCapabilitiesForState } from "@/composition/extensions/scaffold-capabilities-storage";
import { documentAuthoringPluginKey } from "@/document/authoring/document-authoring-storage";
import {
  allowsLayerEditingTransaction,
  documentContainsLayer,
  NON_LAYER_DOCUMENT_MUTATION_ACCESS,
  type LayerEditingContext,
  type LayerMutationAccess,
} from "@/document/model/layers/layer-editing-policy";
import { LAYER_NODE_TYPE } from "@/document/model/nodes/structural-node-types";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

export const layerEditingBoundaryPluginKey = new PluginKey("sc-layer-editing-boundary");

export function requireLayerMutationAccessForState(state: EditorState): LayerMutationAccess {
  if (!documentContainsLayer(state.doc)) {
    if (!state.schema.nodes[LAYER_NODE_TYPE]) return NON_LAYER_DOCUMENT_MUTATION_ACCESS;
    const capabilities = getScaffoldCapabilitiesForState(state);
    return Object.freeze({
      kind: "layer-capable-document",
      layoutDefinitions: capabilities.layouts.registry,
      blockDefinitions: capabilities.blocks.registry,
    });
  }
  const capabilities = getScaffoldCapabilitiesForState(state);
  const context = readLayerEditingContextForState(
    state,
    capabilities.layouts.registry,
    capabilities.blocks.registry,
  );
  if (!context?.blockDefinitions) {
    throw new Error("Layer-aware mutation requires the document authoring lifecycle.");
  }
  return Object.freeze({
    kind: "implicit-authoring",
    context: Object.freeze({ ...context, blockDefinitions: context.blockDefinitions }),
  });
}

export function readLayerEditingContextForState(
  state: EditorState,
  layoutDefinitions: LayoutRegistry,
  blockDefinitions?: BlockDefinitionLookup,
): LayerEditingContext | null {
  const lifecycle = documentAuthoringPluginKey.getState(state);
  if (!lifecycle) return null;
  return Object.freeze({
    layoutDefinitions,
    openLayerByOwnerId: lifecycle.editorNavigation.authoringLayers.getSnapshot().openLayerByOwnerId,
    ...(blockDefinitions ? { blockDefinitions } : {}),
  });
}

export function createLayerEditingBoundaryExtension(
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
) {
  return Extension.create({
    name: "layerEditingBoundaries",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: layerEditingBoundaryPluginKey,
          filterTransaction(transaction, state) {
            const lifecycle = documentAuthoringPluginKey.getState(state);
            if (!lifecycle) {
              throw new Error("Layer editing boundaries require the document authoring lifecycle.");
            }
            return allowsLayerEditingTransaction({
              transaction,
              documentBefore: state.doc,
              blockDefinitions,
              layoutDefinitions,
              openLayerByOwnerId:
                lifecycle.editorNavigation.authoringLayers.getSnapshot().openLayerByOwnerId,
            });
          },
        }),
      ];
    },
  });
}
