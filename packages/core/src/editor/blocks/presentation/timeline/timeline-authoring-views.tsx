import { TrashIcon as Trash } from "@phosphor-icons/react";
import type { TimelineAlignment } from "@scaffold/contracts";
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { CONTAINED_MOVEMENT_TARGET_ATTR } from "@/editor/drag/view/movement-dom";
import { ContainedMovementHandle } from "@/editor/drag/view/ContainedMovementHandle";
import { createStableId } from "@/document/model/identity/stable-ids";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

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
  const itemId = readRequiredTimelineNodeId(props.node.attrs["id"], "timeline item");
  const itemIndex = useEditorState({
    editor: props.editor,
    selector: () => resolveTimelineItemIndex(props),
  });
  const itemCount = useEditorState({
    editor: props.editor,
    selector: () => resolveTimelineItemCount(props),
  });
  const side = itemIndex % 2 === 0 ? "left" : "right";
  const itemPos = readNodePos(props);
  const sourcePos = typeof itemPos === "number" && Number.isFinite(itemPos) ? itemPos : null;
  const canDelete = itemCount > 1;

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
      data-node="timeline-item"
      data-timeline-side={side}
      data-timeline-event=""
      {...{ [CONTAINED_MOVEMENT_TARGET_ATTR]: "" }}
      className={`sc-timeline__event sc-timeline__event--${side}`}
    >
      <TimelineEventCard
        chrome={
          <>
            <ContainedMovementHandle
              label="timeline event"
              sourcePos={sourcePos}
              getSourcePos={() => readNodePos(props) ?? null}
              sourceKey={itemId}
              className="sc-timeline__movement"
            />
            <button
              type="button"
              contentEditable={false}
              disabled={!canDelete}
              aria-label={`Delete timeline event ${itemIndex + 1}`}
              onClick={deleteItem}
              className="sc-timeline__action sc-timeline__delete"
            >
              <Trash size={14} aria-hidden />
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
    <div
      className={`sc-timeline__event sc-timeline__event--ghost sc-timeline__event--${side}`}
      data-timeline-side={side}
    >
      <span aria-hidden className="sc-timeline__dot sc-timeline__dot--ghost" />
      <BlockAddGhost
        label="Add event"
        presentation="tile"
        contentEditable={false}
        onClick={addItem}
        className="sc-timeline__add"
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
