import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import type { SurfaceAuthoringViewMap } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import { getSurfaceVariantFromAttrs } from "@/editor/surfaces/authoring/surface-authoring-view-registry";
import type { SurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { createSurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import type { RegisteredSurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import type { RegisteredSurfaceAuthoringView } from "@/editor/surfaces/authoring/surface-authoring-view-registry";

import "../../view/region.css";

interface ResolvedSurfaceAuthoringNodeView {
  readonly variant: string;
  readonly definition: RegisteredSurfaceVariantDefinition;
  readonly authoringView: RegisteredSurfaceAuthoringView;
}

export function resolveSurfaceAuthoringNodeView({
  node,
  registry,
  views,
}: {
  node: ProseMirrorNode;
  registry: SurfaceVariantRegistry;
  views: SurfaceAuthoringViewMap;
}): ResolvedSurfaceAuthoringNodeView {
  const variant = getSurfaceVariantFromAttrs(node.attrs);
  const definition = variant ? registry.get(variant) : undefined;
  const authoringView = variant ? views.get(variant) : undefined;

  if (!variant || !definition || !authoringView) {
    throw new Error(
      `No surface authoring view registered for surface variant "${variant ?? "missing"}".`,
    );
  }

  return { variant, definition, authoringView };
}

export function createSurfaceAuthoringNode({
  registry,
  views,
}: {
  registry: SurfaceVariantRegistry;
  views: SurfaceAuthoringViewMap;
}) {
  function SurfaceAuthoringNodeView(props: NodeViewProps) {
    const { variant, definition, authoringView } = resolveSurfaceAuthoringNodeView({
      node: props.node,
      registry,
      views,
    });

    const Component = authoringView.component;
    return (
      <Component
        {...props}
        authoringView={authoringView}
        definition={definition}
        isEmpty={isFieldContentEmpty(props.node)}
        variant={variant}
      />
    );
  }

  return createSurfaceNode({
    addNodeView: () => ReactNodeViewRenderer(SurfaceAuthoringNodeView),
  });
}
