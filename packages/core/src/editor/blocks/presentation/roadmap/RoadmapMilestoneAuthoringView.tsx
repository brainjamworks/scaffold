import { TrashIcon as Trash } from "@phosphor-icons/react";
import type { RoadmapData, RoadmapMilestoneStatus } from "@scaffold/contracts";
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import { useId, useMemo, useRef } from "react";

import { containedMovementTargetAttributes } from "@/editor/movement/view/movement-dom";
import { ContainedMovementHandle } from "@/editor/movement/view/ContainedMovementHandle";
import {
  authoringMovementSilhouetteSurfaceAttributes,
  authoringMovementSnapshotChromeAttributes,
} from "@/editor/movement/view/authoring-movement-presentation";
import { IconPicker } from "@/editor/media/authoring/icon-picker/IconPicker";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { IconRenderer } from "@/ui/icons/IconRenderer";

import { ROADMAP_MILESTONE_NODE, ROADMAP_NODE } from "./content";
import { normalizeRoadmapData, parseRoadmapData } from "./RoadmapModel";
import { createRoadmapAuthoringReorderProjection } from "./roadmap-authoring-reorder-projection";
import {
  MARKER_ICON_FALLBACK,
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
  const presentationRef = useRef<HTMLDivElement | null>(null);
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
  const reorderProjection = useMemo(
    () =>
      createRoadmapAuthoringReorderProjection(
        () => presentationRef.current,
        roadmapData.orientation,
      ),
    [roadmapData.orientation],
  );
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
  const updateRoadmapData = (patch: Partial<RoadmapData>) => {
    updateParentRoadmapData(props, { ...roadmapData, ...patch });
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
      ref={presentationRef}
      data-node="roadmap-milestone"
      aria-current={status === "current" ? "step" : undefined}
      {...containedMovementTargetAttributes()}
      className="sc-course-roadmap__milestone"
    >
      <div
        {...authoringMovementSilhouetteSurfaceAttributes()}
        className="sc-course-roadmap__milestone-shell"
      >
        {editable ? (
          <div contentEditable={false} className="sc-app-roadmap-milestone-chrome">
            <ContainedMovementHandle
              axis={roadmapData.orientation}
              getPresentationElement={() => presentationRef.current}
              label="roadmap milestone"
              projection={reorderProjection}
              sourcePos={sourcePos}
              getSourcePos={() => readNodePos(props) ?? null}
              sourceKey={milestoneId}
            />
            <button
              {...authoringMovementSnapshotChromeAttributes()}
              type="button"
              aria-disabled={!canDelete || undefined}
              aria-describedby={!canDelete ? deleteExplanationId : undefined}
              aria-label={`Delete milestone ${index}`}
              onClick={deleteMilestone}
              className="sc-app-roadmap-delete sc-course-roadmap__delete"
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
        {editable && roadmapData.useIconMarkers ? (
          <IconPicker
            value={roadmapData.icon}
            fallbackValue={MARKER_ICON_FALLBACK}
            align="center"
            side="bottom"
            onValueChange={(icon) => updateRoadmapData({ icon })}
            renderTrigger={({ displayValue }) => (
              <button
                type="button"
                contentEditable={false}
                data-status={status}
                data-course-state={courseState}
                aria-label={`Choose icon for milestone ${index}`}
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                className={`${roadmapMarkerClassName(status)} sc-app-roadmap-icon-picker`}
              >
                <IconRenderer
                  value={displayValue}
                  fallbackValue={MARKER_ICON_FALLBACK}
                  className="sc-course-roadmap__marker-icon"
                />
              </button>
            )}
          />
        ) : editable ? (
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

function updateParentRoadmapData(props: NodeViewProps, next: Partial<RoadmapData>) {
  const pos = readNodePos(props);
  if (!isValidEditorDocPos(props.editor, pos)) return;

  let parsed: RoadmapData;
  try {
    parsed = normalizeRoadmapData(next);
  } catch {
    return;
  }

  const $pos = props.editor.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth >= 0; depth -= 1) {
    const parent = $pos.node(depth);
    if (parent.type.name !== ROADMAP_NODE) continue;

    const parentPos = depth === 0 ? 0 : $pos.before(depth);
    props.editor.view.dispatch(
      props.editor.state.tr.setNodeMarkup(parentPos, undefined, {
        ...parent.attrs,
        data: parsed,
      }),
    );
    return;
  }
}
