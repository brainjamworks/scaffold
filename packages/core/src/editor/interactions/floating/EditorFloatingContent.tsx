import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { createPortal } from "react-dom";
import type { OffsetOptions, Placement } from "@floating-ui/dom";

import { resolveFloatingAnchorReference, type FloatingAnchor } from "./floating-anchor";
import { useEditorFloatingLayerRoot } from "./EditorFloatingLayer";
import { useEditorFloatingPosition } from "./useEditorFloatingPosition";

export type EditorFloatingDataAttributes = Partial<
  Record<`data-${string}`, string | number | boolean>
>;

export interface EditorFloatingContentProps {
  anchor: FloatingAnchor | null;
  children: ReactNode;
  className?: string;
  dataAttributes?: EditorFloatingDataAttributes;
  offset?: OffsetOptions;
  open: boolean;
  placement?: Placement;
  style?: CSSProperties;
}

export function EditorFloatingContent({
  anchor,
  children,
  className,
  dataAttributes,
  offset,
  open,
  placement,
  style,
}: EditorFloatingContentProps) {
  const portalRoot = useEditorFloatingLayerRoot();
  const [floatingElement, setFloatingElement] = useState<HTMLDivElement | null>(null);
  const hasLiveAnchor = open && resolveFloatingAnchorReference(anchor) !== null;
  useEditorFloatingPosition({
    anchor,
    floatingElement,
    open: Boolean(portalRoot && hasLiveAnchor),
    ...(offset !== undefined ? { offset } : {}),
    ...(placement !== undefined ? { placement } : {}),
  });

  if (!portalRoot || !open || !hasLiveAnchor) return null;

  return createPortal(
    <div
      {...dataAttributes}
      className={joinClassNames("sc-editor-floating-content", className)}
      ref={setFloatingElement}
      style={resolveFloatingContentStyle(style)}
    >
      {children}
    </div>,
    portalRoot,
  );
}

function resolveFloatingContentStyle(style: CSSProperties | undefined): CSSProperties {
  return {
    ...style,
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    visibility: "hidden",
  };
}

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}
