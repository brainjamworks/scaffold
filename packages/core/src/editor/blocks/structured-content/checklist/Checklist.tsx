import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { PlusIcon as Plus, TrashIcon as Trash } from "@phosphor-icons/react";
import { useId, useMemo, useRef } from "react";

import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { ContainedMovementHandle } from "@/editor/movement/view/ContainedMovementHandle";
import { containedMovementTargetAttributes } from "@/editor/movement/view/movement-dom";
import {
  authoringMovementSilhouetteSurfaceAttributes,
  authoringMovementSnapshotChromeAttributes,
} from "@/editor/movement/view/authoring-movement-presentation";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { CourseCompletionCheckbox } from "@/ui/components/course/CourseInputs/CourseInputs";

import { parseChecklistData, countChecklistItems } from "./ChecklistModel";
import { ChecklistSection } from "./ChecklistSurface";
import { CHECKLIST_ITEM_NODE, CHECKLIST_NODE, checklistItemContent } from "./content";
import { createChecklistAuthoringReorderProjection } from "./checklist-authoring-reorder-projection";
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
        attrs: { id: createEmbeddedNodeId() },
        content: checklistItemContent(),
      })
      .run();
  };

  const showProgress = data.showProgress && total > 0;
  const addGhost = (
    <li className="sc-course-checklist__item sc-app-checklist-add-row" contentEditable={false}>
      <BlockAddGhost
        label="Add item"
        presentation="item"
        onClick={addItem}
        className="sc-app-checklist-add"
      >
        <span aria-hidden className="sc-app-checklist-add__drag-placeholder" />
        <span aria-hidden className="sc-app-checklist-add__checkbox">
          <Plus size={12} weight="bold" />
        </span>
        <span className="sc-app-checklist-add__label">Add item</span>
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
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const reorderProjection = useMemo(
    () => createChecklistAuthoringReorderProjection(() => presentationRef.current),
    [],
  );
  const { count, index } = readChecklistItemPosition(props);
  const canDelete = count > 1;
  const deleteExplanationId = useId();

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
  const itemId = props.node.attrs["id"];
  const sourceKey = typeof itemId === "string" && itemId.length > 0 ? itemId : sourcePos;

  return (
    <NodeViewWrapper
      ref={presentationRef}
      data-node="checklist-item"
      data-checked="false"
      {...containedMovementTargetAttributes()}
      role="listitem"
      className="sc-course-checklist__item"
    >
      <div
        {...authoringMovementSilhouetteSurfaceAttributes()}
        className="sc-course-checklist__item-shell sc-app-checklist-item-shell"
      >
        <ContainedMovementHandle
          getPresentationElement={() => presentationRef.current}
          getSourcePos={() => readNodePos(props) ?? null}
          label="checklist item"
          projection={reorderProjection}
          sourceKey={sourceKey}
          sourcePos={sourcePos}
          className="sc-app-checklist-item-drag"
        />
        <span
          {...authoringMovementSilhouetteSurfaceAttributes()}
          className="sc-course-checklist__control-slot"
        >
          <CourseCompletionCheckbox
            checked={false}
            contentEditable={false}
            onMouseDown={(event) => event.preventDefault()}
            disabled
            aria-disabled
            className="sc-course-checklist__checkbox"
            aria-label="Checklist item completion is available at runtime"
          />
        </span>
        <div className="sc-course-checklist__item-text">
          <NodeViewContent />
        </div>
        <span className="sc-app-checklist-item-action-slot">
          <button
            {...authoringMovementSnapshotChromeAttributes()}
            type="button"
            contentEditable={false}
            aria-disabled={!canDelete || undefined}
            aria-describedby={!canDelete ? deleteExplanationId : undefined}
            aria-label={`Delete checklist item ${index}`}
            onClick={deleteItem}
            className="sc-app-checklist-item-delete sc-course-checklist__delete"
          >
            <Trash size={13} aria-hidden />
            {!canDelete ? (
              <span id={deleteExplanationId} className="sc-app-checklist-item-delete__explanation">
                A checklist must contain at least one item.
              </span>
            ) : null}
          </button>
        </span>
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
