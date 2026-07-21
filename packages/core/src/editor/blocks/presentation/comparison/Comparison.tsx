import { TrashIcon as Trash } from "@phosphor-icons/react";
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { ComparisonDataSchema, type ComparisonData } from "@scaffold/contracts";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { COMPARISON_ROW_NODE, createComparisonRow, emptyComparisonData } from "./content";

import "./Comparison.css";

export interface ComparisonAddControlProps {
  className: string;
  label: string;
  onClick: (event: ReactMouseEvent) => void;
}

export type ComparisonAddControlRenderer = (props: ComparisonAddControlProps) => ReactNode;

export interface ComparisonViewProps extends NodeViewProps {
  renderAddControl?: ComparisonAddControlRenderer;
}

export function ComparisonView(props: ComparisonViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const data = parseComparisonData(props.node.attrs["data"]);
  const addRow = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = getNodePos(props);
    if (pos === null) return;
    const insertAt = pos + props.node.nodeSize - 1;
    props.editor
      .chain()
      .focus()
      .insertContentAt(insertAt, createComparisonRow(props.node.childCount))
      .run();
  };

  return (
    <Comparison
      editable={editable}
      options={data}
      footer={
        editable
          ? (props.renderAddControl?.({
              className: "sc-comparison__add",
              label: "Add row",
              onClick: addRow,
            }) ?? null)
          : null
      }
    >
      <NodeViewContent />
    </Comparison>
  );
}

export function ComparisonRowView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const rowIndex = useEditorState({
    editor: props.editor,
    selector: () => resolveRowIndex(props),
  });
  const rowCount = useEditorState({
    editor: props.editor,
    selector: () => resolveRowCount(props),
  });
  const canDelete = rowCount > 1;

  const deleteRow = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = getNodePos(props);
    if (!canDelete || pos === null) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== COMPARISON_ROW_NODE) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  return (
    <NodeViewWrapper
      data-node="comparison-row"
      data-comparison-row-index={rowIndex}
      className="sc-comparison__row"
    >
      <NodeViewContent />
      {editable ? (
        <button
          type="button"
          contentEditable={false}
          disabled={!canDelete}
          aria-label={`Delete comparison row ${rowIndex + 1}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={deleteRow}
          className="sc-comparison__row-delete"
        >
          <Trash size={14} aria-hidden />
        </button>
      ) : null}
    </NodeViewWrapper>
  );
}

export function ComparisonCellView(props: NodeViewProps) {
  const side = props.node.attrs["side"] === "right" ? "right" : "left";

  return (
    <NodeViewWrapper
      data-node="comparison-cell"
      data-comparison-side={side}
      className={`sc-comparison__cell sc-comparison__cell--${side}`}
    >
      <ComparisonCell>
        <NodeViewContent />
      </ComparisonCell>
    </NodeViewWrapper>
  );
}

export function Comparison({
  children,
  editable,
  footer,
  options,
}: {
  children: ReactNode;
  editable: boolean;
  footer?: ReactNode;
  options: ComparisonData;
}) {
  return (
    <div data-editable={editable ? "true" : undefined} className="sc-comparison__table">
      <div contentEditable={false} aria-hidden className="sc-comparison__header">
        <span className="sc-comparison__header-cell">{options.leftLabel}</span>
        <span className="sc-comparison__header-cell">{options.rightLabel}</span>
      </div>
      <div className="sc-comparison__body">{children}</div>
      {editable ? footer : null}
    </div>
  );
}

export function ComparisonCell({ children }: { children: ReactNode }) {
  return <div className="sc-comparison__cell-content">{children}</div>;
}

function parseComparisonData(value: unknown): ComparisonData {
  const parsed = ComparisonDataSchema.safeParse(value);
  return parsed.success ? parsed.data : emptyComparisonData();
}

function getNodePos(props: NodeViewProps): number | null {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return null;
    return typeof pos === "number" ? pos : null;
  } catch {
    return null;
  }
}

function resolveRowIndex(props: NodeViewProps): number {
  const pos = getNodePos(props);
  if (pos === null) return 0;
  try {
    return props.editor.state.doc.resolve(pos).index();
  } catch {
    return 0;
  }
}

function resolveRowCount(props: NodeViewProps): number {
  const pos = getNodePos(props);
  if (pos === null) return 0;
  try {
    const $pos = props.editor.state.doc.resolve(pos);
    return $pos.parent.childCount;
  } catch {
    return 0;
  }
}
