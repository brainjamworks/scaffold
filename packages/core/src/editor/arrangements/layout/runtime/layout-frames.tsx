import { NodeViewWrapper } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { ReactNode } from "react";

import { runtimeFrameAttributes } from "@/editor/frame/runtime/frame-projection";
import {
  boundedPlacementAttributes,
  type BoundedPlacement,
} from "@/editor/frame/model/bounded-placement";
import { cn } from "@/lib/cn";
import { VerticalContentPositionSchema } from "@/schemas/course-document";

interface LayoutRuntimeFrameProps {
  boundedPlacement?: BoundedPlacement | undefined;
  children: ReactNode;
  className?: string | undefined;
  id?: string | undefined;
  isEmpty?: boolean;
  node: ProseMirrorNode;
  variant: string;
}

interface SectionRuntimeFrameProps {
  children: ReactNode;
  className?: string | undefined;
  id?: string | undefined;
  isEmpty?: boolean;
  node: ProseMirrorNode;
  variant: string;
}

export function LayoutRuntimeFrame({
  boundedPlacement,
  children,
  className,
  id,
  isEmpty,
  node,
  variant,
}: LayoutRuntimeFrameProps) {
  return (
    <NodeViewWrapper
      data-node="layout"
      data-definition={variant}
      data-id={id ?? (node.attrs["id"] || undefined)}
      data-empty={isEmpty ? "true" : undefined}
      data-layout-kind={variant === "layout" ? undefined : variant}
      {...boundedPlacementAttributes(boundedPlacement)}
      {...runtimeFrameAttributes("layout")}
      className={cn("sc-layout-frame", "sc-layout-frame--runtime", className)}
    >
      {children}
    </NodeViewWrapper>
  );
}

export function SectionRuntimeFrame({
  children,
  className,
  id,
  isEmpty,
  node,
  variant,
}: SectionRuntimeFrameProps) {
  return (
    <NodeViewWrapper
      data-node="section"
      data-definition={variant}
      data-id={id ?? (node.attrs["id"] || undefined)}
      data-empty={isEmpty ? "true" : undefined}
      data-layout-kind={variant === "section" ? undefined : variant}
      data-vertical-content-position={readVerticalPosition(node.attrs["verticalPosition"])}
      {...runtimeFrameAttributes("section")}
      className={cn(
        "sc-layout-section",
        "sc-layout-section-runtime",
        isEmpty && "sc-layout-section-runtime--empty",
        className,
      )}
    >
      {children}
    </NodeViewWrapper>
  );
}

function readVerticalPosition(value: unknown) {
  const parsed = VerticalContentPositionSchema.safeParse(value);
  return parsed.success ? parsed.data : "top";
}
