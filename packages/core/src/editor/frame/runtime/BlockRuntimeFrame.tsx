import { NodeViewWrapper } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { CSSProperties, ReactNode } from "react";

import type { BlockFrameDefinition } from "@/editor/blocks/block-definition";

import { normalizeBlockFrame, resolveBlockFrameViewStyle } from "../model/block-frame";
import { boundedPlacementAttributes, type BoundedPlacement } from "../model/bounded-placement";
import { runtimeFrameAttributes } from "./frame-projection";

import "../view/bounded-placement.css";

const FRAME_ATTR = "data-frame";

export interface BlockRuntimeFrameProps {
  boundedPlacement?: BoundedPlacement;
  children: ReactNode;
  className?: string;
  frameDefinition?: BlockFrameDefinition;
  frameKind?: string;
  node: ProseMirrorNode;
  nodeType?: string;
  style?: CSSProperties;
}

export function BlockRuntimeFrame({
  boundedPlacement,
  children,
  className,
  frameDefinition,
  frameKind = "block",
  node,
  nodeType = node.type.name,
  style,
}: BlockRuntimeFrameProps) {
  const frame = node.attrs["frame"];
  const { rootStyle } = resolveBlockFrameViewStyle(frame, frameDefinition);
  const normalizedFrame = frame ? normalizeBlockFrame(frame) : null;

  return (
    <NodeViewWrapper
      data-node={nodeType}
      data-id={String(node.attrs["id"] ?? "")}
      {...boundedPlacementAttributes(boundedPlacement)}
      {...runtimeFrameAttributes(frameKind)}
      {...(normalizedFrame ? { [FRAME_ATTR]: JSON.stringify(normalizedFrame) } : {})}
      className={className}
      style={mergeRuntimeFrameStyle(rootStyle as CSSProperties, style)}
    >
      {children}
    </NodeViewWrapper>
  );
}

function mergeRuntimeFrameStyle(
  frameStyle: CSSProperties | undefined,
  style: CSSProperties | undefined,
): CSSProperties | undefined {
  if (!frameStyle) return style;
  return style ? { ...frameStyle, ...style } : frameStyle;
}
