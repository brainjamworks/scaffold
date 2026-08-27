import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";
import type { ReactNode } from "react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";

import { TIMELINE_ITEM_NODE } from "./content";
import { parseTimelineData } from "./TimelineModel";
import {
  TimelineEventCard,
  TimelineTrack,
  readRequiredTimelineNodeId,
} from "./timeline-components";
import { useTimelineSemanticActivationBinding } from "./use-timeline-semantic-activation-binding";
import { useTimelineControlBinding } from "./timeline-control-binding";
import { createTimelineRuntimeController } from "./timeline-runtime-controller";

import "./timeline.css";

export function TimelineView({
  footer,
  props,
  runtime = false,
}: {
  footer?: ReactNode;
  props: NodeViewProps;
  runtime?: boolean;
}) {
  const data = parseTimelineData(props.node.attrs["data"]);
  const trackElementRef = useRef<HTMLDivElement | null>(null);
  const getTrackElement = useCallback(() => trackElementRef.current, []);
  const setTrackElement = useCallback((element: HTMLDivElement | null) => {
    trackElementRef.current = element;
  }, []);
  const [controller] = useState(() => createTimelineRuntimeController(getTrackElement));
  useTimelineEntryMetadata(props);
  useLayoutEffect(() => {
    if (runtime && data.presentation === "carousel") controller.reconcile();
  }, [controller, data.presentation, props.node, runtime]);
  useTimelineControlBinding({
    controller,
    editor: props.editor,
    enabled: runtime && data.presentation === "carousel",
    getPos: props.getPos,
    node: props.node,
    ownerId: props.node.attrs["id"],
  });
  const runtimeController = runtime && data.presentation === "carousel" ? controller : undefined;
  useTimelineSemanticActivationBinding({
    editor: props.editor,
    getPos: props.getPos,
    getTrackElement,
    node: props.node,
    presentation: data.presentation,
    timelineId: props.node.attrs["id"],
    ...(runtimeController ? { controller: runtimeController } : {}),
  });

  return (
    <section
      className="sc-course-timeline__shell"
      aria-label="Timeline"
      data-presentation={data.presentation}
      data-show-axis={data.showAxis ? "true" : "false"}
      data-alignment={data.alignment}
    >
      <TimelineTrack
        eventCount={props.node.childCount}
        footer={footer}
        onTrackElementChange={setTrackElement}
        options={data}
        {...(runtimeController ? { controller: runtimeController } : {})}
      >
        <NodeViewContent<"div">
          as="div"
          role="list"
          aria-label="Timeline events"
          className="sc-course-timeline__events"
        />
      </TimelineTrack>
    </section>
  );
}

export function TimelineRuntimeView(props: NodeViewProps) {
  return <TimelineView props={props} runtime />;
}

export function TimelineItemRuntimeView(props: NodeViewProps) {
  const itemIndex = useEditorState({
    editor: props.editor,
    selector: () => resolveTimelineItemIndex(props),
  });
  const side = itemIndex % 2 === 0 ? "left" : "right";

  return (
    <NodeViewWrapper
      role="listitem"
      data-node="timeline-item"
      data-timeline-side={side}
      data-timeline-event=""
      className={`sc-course-timeline__event sc-course-timeline__event--${side}`}
    >
      <TimelineEventCard>
        <NodeViewContent />
      </TimelineEventCard>
    </NodeViewWrapper>
  );
}

function useTimelineEntryMetadata(props: NodeViewProps): void {
  const { editor, getPos, node } = props;
  useLayoutEffect(() => {
    const timelinePos = readNodeViewPos(getPos);
    if (!isValidEditorDocPos(editor, timelinePos)) return;
    const HTMLElementConstructor = editor.view.dom.ownerDocument.defaultView?.HTMLElement;
    if (!HTMLElementConstructor) return;
    const projected: { readonly element: HTMLElement; readonly itemId: string }[] = [];

    node.forEach((child, offset) => {
      if (child.type.name !== TIMELINE_ITEM_NODE) return;
      const itemId = readRequiredTimelineNodeId(child.attrs["id"], "timeline item");
      const nodeDom = editor.view.nodeDOM(timelinePos + 1 + offset);
      if (!(nodeDom instanceof HTMLElementConstructor)) return;
      const event = nodeDom.matches("[data-timeline-event]")
        ? nodeDom
        : nodeDom.querySelector<HTMLElement>("[data-timeline-event]");
      if (!event) return;
      event.dataset.timelineEntryId = itemId;
      projected.push({ element: event, itemId });
    });

    return () => {
      for (const { element, itemId } of projected) {
        if (element.dataset.timelineEntryId === itemId) {
          delete element.dataset.timelineEntryId;
        }
      }
    };
  }, [editor, getPos, node]);
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
