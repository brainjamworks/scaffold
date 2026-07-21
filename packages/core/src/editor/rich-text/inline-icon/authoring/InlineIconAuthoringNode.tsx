import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { IconRenderer } from "@/ui/icons/IconRenderer";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { selectNodeAt } from "@/editor/selection/selection-commands";
import { cn } from "@/lib/cn";

import {
  DEFAULT_INLINE_ICON_VALUE,
  InlineIconNode,
  readInlineIconSize,
  readInlineIconValue,
} from "../model/InlineIconNode";
import "../view/inline-icon.css";

function InlineIconAuthoringNodeView(props: NodeViewProps) {
  const value = readInlineIconValue(props.node.attrs["value"]) ?? DEFAULT_INLINE_ICON_VALUE;
  const size = readInlineIconSize(props.node.attrs["size"]);
  const pos = typeof props.getPos === "function" ? safeGetPos(props.getPos) : null;

  const handleMouseDown = (event: ReactMouseEvent) => {
    if (!props.editor.isEditable || typeof pos !== "number") return;
    event.preventDefault();
    selectNodeAt(props.editor, pos, { scrollIntoView: false });
  };

  return (
    <NodeViewWrapper
      as="span"
      data-type="inline-icon"
      data-icon-kind={value.kind}
      data-icon-size={size}
      contentEditable={false}
      onMouseDown={handleMouseDown}
      className={cn("sc-inline-icon", props.selected && "sc-inline-icon--selected")}
    >
      <IconRenderer value={value} decorative={false} className="sc-inline-icon__glyph" />
    </NodeViewWrapper>
  );
}

export const InlineIconAuthoringNode = InlineIconNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(InlineIconAuthoringNodeView, { as: "span" });
  },
});
