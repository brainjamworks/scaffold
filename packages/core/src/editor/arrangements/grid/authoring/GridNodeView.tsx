import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useState, type CSSProperties } from "react";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { boundedPlacementAttributes } from "@/editor/frame/model/bounded-placement";
import {
  authoringChromeActiveAttributes,
  structuralAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";
import { shouldRenderAuthoringChrome } from "@/editor/interactions/dom/authoring-chrome";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { cn } from "@/lib/cn";

import { GridColumnControls } from "./GridColumnControls";
import { resolveGridChromeState } from "./grid-chrome-state";
import { resizeGridColumnsAt } from "../model/grid-commands";
import { normalizeColumnWidths } from "../model/grid-model";

import "../view/grid.css";
import "./grid-authoring.css";

interface GridNodeViewProps extends NodeViewProps {
  blockDefinitions: BlockDefinitionLookup;
  node: NodeViewProps["node"];
}

export function GridNodeView(props: GridNodeViewProps) {
  const [selectionActive, setSelectionActive] = useState(() => props.editor.view.hasFocus());
  const editorEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const editable = editorEditable || props.editor.isEditable;
  const chromeState = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      const pos = typeof props.getPos === "function" ? (safeGetPos(props.getPos) ?? null) : null;
      return resolveGridChromeState(editor.state, pos, props.blockDefinitions, {
        selectionActive,
      });
    },
  });
  const showGridOutline =
    editable && shouldRenderAuthoringChrome(props.editor.view.dom, chromeState.outlineActive);
  const columnWidths = normalizeColumnWidths(
    parseColumnWidths(props.node.attrs.columnWidths),
    props.node.childCount,
  );
  const controlledColumnIds = Array.from({ length: props.node.childCount }, (_, index) =>
    gridCellDomId(props.node.child(index).attrs.id),
  );
  const style: CSSProperties | undefined = columnWidths.length
    ? {
        gridTemplateColumns: columnWidths.map((width) => `minmax(0, ${width}fr)`).join(" "),
      }
    : undefined;

  useEffect(() => {
    const updateSelectionActive = () => {
      setSelectionActive(props.editor.view.hasFocus());
    };

    props.editor.on("focus", updateSelectionActive);
    props.editor.on("blur", updateSelectionActive);
    document.addEventListener("focusin", updateSelectionActive, true);
    document.addEventListener("focusout", updateSelectionActive, true);

    return () => {
      props.editor.off("focus", updateSelectionActive);
      props.editor.off("blur", updateSelectionActive);
      document.removeEventListener("focusin", updateSelectionActive, true);
      document.removeEventListener("focusout", updateSelectionActive, true);
    };
  }, [props.editor]);

  return (
    <NodeViewWrapper
      {...structuralAuthoringFrameAttributes({
        id: props.node.attrs.id,
        nodeType: "grid",
        frameKind: "grid",
      })}
      {...boundedPlacementAttributes("fill")}
      {...authoringChromeActiveAttributes(showGridOutline)}
      className={cn(
        "sc-grid",
        "sc-app-grid-authoring",
        editable && "sc-app-grid-authoring--editable",
      )}
      style={style}
    >
      <GridColumnControls
        columnWidths={columnWidths}
        controlledColumnIds={controlledColumnIds}
        editable={editable}
        onCommitResize={(leftColumnIndex, delta) => {
          const pos =
            typeof props.getPos === "function" ? (safeGetPos(props.getPos) ?? null) : null;
          if (pos === null) return false;
          return resizeGridColumnsAt(props.editor, pos, leftColumnIndex, delta);
        }}
      />
      <NodeViewContent data-grid-column-content="" className="sc-grid__content" />
    </NodeViewWrapper>
  );
}

function parseColumnWidths(value: unknown): number[] {
  return Array.isArray(value) && value.every((width) => typeof width === "number") ? value : [];
}

function gridCellDomId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? `sc-grid-cell-${value}` : undefined;
}
