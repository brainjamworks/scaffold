import type { NodeViewRenderer } from "@tiptap/core";
import type { ReactNodeViewProps } from "@tiptap/react";
import type { ComponentType } from "react";

import {
  createTiptapResizableReactNodeView,
  type TiptapResizableReactNodeViewOptions,
} from "./tiptap-resizable-react-node-view";

export type AuthoringBlockNodeViewOptions = TiptapResizableReactNodeViewOptions;

export function createAuthoringBlockNodeView<T = HTMLElement>(
  Component: ComponentType<ReactNodeViewProps<T>>,
  options: AuthoringBlockNodeViewOptions,
): NodeViewRenderer {
  return createTiptapResizableReactNodeView(Component, options);
}
