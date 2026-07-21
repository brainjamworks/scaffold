import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import { isFieldContentEmpty } from "@/document/model/content-model/is-field-content-empty";
import {
  authoringChromeActiveAttributes,
  structuralAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { shouldRenderAuthoringChrome } from "@/editor/interactions/dom/authoring-chrome";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import { resolveStructuralChromeTargetFromSnapshot } from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { cn } from "@/lib/cn";

import { createRegionNode } from "../../model/nodes/region-node";
import { readRegionVerticalPosition } from "../../model/region-vertical-position";
import "./region-authoring.css";

export const RegionAuthoringNode = createRegionNode({
  addNodeView: () => ReactNodeViewRenderer(RegionAuthoringNodeView),
});

function RegionAuthoringNodeView(props: NodeViewProps) {
  const editable =
    useEditorState({
      editor: props.editor,
      selector: ({ editor }) => editor.isEditable,
    }) || props.editor.isEditable;
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
        pos !== null && outline?.kind === InteractionTargetKind.Region && outline.pos === pos,
      );
    },
  });

  return (
    <NodeViewWrapper
      data-empty={isFieldContentEmpty(props.node) ? "true" : undefined}
      data-region-role={String(props.node.attrs["role"] ?? "main")}
      data-vertical-content-position={readRegionVerticalPosition(props.node)}
      {...structuralAuthoringFrameAttributes({
        id: props.node.attrs["id"],
        nodeType: "region",
        frameKind: "region",
      })}
      {...authoringChromeActiveAttributes(chromeActive)}
      className={cn(
        "sc-region",
        "sc-region-authoring",
        editable && "sc-region-authoring--editable",
      )}
    >
      <NodeViewContent className="sc-region__content" />
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
