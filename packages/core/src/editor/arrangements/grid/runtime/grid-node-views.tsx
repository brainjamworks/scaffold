import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { CSSProperties } from "react";

import { boundedPlacementAttributes } from "@/editor/frame/model/bounded-placement";

import "@/editor/bounded-containers/view/bounded-container.css";
import "../view/grid.css";

import {
  isGridCellEmpty,
  isGridCellVerticalPosition,
  normalizeColumnWidths,
  type GridCellVerticalPosition,
} from "../model/grid-model";

export function GridRuntimeNodeView(props: NodeViewProps) {
  const columnWidths = normalizeColumnWidths(
    parseColumnWidths(props.node.attrs.columnWidths),
    props.node.childCount,
  );
  const style: CSSProperties | undefined = columnWidths.length
    ? {
        gridTemplateColumns: columnWidths.map((width) => `minmax(0, ${width}fr)`).join(" "),
      }
    : undefined;

  return (
    <NodeViewWrapper
      data-node="grid"
      data-definition="grid"
      {...boundedPlacementAttributes("fill")}
      data-id={props.node.attrs.id || undefined}
      className="sc-grid"
      style={style}
    >
      <NodeViewContent data-grid-column-content="" className="sc-grid__content" />
    </NodeViewWrapper>
  );
}

export function CellRuntimeNodeView(props: NodeViewProps) {
  const isEmpty = isGridCellEmpty(props.node);
  const verticalPosition = normalizeCellVerticalPosition(props.node.attrs.verticalPosition);

  return (
    <NodeViewWrapper
      data-node="cell"
      data-definition="cell"
      data-id={props.node.attrs.id || undefined}
      data-empty={isEmpty ? "true" : undefined}
      data-vertical-content-position={verticalPosition}
      className="sc-grid-cell"
    >
      <NodeViewContent data-bounded-viewport="scroll" className="sc-grid-cell__content" />
    </NodeViewWrapper>
  );
}

function parseColumnWidths(value: unknown): number[] {
  return Array.isArray(value) && value.every((width) => typeof width === "number") ? value : [];
}

function normalizeCellVerticalPosition(value: unknown): GridCellVerticalPosition {
  return isGridCellVerticalPosition(value) ? value : "top";
}
