import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
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

export function KeyValueRowNodeView() {
  return (
    <NodeViewWrapper as="div" data-node="key-value-row" className="sc-course-key-value-list__row">
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function KeyValueRowKeyNodeView() {
  return (
    <NodeViewWrapper
      as="dt"
      data-slot="key-value-row-key"
      className="sc-course-key-value-list__key"
    >
      <NodeViewContent as="div" />
    </NodeViewWrapper>
  );
}

export function KeyValueRowValueNodeView() {
  return (
    <NodeViewWrapper
      as="dd"
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
