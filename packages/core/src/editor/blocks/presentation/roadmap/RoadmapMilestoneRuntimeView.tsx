import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import {
  courseStateForRoadmapStatus,
  readRequiredRoadmapMilestoneId,
  readMilestonePosition,
  readMilestoneStatus,
  roadmapMarkerClassName,
  roadmapStatusLabel,
  renderRoadmapTileContent,
  resolveRoadmapData,
} from "./roadmap-view-helpers";

export function RoadmapMilestoneRuntimeView(props: NodeViewProps) {
  const { index } = readMilestonePosition(props);
  const roadmapData = resolveRoadmapData(props);
  const status = readMilestoneStatus(props.node);
  const courseState = courseStateForRoadmapStatus(status);
  const milestoneId = readRequiredRoadmapMilestoneId(props.node.attrs["id"]);

  return (
    <NodeViewWrapper
      role="listitem"
      data-node="roadmap-milestone"
      data-roadmap-milestone-id={milestoneId}
      aria-current={status === "current" ? "step" : undefined}
      className="sc-course-roadmap__milestone"
    >
      <div className="sc-course-roadmap__milestone-shell">
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
        <div className="sc-course-roadmap__content">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
