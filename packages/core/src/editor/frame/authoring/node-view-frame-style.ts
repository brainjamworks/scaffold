import type { ResizableNodeDimensions } from "@tiptap/core";

import { AUTHORING_FRAME_RESIZE_MODE_ATTR } from "../../interactions/dom/authoring-chrome";
import type { BlockFrameDefinition } from "@/editor/blocks/block-definition";
import { applyBlockFrameStyle } from "../model/block-frame";

export interface NodeViewFrameStyleInput {
  blockElement: HTMLElement | null;
  definition: BlockFrameDefinition | undefined;
  frame: unknown;
  liveSize: ResizableNodeDimensions | null;
  nodeViewElement: HTMLElement;
  resizableDom: HTMLElement;
  wrapper: HTMLElement;
}

export function applyNodeViewFrameStyle(input: NodeViewFrameStyleInput): void {
  const liveWidthPx = input.liveSize?.width ?? null;
  const resizeMode = input.definition?.resizeMode ?? "responsive";

  applyBlockFrameStyle(input.wrapper, input.frame, input.definition, {
    heightPx: input.liveSize?.height ?? null,
    widthPx: liveWidthPx,
  });
  applyFrameModeAttributes(input, resizeMode);

  if (resizeMode === "freeform") {
    applyFreeformFrameStyle(input);
    return;
  }

  applyResponsiveFrameStyle(input);
}

function applyFrameModeAttributes(input: NodeViewFrameStyleInput, resizeMode: string): void {
  input.wrapper.setAttribute(AUTHORING_FRAME_RESIZE_MODE_ATTR, resizeMode);
  input.resizableDom.setAttribute(AUTHORING_FRAME_RESIZE_MODE_ATTR, resizeMode);
  input.blockElement?.setAttribute(AUTHORING_FRAME_RESIZE_MODE_ATTR, resizeMode);
}

function applyResponsiveFrameStyle(input: NodeViewFrameStyleInput): void {
  input.wrapper.style.overflow = "";
  input.wrapper.style.height = "";
  input.nodeViewElement.style.width = "100%";
  input.nodeViewElement.style.maxWidth = "none";
  input.nodeViewElement.style.marginLeft = "0";
  input.nodeViewElement.style.marginRight = "0";
  input.nodeViewElement.style.height = "";
  input.nodeViewElement.style.overflow = "";
  applyElementStyle(input.blockElement, {
    height: "",
    overflow: "",
    transform: "",
    transformOrigin: "",
    width: "100%",
  });
}

function applyFreeformFrameStyle(input: NodeViewFrameStyleInput): void {
  input.wrapper.style.overflow = "";
  input.nodeViewElement.style.width = "100%";
  input.nodeViewElement.style.maxWidth = "none";
  input.nodeViewElement.style.marginLeft = "0";
  input.nodeViewElement.style.marginRight = "0";
  input.nodeViewElement.style.height = "100%";
  input.nodeViewElement.style.overflow = "";
  applyElementStyle(input.blockElement, {
    height: "100%",
    overflow: "",
    transform: "",
    transformOrigin: "",
    width: "100%",
  });
}

function applyElementStyle(element: HTMLElement | null, style: Partial<CSSStyleDeclaration>): void {
  if (!element) return;

  if (style.height !== undefined) element.style.height = style.height;
  if (style.overflow !== undefined) element.style.overflow = style.overflow;
  if (style.transform !== undefined) element.style.transform = style.transform;
  if (style.transformOrigin !== undefined) {
    element.style.transformOrigin = style.transformOrigin;
  }
  if (style.width !== undefined) element.style.width = style.width;
}
