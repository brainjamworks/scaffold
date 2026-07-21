import type { NodeViewRenderer } from "@tiptap/core";
import { type ReactNodeViewProps } from "@tiptap/react";
import { Suspense, lazy, type ComponentType } from "react";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { BlockAuthoringFrame } from "./BlockAuthoringFrame";

import {
  createAuthoringBlockNodeView,
  type AuthoringBlockNodeViewOptions,
} from "./authoring-block-node-view";

export interface LazyAuthoringBlockNodeViewOptions<T = HTMLElement> extends Omit<
  AuthoringBlockNodeViewOptions,
  "blockDefinitions"
> {
  fallback: ComponentType<ReactNodeViewProps<T>>;
  loadView: () => Promise<{
    default: ComponentType<ReactNodeViewProps<T>>;
  }>;
  nodeType: string;
  wrapperClassName?: string;
}

export function createLazyAuthoringBlockNodeView<T = HTMLElement>({
  fallback: Fallback,
  loadView,
  nodeType,
  wrapperClassName,
  ...nodeViewOptions
}: LazyAuthoringBlockNodeViewOptions<T>): NodeViewRenderer {
  const LazyView = lazy(loadView);
  const frameDefinition = nodeViewOptions.frame;

  function LazyAuthoringBlockNodeView(props: ReactNodeViewProps<T>) {
    return (
      <BlockAuthoringFrame
        node={props.node}
        nodeType={nodeType}
        {...(frameDefinition ? { frameDefinition } : {})}
        {...(wrapperClassName ? { className: wrapperClassName } : {})}
      >
        <Suspense fallback={<Fallback {...props} />}>
          <LazyView {...props} />
        </Suspense>
      </BlockAuthoringFrame>
    );
  }

  LazyAuthoringBlockNodeView.displayName = "LazyAuthoringBlockNodeView";

  return createAuthoringBlockNodeView(LazyAuthoringBlockNodeView, {
    blockDefinitions: builtInBlockRegistry,
    ...nodeViewOptions,
  });
}
