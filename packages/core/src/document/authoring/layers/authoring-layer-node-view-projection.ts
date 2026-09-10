import type { EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";

import { documentAuthoringPluginKey } from "@/document/authoring/document-authoring-storage";
import type { LayerNodeViewProjection } from "@/editor/layers/layer-node-view";

/** Adapts the authoring editor lifecycle to the shared Layer NodeView. */
export const authoringLayerNodeViewProjection: LayerNodeViewProjection = Object.freeze({
  ownerId(editor: Editor, layerId: EmbeddedNodeId) {
    const ownerId = requireAuthoringLifecycle(editor)
      .documentTree.getSnapshot()
      .parentById.get(layerId);
    if (!ownerId) throw new Error(`Authoring Layer "${layerId}" has no logical owner.`);
    return ownerId;
  },
  isActive(editor: Editor, layerId: EmbeddedNodeId) {
    const layers = requireAuthoringLayers(editor);
    for (const openLayerId of layers.getSnapshot().openLayerByOwnerId.values()) {
      if (openLayerId === layerId) return true;
    }
    return false;
  },
  subscribe(editor: Editor, listener: () => void) {
    return requireAuthoringLayers(editor).subscribe(listener);
  },
});

function requireAuthoringLayers(editor: Editor) {
  return requireAuthoringLifecycle(editor).editorNavigation.authoringLayers;
}

function requireAuthoringLifecycle(editor: Editor) {
  const lifecycle = documentAuthoringPluginKey.getState(editor.state);
  if (!lifecycle) {
    throw new Error("Layer authoring NodeView requires the Document authoring extension.");
  }
  return lifecycle;
}
