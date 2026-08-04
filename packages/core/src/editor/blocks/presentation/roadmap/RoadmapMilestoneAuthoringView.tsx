import { TrashIcon as Trash } from "@phosphor-icons/react";
import type { RoadmapMilestoneStatus } from "@scaffold/contracts";
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { useId } from "react";

import { CONTAINED_MOVEMENT_TARGET_ATTR } from "@/editor/drag/view/movement-dom";
import { ContainedMovementHandle } from "@/editor/drag/view/ContainedMovementHandle";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { ROADMAP_MILESTONE_NODE } from "./content";
import { parseRoadmapData } from "./RoadmapModel";
import {
  courseStateForRoadmapStatus,
  readRequiredRoadmapMilestoneId,
  readMilestonePosition,
  readMilestoneStatus,
  readNodePos,
  roadmapMarkerClassName,
  roadmapStatusLabel,
  renderRoadmapTileContent,
  resolveRoadmapDataAttribute,
} from "./roadmap-view-helpers";

const STATUS_LABELS: Record<RoadmapMilestoneStatus, string> = {
  upcoming: "available",
  current: "current",
  done: "completed",
};

function nextMilestoneStatus(current: RoadmapMilestoneStatus): RoadmapMilestoneStatus {
  if (current === "upcoming") return "current";
  if (current === "current") return "done";
  return "upcoming";
}

export function RoadmapMilestoneAuthoringView(props: NodeViewProps) {
  const editable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });
  const { count, index } = readMilestonePosition(props);
  const roadmapDataAttribute = useEditorState({
    editor: props.editor,
    selector: () => resolveRoadmapDataAttribute(props),
  });
  const roadmapData = parseRoadmapData(roadmapDataAttribute);
  const status = readMilestoneStatus(props.node);
  const courseState = courseStateForRoadmapStatus(status);
  const milestoneId = readRequiredRoadmapMilestoneId(props.node.attrs["id"]);
  const milestonePos = readNodePos(props);
  const sourcePos = typeof milestonePos === "number" ? milestonePos : null;
  const canDelete = editable && count > 1;
  const deleteExplanationId = useId();

  const cycleStatus = () => {
    if (!editable) return;
    props.updateAttributes({ status: nextMilestoneStatus(status) });
  };
  const deleteMilestone = () => {
    const pos = readNodePos(props);
    if (!canDelete || !isValidEditorDocPos(props.editor, pos)) return;
    const node = props.editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== ROADMAP_MILESTONE_NODE) return;
    props.editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .run();
  };

  return (
    <NodeViewWrapper
      as="li"
      data-node="roadmap-milestone"
      aria-current={status === "current" ? "step" : undefined}
      {...{ [CONTAINED_MOVEMENT_TARGET_ATTR]: "" }}
      className="sc-course-roadmap__milestone"
    >
      <div className="sc-course-roadmap__milestone-shell">
        {editable ? (
          <div contentEditable={false} className="sc-app-roadmap-milestone-chrome">
            <ContainedMovementHandle
              label="roadmap milestone"
              sourcePos={sourcePos}
              getSourcePos={() => readNodePos(props) ?? null}
              sourceKey={milestoneId}
              className="sc-app-roadmap-movement"
            />
            <button
              type="button"
              aria-disabled={!canDelete || undefined}
              aria-describedby={!canDelete ? deleteExplanationId : undefined}
              aria-label={`Delete milestone ${index}`}
              onClick={deleteMilestone}
              className="sc-app-roadmap-delete"
            >
              <Trash size={14} aria-hidden />
              {!canDelete ? (
                <span id={deleteExplanationId} className="sc-app-roadmap-delete__explanation">
                  A Roadmap requires at least one milestone.
                </span>
              ) : null}
            </button>
          </div>
        ) : null}
        {editable ? (
          <button
            type="button"
            contentEditable={false}
            data-status={status}
            data-course-state={courseState}
            aria-label={`Set milestone ${index} status. Current: ${STATUS_LABELS[status]}.`}
            onClick={cycleStatus}
            onMouseDown={(event) => event.preventDefault()}
            className={`${roadmapMarkerClassName(status)} sc-app-roadmap-status`}
          >
            {renderRoadmapTileContent(status, index, roadmapData)}
          </button>
        ) : (
          <span
            contentEditable={false}
            data-status={status}
            data-course-state={courseState}
            className={roadmapMarkerClassName(status)}
          >
            <span aria-hidden className="sc-course-roadmap__marker-visual">
              {renderRoadmapTileContent(status, index, roadmapData)}
            </span>
            <span className="sc-course-roadmap__runtime-status sc-sr-only">
              {roadmapStatusLabel(status, index)}
            </span>
          </span>
        )}
        <div className="sc-course-roadmap__content">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
