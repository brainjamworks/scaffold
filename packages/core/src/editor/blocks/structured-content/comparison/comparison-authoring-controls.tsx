import { TrashIcon as Trash } from "@phosphor-icons/react";
import { NodeViewContent, useEditorState, type NodeViewProps } from "@tiptap/react";
import { useId, type MouseEvent as ReactMouseEvent } from "react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";

import { ComparisonRow, ComparisonSurface, parseComparisonData } from "./Comparison";
import { COMPARISON_ROW_NODE, createComparisonRow } from "./content";

export function ComparisonAuthoringView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });

  const addRow = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = readNodePos(props);
    if (pos === null) return;
    const insertAt = pos + props.node.nodeSize - 1;
    props.editor
      .chain()
      .focus()
      .insertContentAt(insertAt, createComparisonRow(props.node.childCount))
      .run();
  };

  return (
    <ComparisonSurface
      comparisonId={readComparisonId(props.node.attrs["id"])}
      options={parseComparisonData(props.node.attrs["data"])}
      trailing={
        editable ? (
          <BlockAddGhost
            label="Add row"
            presentation="tile"
            onClick={addRow}
            contentEditable={false}
            className="sc-app-comparison-add"
          />
        ) : null
      }
    >
      <NodeViewContent />
    </ComparisonSurface>
  );
}

export function ComparisonRowAuthoringView(props: NodeViewProps) {
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
  const deleteExplanationId = useId();

  const deleteRow = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = readNodePos(props);
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
    <ComparisonRow
      trailing={
        editable ? (
          <button
            type="button"
            contentEditable={false}
            aria-disabled={!canDelete || undefined}
            aria-describedby={!canDelete ? deleteExplanationId : undefined}
            aria-label={`Delete comparison row ${rowIndex + 1}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={deleteRow}
            className="sc-app-comparison-delete sc-course-comparison__delete"
          >
            <Trash size={14} aria-hidden />
            {!canDelete ? (
              <span id={deleteExplanationId} className="sc-app-comparison-delete__explanation">
                A comparison must contain at least one row.
              </span>
            ) : null}
          </button>
        ) : null
      }
    >
      <NodeViewContent />
    </ComparisonRow>
  );
}

function readNodePos(props: NodeViewProps): number | null {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return null;
    return typeof pos === "number" ? pos : null;
  } catch {
    return null;
  }
}

function resolveRowIndex(props: NodeViewProps): number {
  const pos = readNodePos(props);
  if (pos === null) return 0;
  try {
    return props.editor.state.doc.resolve(pos).index();
  } catch {
    return 0;
  }
}

function resolveRowCount(props: NodeViewProps): number {
  const pos = readNodePos(props);
  if (pos === null) return 0;
  try {
    return props.editor.state.doc.resolve(pos).parent.childCount;
  } catch {
    return 0;
  }
}

function readComparisonId(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "comparison";
}
