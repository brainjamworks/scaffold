import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { PlusIcon as Plus, TrashIcon as Trash } from "@phosphor-icons/react";

import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { StructureMovementHandle } from "@/editor/drag/view/StructureMovementHandle";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { createStableId } from "@/document/model/identity/stable-ids";

import { parseChecklistData, countChecklistItems } from "./ChecklistModel";
import { ChecklistSection } from "./ChecklistSurface";
import { CHECKLIST_ITEM_NODE, CHECKLIST_NODE, checklistItemContent } from "./content";
import "./Checklist.css";

/* ──────────────────────────────────────────────────────────────────
 * Parent block
 * ────────────────────────────────────────────────────────────────── */

export function ChecklistAuthoringView(props: NodeViewProps) {
  const data = parseChecklistData(props.node.attrs["data"]);
  const total = countChecklistItems(props.node);

  const addItem = () => {
    const pos = readNodePos(props);
    if (!isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== CHECKLIST_NODE) return;

    props.editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize - 1, {
        type: CHECKLIST_ITEM_NODE,
        attrs: { id: createStableId() },
        content: checklistItemContent(),
      })
      .run();
  };

  const showProgress = data.showProgress && total > 0;
  const addGhost = (
    <li className="sc-checklist-item sc-checklist-item--ghost" contentEditable={false}>
      <BlockAddGhost
        label="Add item"
        presentation="row"
        onClick={addItem}
        className="sc-checklist__add"
      >
        <span aria-hidden className="sc-checklist-item__drag-placeholder" />
        <span aria-hidden className="sc-ghost-add__icon">
          <Plus size={12} weight="bold" />
        </span>
        <span className="sc-checklist__add-label">Add item</span>
      </BlockAddGhost>
    </li>
  );

  return (
    <ChecklistSection progress={showProgress ? { completed: 0, total } : null} listEnd={addGhost}>
      <NodeViewContent />
    </ChecklistSection>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Item view
 * ────────────────────────────────────────────────────────────────── */

export function ChecklistItemNodeView(props: NodeViewProps) {
  const { count, index } = readChecklistItemPosition(props);
  const canDelete = count > 1;

  const deleteItem = () => {
    const pos = readNodePos(props);
    if (!canDelete || !isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== CHECKLIST_ITEM_NODE) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  const itemPos = readNodePos(props);
  const sourcePos = typeof itemPos === "number" && Number.isFinite(itemPos) ? itemPos : null;

  return (
    <NodeViewWrapper
      data-node="checklist-item"
      data-checked="false"
      role="listitem"
      className="sc-checklist-item"
    >
      <div className="sc-checklist-item__shell">
        <StructureMovementHandle
          label="checklist item"
          sourcePos={sourcePos}
          variant="bare"
          className="sc-checklist-item__drag"
        />
        <button
          type="button"
          role="checkbox"
          aria-checked={false}
          contentEditable={false}
          onMouseDown={(event) => event.preventDefault()}
          disabled
          aria-disabled
          className="sc-checklist-item__checkbox"
          aria-label="Checklist item completion is available at runtime"
        />
        <div className="sc-checklist-item__text">
          <NodeViewContent />
        </div>
        <button
          type="button"
          contentEditable={false}
          disabled={!canDelete}
          aria-label={`Delete checklist item ${index}`}
          onClick={deleteItem}
          className="sc-checklist-item__delete"
        >
          <Trash size={13} aria-hidden />
        </button>
      </div>
    </NodeViewWrapper>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────── */

function readNodePos(props: NodeViewProps): number | undefined {
  try {
    return props.getPos();
  } catch {
    return undefined;
  }
}

function readChecklistItemPosition(props: NodeViewProps): {
  count: number;
  index: number;
} {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return { count: 1, index: 1 };

  const $pos = props.editor.state.doc.resolve(pos);
  const parent = $pos.parent;
  const parentStart = $pos.start();
  let count = 0;
  let index = 1;

  parent.forEach((child, offset) => {
    if (child.type.name !== CHECKLIST_ITEM_NODE) return;
    count += 1;
    if (parentStart + offset <= pos) {
      index = count;
    }
  });

  return { count: Math.max(count, 1), index };
}
