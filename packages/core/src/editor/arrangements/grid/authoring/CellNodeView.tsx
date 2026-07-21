import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  authoringChromeActiveAttributes,
  structuralAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { shouldRenderAuthoringChrome } from "@/editor/interactions/dom/authoring-chrome";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { cn } from "@/lib/cn";

import { isGridCellChromeActive } from "./grid-chrome-state";
import {
  isGridCellEmpty,
  isGridCellVerticalPosition,
  type GridCellVerticalPosition,
} from "../model/grid-model";

import "@/editor/bounded-containers/view/bounded-container.css";

interface CellNodeViewProps extends NodeViewProps {
  blockDefinitions: BlockDefinitionLookup;
}

export function CellNodeView(props: CellNodeViewProps) {
  const editorEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const editable = editorEditable || props.editor.isEditable;
  const isEmpty = isGridCellEmpty(props.node);
  const verticalPosition = normalizeCellVerticalPosition(props.node.attrs.verticalPosition);
  const cellChromeActive = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const pos = typeof props.getPos === "function" ? (safeGetPos(props.getPos) ?? null) : null;
      return shouldRenderAuthoringChrome(
        editor.view.dom,
        isGridCellChromeActive(editor.state, pos, props.blockDefinitions),
      );
    },
  });

  return (
    <NodeViewWrapper
      data-empty={isEmpty ? "true" : undefined}
      data-vertical-content-position={verticalPosition}
      {...structuralAuthoringFrameAttributes({
        id: props.node.attrs.id,
        nodeType: "cell",
        frameKind: "cell",
      })}
      {...authoringChromeActiveAttributes(cellChromeActive)}
      className={cn("sc-grid-cell-authoring", editable && "sc-grid-cell-authoring--editable")}
    >
      <NodeViewContent data-bounded-viewport="scroll" className="sc-grid-cell-authoring__content" />
    </NodeViewWrapper>
  );
}

function normalizeCellVerticalPosition(value: unknown): GridCellVerticalPosition {
  return isGridCellVerticalPosition(value) ? value : "top";
}
