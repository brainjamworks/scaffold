import { NodeViewContent, NodeViewWrapper, useEditorState } from "@tiptap/react";
import type { ReactNode } from "react";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import {
  authoringChromeActiveAttributes,
  surfaceAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { shouldRenderAuthoringChrome } from "@/editor/interactions/dom/authoring-chrome";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { resolveStructuralChromeTargetFromSnapshot } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import {
  readSurfaceBackground,
  readSurfaceVerticalPosition,
  surfaceRegionDataAttrs,
} from "@/editor/surfaces/model/surface-settings";

import type { SurfaceAuthoringViewProps } from "../surface-authoring-view-registry";
import { surfaceBackgroundDataAttrs, surfaceBackgroundStyle } from "../../view/surface-background";
import "@/editor/rich-text/view/field-content.css";
import "../../view/header-footer-slots.css";

export interface SurfaceAuthoringFrameProps extends SurfaceAuthoringViewProps {
  attributes?: Record<string, string | undefined>;
  children?: ReactNode;
  className?: string;
}

export function SurfaceAuthoringFrame({
  attributes,
  children,
  className,
  ...props
}: SurfaceAuthoringFrameProps) {
  const chromeActive = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const pos = resolveNodeViewPos(props.getPos);
      const outline = resolveStructuralChromeTargetFromSnapshot(
        editor.state,
        publishInteractionOwnerSnapshot(editor.state, null, {
          blockDefinitions: builtInBlockRegistry,
        }),
        "outline",
      );
      return shouldRenderAuthoringChrome(
        editor.view.dom,
        pos !== null && outline?.kind === InteractionTargetKind.Surface && outline.pos === pos,
      );
    },
  });
  const classNames = ["sc-surface-authoring-node__content", className].filter(Boolean).join(" ");
  const backgroundStyle = surfaceBackgroundStyle(
    readSurfaceBackground(props.node.attrs["settings"]),
  );
  const rendererAttrs = surfaceAuthoringRendererAttrs(props);
  const isSlideshow = props.editor.state.doc.firstChild?.attrs["mode"] === "slideshow";

  if (isSlideshow) {
    return (
      <NodeViewWrapper
        className="sc-slideshow-authoring-surface-stage"
        data-authoring-surface-stage=""
      >
        <div
          className={classNames}
          style={backgroundStyle}
          {...attributes}
          {...rendererAttrs}
          {...authoringChromeActiveAttributes(chromeActive)}
        >
          {children}
          <NodeViewContent data-surface-content="" />
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      className={classNames}
      style={backgroundStyle}
      {...attributes}
      {...rendererAttrs}
      {...authoringChromeActiveAttributes(chromeActive)}
    >
      {children}
      <NodeViewContent data-surface-content="" />
    </NodeViewWrapper>
  );
}

function resolveNodeViewPos(getPos: (() => number | undefined) | boolean): number | null {
  if (typeof getPos !== "function") return null;

  try {
    const pos = getPos();
    return typeof pos === "number" && Number.isFinite(pos) ? pos : null;
  } catch {
    return null;
  }
}

function surfaceAuthoringRendererAttrs(
  props: SurfaceAuthoringViewProps,
): Record<string, string | undefined> {
  const variant = props.variant;
  const surfaceId = readStringAttr(props.node.attrs["id"]);
  const verticalPosition = readSurfaceVerticalPosition(
    props.node.attrs["settings"],
    props.definition,
  );
  return {
    "data-course-surface-node-view": "authoring",
    "data-definition": variant,
    "data-empty": props.isEmpty ? "true" : undefined,
    "data-id": surfaceId,
    "data-node": "surface",
    "data-surface": "",
    ...surfaceAuthoringFrameAttributes({ definition: variant, surfaceId }),
    ...(verticalPosition ? { "data-vertical-content-position": verticalPosition } : {}),
    ...surfaceRegionDataAttrs(props.node.attrs["settings"]),
    ...surfaceBackgroundDataAttrs(readSurfaceBackground(props.node.attrs["settings"])),
    ...(surfaceId ? { "data-surface-id": surfaceId } : {}),
    ...(variant ? { "data-surface-variant": variant } : {}),
  };
}

function readStringAttr(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
