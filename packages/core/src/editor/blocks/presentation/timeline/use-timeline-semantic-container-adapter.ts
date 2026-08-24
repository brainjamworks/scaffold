import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect } from "react";

import { semanticDocumentPluginKey } from "@/document/authoring/semantic-document/semantic-document-storage";

import { TIMELINE_ITEM_NODE, TIMELINE_NODE } from "./content";
import {
  scrollTimelineEventIntoView,
  type TimelineOptions,
} from "./timeline-components";

export interface UseTimelineSemanticContainerAdapterInput {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly getTrackElement: () => HTMLElement | null;
  readonly node: ProseMirrorNode;
  readonly presentation: TimelineOptions["presentation"];
  readonly timelineId: unknown;
}

/** Owns Timeline's mounted semantic reveal registration. */
export function useTimelineSemanticContainerAdapter({
  editor,
  getPos,
  getTrackElement,
  node,
  presentation,
  timelineId,
}: UseTimelineSemanticContainerAdapterInput): void {
  const semanticController = semanticDocumentPluginKey.getState(editor.state);

  useEffect(() => {
    const semanticTimelineId = EmbeddedNodeIdSchema.safeParse(timelineId);
    if (!semanticController || !semanticTimelineId.success) return;
    let active = true;
    let pendingReveal: PendingReveal | null = null;

    const unregister = semanticController.containerAdapters.register({
      ownerId: semanticTimelineId.data,
      reveal: (childId, _reason, signal) => {
        pendingReveal?.finish("child-unavailable");
        if (!active || signal?.aborted) return "child-unavailable";
        if (!isCurrentTimelineChild(editor, getPos, semanticTimelineId.data, childId)) {
          return "child-unavailable";
        }
        const track = getTrackElement();
        const timelineEvent = track ? timelineEventById(track, childId) : null;
        if (!track || !timelineEvent) return "child-unavailable";
        if (isTimelineEventVisible(track, timelineEvent, presentation)) {
          return "already-visible";
        }

        const reduceMotion =
          track.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")
            .matches === true;
        scrollTimelineEventIntoView(
          track,
          timelineEvent,
          presentation,
          reduceMotion ? "auto" : "smooth",
        );

        return new Promise((resolve) => {
          let settled = false;
          const finish: PendingReveal["finish"] = (result) => {
            if (settled) return;
            settled = true;
            signal?.removeEventListener("abort", handleAbort);
            if (pendingReveal?.finish === finish) pendingReveal = null;
            resolve(result);
          };
          const handleAbort = () => finish("child-unavailable");
          pendingReveal = { finish };
          signal?.addEventListener("abort", handleAbort, { once: true });
          if (signal?.aborted) {
            finish("child-unavailable");
            return;
          }
          queueMicrotask(() => {
            const currentTrack = getTrackElement();
            if (
              !active ||
              !isCurrentTimelineChild(editor, getPos, semanticTimelineId.data, childId) ||
              !currentTrack ||
              !timelineEventById(currentTrack, childId)
            ) {
              finish("child-unavailable");
              return;
            }
            finish("revealed");
          });
        });
      },
    });

    return () => {
      active = false;
      pendingReveal?.finish("child-unavailable");
      unregister();
    };
  }, [
    editor,
    getPos,
    getTrackElement,
    node,
    presentation,
    semanticController,
    timelineId,
  ]);
}

interface PendingReveal {
  readonly finish: (result: "revealed" | "child-unavailable") => void;
}

function isCurrentTimelineChild(
  editor: Editor,
  getPos: () => number | undefined,
  timelineId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
): boolean {
  let position: number | undefined;
  try {
    position = getPos();
  } catch {
    return false;
  }
  if (typeof position !== "number") return false;
  const timeline = editor.state.doc.nodeAt(position);
  const currentTimelineId = EmbeddedNodeIdSchema.safeParse(timeline?.attrs["id"]);
  if (
    timeline?.type.name !== TIMELINE_NODE ||
    !currentTimelineId.success ||
    currentTimelineId.data !== timelineId
  ) {
    return false;
  }

  let matches = false;
  timeline.forEach((child) => {
    if (matches || child.type.name !== TIMELINE_ITEM_NODE) return;
    const currentChildId = EmbeddedNodeIdSchema.safeParse(child.attrs["id"]);
    matches = currentChildId.success && currentChildId.data === childId;
  });
  return matches;
}

function timelineEventById(track: HTMLElement, childId: EmbeddedNodeId): HTMLElement | null {
  return (
    Array.from(track.querySelectorAll<HTMLElement>("[data-timeline-entry-id]")).find(
      (candidate) => candidate.dataset.timelineEntryId === childId,
    ) ?? null
  );
}

function isTimelineEventVisible(
  track: HTMLElement,
  timelineEvent: HTMLElement,
  presentation: TimelineOptions["presentation"],
): boolean {
  const trackRect = track.getBoundingClientRect();
  const eventRect = timelineEvent.getBoundingClientRect();
  return presentation === "carousel"
    ? eventRect.left >= trackRect.left && eventRect.right <= trackRect.right
    : eventRect.top >= trackRect.top && eventRect.bottom <= trackRect.bottom;
}
