import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

import {
  readMilestonePosition,
  readMilestoneStatus,
  renderRoadmapTileContent,
  resolveRoadmapData,
  tileClassName,
} from "./roadmap-view-helpers";

export function RoadmapMilestoneRuntimeView(props: NodeViewProps) {
  const { index } = readMilestonePosition(props);
  const roadmapData = resolveRoadmapData(props);
  const status = readMilestoneStatus(props.node);

  return (
    <NodeViewWrapper
      data-node="roadmap-milestone"
      role="listitem"
      className="sc-roadmap__milestone"
    >
      <div className="sc-roadmap__milestone-shell">
        <span
          contentEditable={false}
          aria-hidden
          data-status={status}
          className={tileClassName(status)}
        >
          {renderRoadmapTileContent(status, index, roadmapData)}
        </span>
        <div className="sc-roadmap__content">
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
