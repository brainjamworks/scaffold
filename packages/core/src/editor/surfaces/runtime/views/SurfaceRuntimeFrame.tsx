import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import type { ReactNode } from "react";

import {
  readSurfaceBackground,
  readSurfaceVerticalPosition,
  surfaceRegionDataAttrs,
} from "@/editor/surfaces/model/surface-settings";
import type { RegisteredSurfaceVariantDefinition } from "@/editor/surfaces/model/surface-variant-definition";

import {
  surfaceBackgroundDataAttrs,
  surfaceBackgroundStyle,
  surfaceBackgroundStyleAttribute,
} from "../../view/surface-background";
import type { SurfaceRuntimeViewProps } from "../surface-runtime-view-registry";
import "@/editor/rich-text/view/field-content.css";
import "../../view/header-footer-slots.css";

export interface SurfaceRuntimeFrameProps extends SurfaceRuntimeViewProps {
  attributes?: Record<string, string | undefined>;
  children?: ReactNode;
  className?: string;
}

export function SurfaceRuntimeFrame({
  attributes,
  children,
  className,
  node,
}: SurfaceRuntimeFrameProps) {
  return (
    <NodeViewWrapper
      className={["sc-surface-runtime-node__content", className].filter(Boolean).join(" ")}
      style={surfaceBackgroundStyle(readSurfaceBackground(node.attrs["settings"]))}
      {...attributes}
    >
      {children}
      <NodeViewContent data-surface-content="" />
    </NodeViewWrapper>
  );
}

export function surfaceRuntimeRendererAttrs({
  attrs,
  definition,
  HTMLAttributes,
  variant,
}: {
  attrs: Record<string, unknown>;
  definition: RegisteredSurfaceVariantDefinition;
  HTMLAttributes: Record<string, unknown>;
  variant: string;
}): Record<string, string> {
  const surfaceId = readStringAttr(attrs["id"]);
  const baseAttrs = stringAttrs(HTMLAttributes);
  const background = readSurfaceBackground(attrs["settings"]);
  const verticalPosition = readSurfaceVerticalPosition(attrs["settings"], definition);
  const backgroundStyle = surfaceBackgroundStyleAttribute(background);
  return {
    ...baseAttrs,
    "data-course-surface-node-view": "runtime",
    "data-definition": variant,
    "data-node": "surface",
    "data-surface": "",
    ...(verticalPosition ? { "data-vertical-content-position": verticalPosition } : {}),
    ...surfaceRegionDataAttrs(attrs["settings"]),
    ...surfaceBackgroundDataAttrs(background),
    ...(surfaceId ? { "data-surface-id": surfaceId } : {}),
    ...(backgroundStyle
      ? {
          style: [baseAttrs["style"], backgroundStyle].filter(Boolean).join("; "),
        }
      : {}),
    "data-surface-variant": variant,
  };
}

function stringAttrs(attrs: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    result[key] = String(value);
  }
  return result;
}

function readStringAttr(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
