import { NodeViewContent, type NodeViewContentProps } from "@tiptap/react";

export const CONTENT_LAYOUT_CONTENT_ROOT_ATTR = "data-content-layout-root" as const;

export function contentLayoutContentRootAttributes(): {
  readonly [CONTENT_LAYOUT_CONTENT_ROOT_ATTR]: "";
} {
  return { [CONTENT_LAYOUT_CONTENT_ROOT_ATTR]: "" };
}

export function ContentLayoutNodeViewContent(props: NodeViewContentProps) {
  return <NodeViewContent {...props} {...contentLayoutContentRootAttributes()} />;
}
