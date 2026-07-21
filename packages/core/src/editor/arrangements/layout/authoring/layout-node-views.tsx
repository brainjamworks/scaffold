import type { NodeViewRenderer } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { ReactNodeViewRenderer, useEditorState, type NodeViewProps } from "@tiptap/react";

import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { cn } from "@/lib/cn";

import type { LayoutComponentProps, SectionComponentProps } from "./layout-view-definition";
import {
  getLayoutKindFromAttrs,
  type RegisteredLayoutDefinition,
} from "../model/layout-definition";
import type { LayoutRegistry } from "../model/layout-registry";
import type { LayoutAuthoringViewRegistry } from "./layout-view-registry";
import { DefaultLayoutContent, DefaultSectionContent } from "./default-layout-content";
import { LayoutAuthoringFrame, SectionAuthoringFrame } from "./layout-frames";

import "../shared/view/layout.css";

export function createLayoutAuthoringNodeView(
  definitions: LayoutRegistry,
  views: LayoutAuthoringViewRegistry,
  blockDefinitions: BlockDefinitionLookup,
): NodeViewRenderer {
  return ReactNodeViewRenderer(function LayoutFactoryNodeView(props: NodeViewProps) {
    const editable = useNodeViewEditable(props);
    const isEmpty = isFieldContentEmpty(props.node);
    const definition = definitions.getForNode(props.node) ?? null;
    const variant = definition?.id ?? getLayoutKindFromAttrs(props.node.attrs) ?? "layout";
    const view = views.getForNode(props.node) ?? null;
    const View = view?.layout ?? DefaultLayoutContent;
    const viewProps: LayoutComponentProps = {
      ...props,
      blockDefinitions,
      definition,
      editable,
      isEmpty,
    };

    return (
      <LayoutAuthoringFrame
        editable={editable}
        editor={props.editor}
        getPos={props.getPos}
        isEmpty={isEmpty}
        layoutId={props.node.attrs["id"]}
        variant={variant}
        {...(definition?.boundedPlacement ? { boundedPlacement: definition.boundedPlacement } : {})}
        className={cn(
          !view && "sc-layout-authoring",
          !view && editable && isEmpty && "sc-layout-authoring--empty",
        )}
      >
        <View {...viewProps} />
      </LayoutAuthoringFrame>
    );
  });
}

export function createSectionAuthoringNodeView(
  definitions: LayoutRegistry,
  views: LayoutAuthoringViewRegistry,
  blockDefinitions: BlockDefinitionLookup,
): NodeViewRenderer {
  return ReactNodeViewRenderer(function SectionFactoryNodeView(props: NodeViewProps) {
    const editable = useNodeViewEditable(props);
    const isEmpty = isFieldContentEmpty(props.node);
    const layoutOwner = resolveOwningLayout(props, definitions);
    const variant =
      layoutOwner.definition?.id ??
      (layoutOwner.node ? getLayoutKindFromAttrs(layoutOwner.node.attrs) : null) ??
      "section";
    const view = layoutOwner.node ? (views.getForNode(layoutOwner.node) ?? null) : null;
    const View = view?.section ?? DefaultSectionContent;
    const viewProps: SectionComponentProps = {
      ...props,
      blockDefinitions,
      layoutDefinition: layoutOwner.definition,
      layoutNode: layoutOwner.node,
      editable,
      isEmpty,
    };
    const frameProps = view?.sectionFrame?.(viewProps);

    return (
      <SectionAuthoringFrame
        isEmpty={isEmpty}
        node={props.node}
        sectionId={props.node.attrs["id"]}
        variant={variant}
        className={
          frameProps?.className ??
          cn(!view && editable && isEmpty && "sc-layout-section-authoring--empty")
        }
      >
        <View {...viewProps} />
      </SectionAuthoringFrame>
    );
  });
}

function useNodeViewEditable(props: NodeViewProps): boolean {
  const editorEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });

  return editorEditable || props.editor.isEditable;
}

function resolveOwningLayout(
  props: NodeViewProps,
  definitions: LayoutRegistry,
): {
  definition: RegisteredLayoutDefinition | null;
  node: ProseMirrorNode | null;
} {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) {
      return { definition: null, node: null };
    }
    const resolved = props.editor.state.doc.resolve(pos);
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth);
      if (node.type.name !== "layout") continue;
      const definition = definitions.getForNode(node) ?? null;
      return {
        definition,
        node,
      };
    }
  } catch {
    return { definition: null, node: null };
  }

  return { definition: null, node: null };
}
