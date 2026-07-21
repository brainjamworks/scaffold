import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { createStableId } from "@/document/model/identity/stable-ids";

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
        attrs: { id: createStableId() },
        content: [
          { type: KEY_VALUE_ROW_KEY_NODE, content: [{ type: "paragraph" }] },
          { type: KEY_VALUE_ROW_VALUE_NODE, content: [{ type: "paragraph" }] },
        ],
      })
      .run();
  };
  const trailing = editable
    ? (props.renderAddControl?.({
        className: "sc-key-value-list__add",
        label: "Add item",
        onClick: addRow,
      }) ?? null)
    : null;

  return <KeyValueListSurface node={props.node} trailing={trailing} />;
}

/* ──────────────────────────────────────────────────────────────────
 * Row (renders <div> wrapping the two slots; layout-aware via the
 * parent's data-layout attribute on the closest ancestor).
 * ────────────────────────────────────────────────────────────────── */

export function KeyValueRowNodeView() {
  return (
    <NodeViewWrapper data-slot="key-value-row" className="sc-key-value-list__row">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Key slot (plain paragraph rendered as <dt>).
 * ────────────────────────────────────────────────────────────────── */

export function KeyValueRowKeyNodeView() {
  return (
    <NodeViewWrapper data-slot="key-value-row-key" className="sc-key-value-list__key">
      <NodeViewContent />
    </NodeViewWrapper>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Value slot (rich paragraph rendered as <dd>).
 * ────────────────────────────────────────────────────────────────── */

export function KeyValueRowValueNodeView() {
  return (
    <NodeViewWrapper data-slot="key-value-row-value" className="sc-key-value-list__value">
      <NodeViewContent />
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
