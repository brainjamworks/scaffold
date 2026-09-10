import type { EmbeddedNodeId } from "@scaffold/contracts";
import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { createElement, useCallback, useSyncExternalStore } from "react";

import { isLayerCompositionFillOccupant } from "@/document/model/layers/layer-composition-policy";
import { LayerNode } from "@/document/model/layers/layer-node";
import type { LayoutRegistry } from "@/editor/arrangements/layout/model/layout-registry";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import "./layer.css";

export interface LayerNodeViewProjection {
  readonly ownerId: (editor: Editor, layerId: EmbeddedNodeId) => EmbeddedNodeId;
  readonly isActive: (editor: Editor, layerId: EmbeddedNodeId) => boolean;
  readonly subscribe: (editor: Editor, listener: () => void) => () => void;
}

export interface CreateLayerNodeViewInput {
  readonly blockDefinitions: BlockDefinitionLookup;
  readonly layoutDefinitions: LayoutRegistry;
  readonly projection: LayerNodeViewProjection;
}

/**
 * Shared authoring/runtime geometry adapter. Selection remains owned by the
 * supplied projection; this view only projects it into one real composition.
 */
export function createLayerNodeView({
  blockDefinitions,
  layoutDefinitions,
  projection,
}: CreateLayerNodeViewInput) {
  function LayerNodeView(props: NodeViewProps) {
    const layerId = requireLayerId(props.node);
    const ownerId = projection.ownerId(props.editor, layerId);
    const subscribe = useCallback(
      (listener: () => void) => projection.subscribe(props.editor, listener),
      [props.editor],
    );
    const getSnapshot = useCallback(
      () => projection.isActive(props.editor, layerId),
      [props.editor, layerId],
    );
    const active = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const composition = resolveCompositionGeometry(props.node, blockDefinitions, layoutDefinitions);

    return createElement(
      NodeViewWrapper,
      {
        "aria-hidden": active ? undefined : true,
        "data-layer-active": active ? "" : undefined,
        "data-layer-composition": composition,
        "data-layer-id": layerId,
        "data-layer-owner-id": ownerId,
        "data-layer-state": active ? "active" : "inactive",
        "data-node": "layer",
        hidden: !active,
        inert: !active,
        className: "sc-layer",
      },
      createElement(NodeViewContent, { className: "sc-layer__content" }),
    );
  }

  return LayerNode.extend({
    addNodeView() {
      return ReactNodeViewRenderer(LayerNodeView);
    },
  });
}

function requireLayerId(node: ProseMirrorNode): EmbeddedNodeId {
  return EmbeddedNodeIdSchema.parse(node.attrs["id"]);
}

function resolveCompositionGeometry(
  layer: ProseMirrorNode,
  blockDefinitions: BlockDefinitionLookup,
  layoutDefinitions: LayoutRegistry,
): "fill" | "flow" {
  let fillOccupants = 0;
  layer.forEach((child) => {
    if (isLayerCompositionFillOccupant(child, blockDefinitions, layoutDefinitions)) {
      fillOccupants += 1;
    }
  });
  if (fillOccupants === 0) return "flow";
  if (fillOccupants !== 1 || layer.childCount !== 1) {
    throw new Error(`Layer "${String(layer.attrs["id"])}" has a non-exclusive fill composition.`);
  }
  return "fill";
}
