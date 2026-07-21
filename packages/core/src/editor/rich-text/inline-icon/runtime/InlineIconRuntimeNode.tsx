import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import { IconRenderer } from "@/ui/icons/IconRenderer";

import {
  DEFAULT_INLINE_ICON_VALUE,
  InlineIconNode,
  readInlineIconSize,
  readInlineIconValue,
} from "../model/InlineIconNode";
import "../view/inline-icon.css";

function InlineIconRuntimeNodeView(props: NodeViewProps) {
  const value = readInlineIconValue(props.node.attrs["value"]) ?? DEFAULT_INLINE_ICON_VALUE;
  const size = readInlineIconSize(props.node.attrs["size"]);

  return (
    <NodeViewWrapper
      as="span"
      data-type="inline-icon"
      data-icon-kind={value.kind}
      data-icon-size={size}
      contentEditable={false}
      className="sc-inline-icon"
    >
      <IconRenderer value={value} decorative={false} className="sc-inline-icon__glyph" />
    </NodeViewWrapper>
  );
}

export const InlineIconRuntimeNode = InlineIconNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(InlineIconRuntimeNodeView, { as: "span" });
  },
});
