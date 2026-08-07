import { TrashIcon as Trash } from "@phosphor-icons/react";
import type { TimelineAlignment } from "@scaffold/contracts";
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { useId, useRef } from "react";

import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { containedMovementTargetAttributes } from "@/editor/movement/view/movement-dom";
import { ContainedMovementHandle } from "@/editor/movement/view/ContainedMovementHandle";
import { authoringMovementSnapshotChromeAttributes } from "@/editor/movement/view/authoring-movement-presentation";
import { createStableId } from "@/document/model/identity/stable-ids";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import type { MovementTargetAxis } from "@/editor/movement/model/movement-target";

import { TIMELINE_ITEM_NODE, TIMELINE_NODE, createTimelineItem } from "./content";
import { TimelineView } from "./Timeline";
import { parseTimelineData } from "./TimelineModel";
import {
  TimelineEventCard,
  readRequiredTimelineNodeId,
  type TimelineOptions,
} from "./timeline-components";

export function TimelineAuthoringView(props: NodeViewProps) {
  const data = parseTimelineData(props.node.attrs["data"]);
  const addGhost = (
    <TimelineAddGhost
      editor={props.editor}
      getPos={props.getPos}
      options={data}
      itemCount={props.node.childCount}
    />
  );

  return <TimelineView props={props} footer={addGhost} />;
}

export function TimelineItemAuthoringView(props: NodeViewProps) {
  const presentationRef = useRef<HTMLDivElement | null>(null);
  const itemId = readRequiredTimelineNodeId(props.node.attrs["id"], "timeline item");
  const itemIndex = useEditorState({
    editor: props.editor,
    selector: () => resolveTimelineItemIndex(props),
  });
  const itemCount = useEditorState({
    editor: props.editor,
    selector: () => resolveTimelineItemCount(props),
  });
  const movementAxis = useEditorState({
    editor: props.editor,
    selector: () => resolveTimelineMovementAxis(props),
  });
  const side = itemIndex % 2 === 0 ? "left" : "right";
  const itemPos = readNodePos(props);
  const sourcePos = typeof itemPos === "number" && Number.isFinite(itemPos) ? itemPos : null;
  const canDelete = itemCount > 1;
  const deleteExplanationId = useId();

  const deleteItem = () => {
    const pos = readNodePos(props);
    if (!canDelete || !isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== TIMELINE_ITEM_NODE) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  return (
    <NodeViewWrapper
      as="li"
      ref={presentationRef}
      data-node="timeline-item"
      data-timeline-side={side}
      data-timeline-event=""
      {...containedMovementTargetAttributes(movementAxis)}
      className={`sc-course-timeline__event sc-course-timeline__event--${side}`}
    >
      <TimelineEventCard
        chrome={
          <>
            <ContainedMovementHandle
              axis={movementAxis}
              getPresentationElement={() => presentationRef.current}
              label="timeline event"
              sourcePos={sourcePos}
              getSourcePos={() => readNodePos(props) ?? null}
              sourceKey={itemId}
              className="sc-app-timeline-movement"
            />
            <button
              {...authoringMovementSnapshotChromeAttributes()}
              type="button"
              contentEditable={false}
              aria-disabled={!canDelete || undefined}
              aria-describedby={!canDelete ? deleteExplanationId : undefined}
              aria-label={`Delete timeline event ${itemIndex + 1}`}
              onClick={deleteItem}
              className="sc-app-timeline-delete sc-course-timeline__delete"
            >
              <Trash size={14} aria-hidden />
              {!canDelete ? (
                <span id={deleteExplanationId} className="sc-app-timeline-delete__explanation">
                  A timeline must contain at least one event.
                </span>
              ) : null}
            </button>
          </>
        }
      >
        <NodeViewContent />
      </TimelineEventCard>
    </NodeViewWrapper>
  );
}

function TimelineAddGhost({
  editor,
  getPos,
  itemCount,
  options,
}: {
  editor: NodeViewProps["editor"];
  getPos: NodeViewProps["getPos"];
  itemCount: number;
  options: TimelineOptions;
}) {
  const side = resolveGhostSide(itemCount, options.alignment);
  const addItem = () => {
    const pos = readNodeViewPos(getPos);
    if (!isValidEditorDocPos(editor, pos)) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== TIMELINE_NODE) return;

    editor
      .chain()
      .focus()
      .insertContentAt(pos + node.nodeSize - 1, {
        ...createTimelineItem(itemCount),
        attrs: { id: createStableId() },
      })
      .run();
  };

  return (
    <div className="sc-app-timeline-add-row" data-timeline-side={side}>
      <span aria-hidden className="sc-app-timeline-add-dot" />
      <BlockAddGhost
        label="Add event"
        presentation="tile"
        contentEditable={false}
        onClick={addItem}
        className="sc-app-timeline-add"
      />
    </div>
  );
}

function resolveGhostSide(childCount: number, alignment: TimelineAlignment): "left" | "right" {
  if (alignment === "left") return "left";
  if (alignment === "right") return "right";
  return childCount % 2 === 0 ? "left" : "right";
}

function readNodeViewPos(getPos: NodeViewProps["getPos"]): number | undefined {
  if (typeof getPos !== "function") return undefined;

  try {
    const pos = getPos();
    return typeof pos === "number" && Number.isFinite(pos) ? pos : undefined;
  } catch {
    return undefined;
  }
}

function readNodePos(props: NodeViewProps): number | undefined {
  return readNodeViewPos(props.getPos);
}

function resolveTimelineItemIndex(props: NodeViewProps): number {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return 0;
  const $pos = props.editor.state.doc.resolve(pos);
  return $pos.index();
}

function resolveTimelineItemCount(props: NodeViewProps): number {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return 1;
  const $pos = props.editor.state.doc.resolve(pos);
  return Math.max($pos.parent.childCount, 1);
}

function resolveTimelineMovementAxis(props: NodeViewProps): MovementTargetAxis {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return "vertical";
  const parent = props.editor.state.doc.resolve(pos).parent;
  return parseTimelineData(parent.attrs["data"]).presentation === "carousel"
    ? "horizontal"
    : "vertical";
}
