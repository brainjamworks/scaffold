import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { TrashIcon as Trash } from "@phosphor-icons/react";
import { useId } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";

import { KEY_VALUE_ROW_KEY_NODE, KEY_VALUE_ROW_NODE, KEY_VALUE_ROW_VALUE_NODE } from "./content";
import { KeyValueListSurface } from "./KeyValueListSurface";
import "./KeyValueList.css";

/* ──────────────────────────────────────────────────────────────────
 * Parent
 * ────────────────────────────────────────────────────────────────── */

export interface KeyValueListAddControlProps {
  className: string;
  label: string;
  onClick: (event: ReactMouseEvent) => void;
}

export type KeyValueListAddControlRenderer = (props: KeyValueListAddControlProps) => ReactNode;

export interface KeyValueListViewProps extends NodeViewProps {
  renderAddControl?: KeyValueListAddControlRenderer;
}

export function KeyValueListView(props: KeyValueListViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const addRow = (event: ReactMouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = getNodePos(props);
    if (pos === null) return;
    /* Insert at the end of the parent: walk to the last child's end. */
    const insertAt = pos + props.node.nodeSize - 1;
    props.editor
      .chain()
      .insertContentAt(insertAt, {
        type: KEY_VALUE_ROW_NODE,
        attrs: { id: createEmbeddedNodeId() },
        content: [
          { type: KEY_VALUE_ROW_KEY_NODE, content: [{ type: "paragraph" }] },
          { type: KEY_VALUE_ROW_VALUE_NODE, content: [{ type: "paragraph" }] },
        ],
      })
      .run();
  };
  const trailing = editable
    ? (props.renderAddControl?.({
        className: "sc-app-key-value-list-add",
        label: "Add item",
        onClick: addRow,
      }) ?? null)
    : null;

  return <KeyValueListSurface node={props.node} trailing={trailing} />;
}

export function KeyValueRowNodeView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const { count, index } = useEditorState({
    editor: props.editor,
    selector: () => readRowPosition(props),
  });
  const canDelete = editable && count > 1;
  const deleteExplanationId = useId();

  const deleteRow = () => {
    const pos = getNodePos(props);
    if (!canDelete || pos === null) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== KEY_VALUE_ROW_NODE) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  return (
    <NodeViewWrapper
      as="div"
      role="listitem"
      data-node="key-value-row"
      className="sc-course-key-value-list__row"
    >
      <NodeViewContent as="div" />
      {editable ? (
        <button
          type="button"
          contentEditable={false}
          aria-disabled={!canDelete || undefined}
          aria-describedby={!canDelete ? deleteExplanationId : undefined}
          aria-label={`Delete item ${index}`}
          onClick={deleteRow}
          className="sc-app-key-value-list-delete"
        >
          <Trash size={14} aria-hidden />
          {!canDelete ? (
            <span id={deleteExplanationId} className="sc-app-key-value-list-delete__explanation">
              A key-value list must contain at least one item.
            </span>
          ) : null}
        </button>
      ) : null}
    </NodeViewWrapper>
  );
}

export function KeyValueRowKeyNodeView(props: NodeViewProps) {
  const keyId = readRowKeyId(props);

  return (
    <NodeViewWrapper
      as="div"
      role="term"
      id={keyId}
      data-slot="key-value-row-key"
      className="sc-course-key-value-list__key"
    >
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function KeyValueRowValueNodeView(props: NodeViewProps) {
  const keyId = readRowKeyId(props);

  return (
    <NodeViewWrapper
      as="div"
      role="definition"
      aria-labelledby={keyId}
      data-slot="key-value-row-value"
      className="sc-course-key-value-list__value"
    >
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────── */

function getNodePos(props: NodeViewProps): number | null {
  try {
    const pos = props.getPos();
    if (!isValidEditorDocPos(props.editor, pos)) return null;
    return typeof pos === "number" ? pos : null;
  } catch {
    return null;
  }
}

function readRowKeyId(props: NodeViewProps): string | undefined {
  const pos = getNodePos(props);
  if (pos === null) return undefined;
  const parent = props.editor.state.doc.resolve(pos).parent;
  if (parent.type.name !== KEY_VALUE_ROW_NODE) return undefined;

  const rowId = parent.attrs["id"];
  const source = typeof rowId === "string" && rowId.length > 0 ? rowId : String(pos);
  return `sc-key-value-key-${source.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

function readRowPosition(props: NodeViewProps): { count: number; index: number } {
  const pos = getNodePos(props);
  if (pos === null) return { count: 1, index: 1 };
  const $pos = props.editor.state.doc.resolve(pos);
  const parent = $pos.parent;
  const parentStart = $pos.start();
  let count = 0;
  let index = 1;
  parent.forEach((child, offset) => {
    if (child.type.name !== KEY_VALUE_ROW_NODE) return;
    count += 1;
    if (parentStart + offset <= pos) index = count;
  });
  return { count: Math.max(count, 1), index };
}
