import type { NodeViewRenderer } from "@tiptap/core";
import { NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";

import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import type { RegisteredLayoutDefinition } from "../model/layout-definition";
import type { LayoutRegistry } from "../model/layout-registry";
import type {
  LayoutRuntimeViewProps,
  RegisteredLayoutRuntimeView,
  SectionRuntimeViewProps,
} from "./layout-view-definition";
import type { LayoutRuntimeViewRegistry } from "./layout-view-registry";
import { LayoutRuntimeFrame, SectionRuntimeFrame } from "./layout-frames";

import "@/editor/frame/view/bounded-placement.css";

import "../shared/view/layout.css";

export function createLayoutRuntimeNodeView(
  definitions: LayoutRegistry,
  views: LayoutRuntimeViewRegistry,
): NodeViewRenderer {
  return ReactNodeViewRenderer(function LayoutRuntimeNodeView(props: NodeViewProps) {
    const isEmpty = isFieldContentEmpty(props.node);
    const definition = definitions.getForNode(props.node) ?? null;
    const runtimeView = views.getForNode(props.node) ?? null;
    const Component = runtimeView?.component ?? DefaultLayoutRuntimeContent;
    const layoutKind = definition?.id ?? readLayoutKind(props.node.attrs) ?? "layout";
    const viewProps: LayoutRuntimeViewProps = {
      ...props,
      runtimeView,
      isEmpty,
    };
    const frameClassName = !runtimeView ? "sc-layout-runtime" : undefined;

    return (
      <LayoutRuntimeFrame
        boundedPlacement={definition?.boundedPlacement}
        className={frameClassName}
        isEmpty={isEmpty}
        node={props.node}
        variant={layoutKind}
      >
        <Component {...viewProps} />
      </LayoutRuntimeFrame>
    );
  });
}

export function createSectionRuntimeNodeView(
  definitions: LayoutRegistry,
  views: LayoutRuntimeViewRegistry,
): NodeViewRenderer {
  return ReactNodeViewRenderer(function SectionRuntimeNodeView(props: NodeViewProps) {
    const isEmpty = isFieldContentEmpty(props.node);
    const layoutOwner = resolveOwningLayout(props, definitions, views);
    const Component = layoutOwner.runtimeView?.sectionComponent ?? DefaultSectionRuntimeContent;
    const variant = layoutOwner.definition?.id ?? layoutOwner.runtimeView?.id ?? "section";
    const viewProps: SectionRuntimeViewProps = {
      ...props,
      layoutRuntimeView: layoutOwner.runtimeView,
      layoutNode: layoutOwner.node,
      isEmpty,
    };
    const frameProps = layoutOwner.runtimeView?.sectionFrame?.(viewProps);

    return (
      <SectionRuntimeFrame
        className={frameProps?.className}
        isEmpty={isEmpty}
        node={props.node}
        variant={variant}
      >
        <Component {...viewProps} />
      </SectionRuntimeFrame>
    );
  });
}

function DefaultLayoutRuntimeContent() {
  return <NodeViewContent className="sc-layout-runtime__content" />;
}

function DefaultSectionRuntimeContent() {
  return (
    <NodeViewContent className="sc-layout-section__content sc-layout-section-runtime__content" />
  );
}

function resolveOwningLayout(
  props: NodeViewProps,
  definitions: LayoutRegistry,
  views: LayoutRuntimeViewRegistry,
): {
  definition: RegisteredLayoutDefinition | null;
  runtimeView: RegisteredLayoutRuntimeView | null;
  node: NodeViewProps["node"] | null;
} {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) {
      return { definition: null, runtimeView: null, node: null };
    }
    const resolved = props.editor.state.doc.resolve(pos);
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth);
      if (node.type.name !== "layout") continue;
      return {
        definition: definitions.getForNode(node) ?? null,
        runtimeView: views.getForNode(node) ?? null,
        node,
      };
    }
  } catch {
    return { definition: null, runtimeView: null, node: null };
  }

  return { definition: null, runtimeView: null, node: null };
}

function readLayoutKind(attrs: Record<string, unknown>): string | null {
  const variant = attrs["variant"];
  return typeof variant === "string" && variant.length > 0 ? variant : null;
}
