import { NodeViewWrapper } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { CSSProperties, ReactNode } from "react";

import { courseBlockAuthoringFrameAttributes } from "@/editor/interactions/dom/authoring-frame";
import type { BlockFrameDefinition } from "@/editor/blocks/block-definition";
import { boundedPlacementAttributes, type BoundedPlacement } from "../model/bounded-placement";

import "../view/bounded-placement.css";

export interface BlockAuthoringFrameProps {
  boundedPlacement?: BoundedPlacement;
  children: ReactNode;
  className?: string;
  frameDefinition?: BlockFrameDefinition;
  node: ProseMirrorNode;
  nodeType?: string;
  style?: CSSProperties;
}

export function BlockAuthoringFrame({
  boundedPlacement,
  children,
  className,
  frameDefinition,
  node,
  nodeType = node.type.name,
  style,
}: BlockAuthoringFrameProps) {
  return (
    <NodeViewWrapper
      data-node={nodeType}
      {...boundedPlacementAttributes(boundedPlacement)}
      {...courseBlockAuthoringFrameAttributes({
        blockId: node.attrs["id"],
        nodeType: node.type.name,
      })}
      className={className}
      style={resolveFrameStyle(frameDefinition, style)}
    >
      {children}
    </NodeViewWrapper>
  );
}

function resolveFrameStyle(
  frameDefinition: BlockFrameDefinition | undefined,
  style: CSSProperties | undefined,
): CSSProperties | undefined {
  const frameStyle =
    frameDefinition?.resizeMode === "freeform" ? { height: "100%", width: "100%" } : undefined;

  if (!frameStyle) return style;
  return style ? { ...frameStyle, ...style } : frameStyle;
}
