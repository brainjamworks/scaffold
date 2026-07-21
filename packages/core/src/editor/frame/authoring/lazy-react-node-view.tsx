import type { NodeViewRenderer } from "@tiptap/core";
import {
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
  type ReactNodeViewRendererOptions,
} from "@tiptap/react";
import { Suspense, lazy, type ComponentType } from "react";

export interface LazyReactNodeViewOptions<T = HTMLElement> {
  fallback: ComponentType<ReactNodeViewProps<T>>;
  loadView: () => Promise<{
    default: ComponentType<ReactNodeViewProps<T>>;
  }>;
  react?: Partial<ReactNodeViewRendererOptions>;
}

export function createLazyReactNodeView<T = HTMLElement>({
  fallback: Fallback,
  loadView,
  react,
}: LazyReactNodeViewOptions<T>): NodeViewRenderer {
  const LazyView = lazy(loadView);

  function LazyReactNodeView(props: ReactNodeViewProps<T>) {
    return (
      <Suspense fallback={<Fallback {...props} />}>
        <LazyView {...props} />
      </Suspense>
    );
  }

  LazyReactNodeView.displayName = "LazyReactNodeView";

  return ReactNodeViewRenderer(LazyReactNodeView, react);
}
