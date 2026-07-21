import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { ReactNode } from "react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { parseTimelineData } from "./TimelineModel";
import { TimelineEventCard, TimelineTrack } from "./timeline-components";

import "./timeline.css";

export function TimelineView({ footer, props }: { footer?: ReactNode; props: NodeViewProps }) {
  const data = parseTimelineData(props.node.attrs["data"]);

  return (
    <div
      className="sc-timeline__shell"
      data-presentation={data.presentation}
      data-show-axis={data.showAxis ? "true" : "false"}
      data-alignment={data.alignment}
    >
      <TimelineTrack eventCount={props.node.childCount} footer={footer} options={data}>
        <NodeViewContent />
      </TimelineTrack>
    </div>
  );
}

export function TimelineRuntimeView(props: NodeViewProps) {
  return <TimelineView props={props} />;
}

export function TimelineItemRuntimeView(props: NodeViewProps) {
  const itemIndex = useEditorState({
    editor: props.editor,
    selector: () => resolveTimelineItemIndex(props),
  });
  const side = itemIndex % 2 === 0 ? "left" : "right";

  return (
    <NodeViewWrapper
      data-node="timeline-item"
      data-timeline-side={side}
      data-timeline-event=""
      className={`sc-timeline__event sc-timeline__event--${side}`}
    >
      <TimelineEventCard>
        <NodeViewContent />
      </TimelineEventCard>
    </NodeViewWrapper>
  );
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
