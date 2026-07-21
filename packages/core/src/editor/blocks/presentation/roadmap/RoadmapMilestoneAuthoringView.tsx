import { TrashIcon as Trash } from "@phosphor-icons/react";
import type { RoadmapData, RoadmapMilestoneStatus } from "@scaffold/contracts";
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import { IconPicker } from "@/editor/media/authoring/icon-picker/IconPicker";
import { IconRenderer } from "@/ui/icons/IconRenderer";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { ROADMAP_MILESTONE_NODE, ROADMAP_NODE } from "./content";
import { normalizeRoadmapData } from "./RoadmapModel";
import {
  MARKER_ICON_FALLBACK,
  readMilestonePosition,
  readMilestoneStatus,
  readNodePos,
  renderRoadmapTileContent,
  resolveRoadmapData,
  tileClassName,
} from "./roadmap-view-helpers";

const STATUS_LABELS: Record<RoadmapMilestoneStatus, string> = {
  upcoming: "upcoming",
  current: "current",
  done: "done",
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
  const roadmapData = useEditorState({
    editor: props.editor,
    selector: () => resolveRoadmapData(props),
  });
  const status = readMilestoneStatus(props.node);
  const canDelete = editable && count > 1;

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
      data-node="roadmap-milestone"
      role="listitem"
      className="sc-roadmap__milestone"
    >
      <div className="sc-roadmap__milestone-shell">
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
                aria-label="Choose roadmap marker icon"
                onClick={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
                className={tileClassName(status)}
              >
                <IconRenderer
                  value={displayValue}
                  fallbackValue={MARKER_ICON_FALLBACK}
                  className="sc-roadmap__tile-icon"
                />
              </button>
            )}
          />
        ) : editable ? (
          <button
            type="button"
            contentEditable={false}
            data-status={status}
            aria-label={`Set milestone ${index} status. Current: ${STATUS_LABELS[status]}.`}
            onClick={cycleStatus}
            onMouseDown={(event) => event.preventDefault()}
            className={tileClassName(status)}
          >
            {renderRoadmapTileContent(status, index, roadmapData)}
          </button>
        ) : (
          <span
            contentEditable={false}
            aria-hidden
            data-status={status}
            className={tileClassName(status)}
          >
            {renderRoadmapTileContent(status, index, roadmapData)}
          </span>
        )}
        <div className="sc-roadmap__content">
          <NodeViewContent />
        </div>
        {editable ? (
          <button
            type="button"
            contentEditable={false}
            disabled={!canDelete}
            aria-label={`Delete milestone ${index}`}
            onClick={deleteMilestone}
            className="sc-roadmap__delete"
          >
            <Trash size={14} aria-hidden />
          </button>
        ) : null}
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
