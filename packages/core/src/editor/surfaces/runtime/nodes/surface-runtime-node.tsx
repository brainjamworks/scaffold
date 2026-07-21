import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import type { RegisteredSurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";
import type { SurfaceVariantRegistry } from "@/editor/surfaces/model/surface-variant-registry";
import { createSurfaceNode } from "@/editor/surfaces/model/nodes/surface-node";
import {
  getSurfaceVariantFromAttrs,
  type RegisteredSurfaceRuntimeView,
  type SurfaceRuntimeViewMap,
} from "@/editor/surfaces/runtime/surface-runtime-view-registry";
import { surfaceRuntimeRendererAttrs } from "@/editor/surfaces/runtime/views/SurfaceRuntimeFrame";

import "../../view/region.css";

interface ResolvedSurfaceRuntimeNodeView {
  readonly variant: string;
  readonly definition: RegisteredSurfaceVariantDefinition;
  readonly runtimeView: RegisteredSurfaceRuntimeView;
}

export function resolveSurfaceRuntimeNodeView({
  node,
  registry,
  views,
}: {
  node: ProseMirrorNode;
  registry: SurfaceVariantRegistry;
  views: SurfaceRuntimeViewMap;
}): ResolvedSurfaceRuntimeNodeView {
  const variant = getSurfaceVariantFromAttrs(node.attrs);
  const definition = variant ? registry.get(variant) : undefined;
  const runtimeView = variant ? views.get(variant) : undefined;

  if (!variant || !definition || !runtimeView) {
    throw new Error(
      `No surface runtime view registered for surface variant "${variant ?? "missing"}".`,
    );
  }

  return { variant, definition, runtimeView };
}

export function createSurfaceRuntimeNode({
  registry,
  views,
}: {
  registry: SurfaceVariantRegistry;
  views: SurfaceRuntimeViewMap;
}) {
  const resolvedByNode = new WeakMap<ProseMirrorNode, ResolvedSurfaceRuntimeNodeView>();

  function resolveNode(node: ProseMirrorNode): ResolvedSurfaceRuntimeNodeView {
    const cached = resolvedByNode.get(node);
    if (cached) return cached;

    const resolved = resolveSurfaceRuntimeNodeView({ node, registry, views });
    resolvedByNode.set(node, resolved);
    return resolved;
  }

  function SurfaceRuntimeNodeView(props: NodeViewProps) {
    const { variant, definition, runtimeView } = resolveNode(props.node);
    const Component = runtimeView.component;

    return (
      <Component
        {...props}
        definition={definition}
        runtimeView={runtimeView}
        isEmpty={isFieldContentEmpty(props.node)}
        variant={variant}
      />
    );
  }

  return createSurfaceNode({
    addNodeView: () =>
      ReactNodeViewRenderer(SurfaceRuntimeNodeView, {
        as: "section",
        attrs: ({ node, HTMLAttributes }) => {
          const { variant, definition } = resolveNode(node);
          return surfaceRuntimeRendererAttrs({
            attrs: node.attrs,
            definition,
            HTMLAttributes,
            variant,
          });
        },
        className: "sc-surface-runtime-node",
      }),
  });
}
