import type { NodeViewRenderer } from "@tiptap/core";
import { type ReactNodeViewProps } from "@tiptap/react";
import { Suspense, lazy, type ComponentType } from "react";

import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { BlockRuntimeFrame } from "@/editor/frame/runtime/BlockRuntimeFrame";

import {
  createRuntimeBlockNodeView,
  type RuntimeBlockNodeViewOptions,
} from "./runtime-block-node-view";

export interface LazyRuntimeBlockNodeViewOptions<T = HTMLElement> extends Omit<
  RuntimeBlockNodeViewOptions,
  "nodeType"
> {
  definition?: BlockDefinition;
  fallback: ComponentType<ReactNodeViewProps<T>>;
  loadView: () => Promise<{
    default: ComponentType<ReactNodeViewProps<T>>;
  }>;
  nodeType?: string;
  wrapperClassName?: string;
}

export function createLazyRuntimeBlockNodeView<T = HTMLElement>({
  definition,
  fallback: Fallback,
  loadView,
  nodeType,
  wrapperClassName,
  ...nodeViewOptions
}: LazyRuntimeBlockNodeViewOptions<T>): NodeViewRenderer {
  const resolvedNodeType = nodeType ?? definition?.nodeType;
  if (!resolvedNodeType) {
    throw new Error("Lazy runtime block NodeView requires a node type.");
  }
  const runtimeNodeType = resolvedNodeType;
  const LazyView = lazy(loadView);
  const frameDefinition = nodeViewOptions.frame ?? definition?.frame;

  function LazyRuntimeBlockNodeView(props: ReactNodeViewProps<T>) {
    return (
      <BlockRuntimeFrame
        node={props.node}
        nodeType={runtimeNodeType}
        {...(frameDefinition ? { frameDefinition } : {})}
        {...(nodeViewOptions.frameKind ? { frameKind: nodeViewOptions.frameKind } : {})}
        {...(wrapperClassName ? { className: wrapperClassName } : {})}
      >
        <Suspense fallback={<Fallback {...props} />}>
          <LazyView {...props} />
        </Suspense>
      </BlockRuntimeFrame>
    );
  }

  LazyRuntimeBlockNodeView.displayName = "LazyRuntimeBlockNodeView";

  return createRuntimeBlockNodeView(LazyRuntimeBlockNodeView, {
    ...nodeViewOptions,
    nodeType: runtimeNodeType,
    projectFrame: false,
  });
}
