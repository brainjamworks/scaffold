import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect } from "react";

import type { SemanticActivationOutcome } from "@/document/semantic-target-interaction";
import {
  currentDirectChildStatus,
  semanticActivationRegistryForEditor,
} from "@/document/semantic-target-interaction/block-semantic-activation-binding";

import { TIMELINE_ITEM_NODE, TIMELINE_NODE } from "./content";
import { scrollTimelineEventIntoView, type TimelineOptions } from "./timeline-components";

export interface UseTimelineSemanticActivationBindingInput {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly getTrackElement: () => HTMLElement | null;
  readonly node: ProseMirrorNode;
  readonly presentation: TimelineOptions["presentation"];
  readonly timelineId: unknown;
}

/** Owns Timeline's mounted semantic reveal registration. */
export function useTimelineSemanticActivationBinding({
  editor,
  getPos,
  getTrackElement,
  node,
  presentation,
  timelineId,
}: UseTimelineSemanticActivationBindingInput): void {
  const registry = semanticActivationRegistryForEditor(editor);

  useEffect(() => {
    const semanticTimelineId = EmbeddedNodeIdSchema.safeParse(timelineId);
    if (!registry || !semanticTimelineId.success) return;
    let active = true;
    let pendingReveal: PendingReveal | null = null;

    const ownerId = semanticTimelineId.data;
    const unregister = registry.register({
      ownerId,
      activate: async ({ relationship, signal }) => {
        const childId = relationship.childId;
        if (pendingReveal) {
          pendingReveal.finish(outcome("interrupted", ownerId, pendingReveal.childId));
        }
        if (!active) return unavailable(ownerId, childId, "owner-unmounted");
        if (signal.aborted) return outcome("interrupted", ownerId, childId);
        const childStatus = currentDirectChildStatus({
          childId,
          childNodeType: TIMELINE_ITEM_NODE,
          editor,
          getPos,
          ownerId,
          ownerNodeType: TIMELINE_NODE,
        });
        if (childStatus !== "current") {
          return unavailable(
            ownerId,
            childId,
            childStatus === "child-missing" ? "child-missing" : "owner-unmounted",
          );
        }
        const track = getTrackElement();
        const timelineEvent = track ? timelineEventById(track, childId) : null;
        if (!track || !timelineEvent) {
          return unavailable(ownerId, childId, "temporarily-unavailable");
        }
        if (isTimelineEventVisible(track, timelineEvent, presentation)) {
          return outcome("already-visible", ownerId, childId);
        }

        return new Promise<SemanticActivationOutcome>((resolve) => {
          let settled = false;
          const finish: PendingReveal["finish"] = (result) => {
            if (settled) return;
            settled = true;
            signal.removeEventListener("abort", handleAbort);
            if (pendingReveal?.finish === finish) pendingReveal = null;
            resolve(result);
          };
          const handleAbort = () => finish(outcome("interrupted", ownerId, childId));
          pendingReveal = { childId, finish };
          signal.addEventListener("abort", handleAbort, { once: true });
          if (signal.aborted) {
            finish(outcome("interrupted", ownerId, childId));
            return;
          }
          queueMicrotask(() => {
            if (settled) return;
            const currentTrack = getTrackElement();
            const currentTimelineEvent = currentTrack
              ? timelineEventById(currentTrack, childId)
              : null;
            const currentChildStatus = currentDirectChildStatus({
              childId,
              childNodeType: TIMELINE_ITEM_NODE,
              editor,
              getPos,
              ownerId,
              ownerNodeType: TIMELINE_NODE,
            });
            if (!active || currentChildStatus !== "current") {
              finish(
                !active
                  ? unavailable(ownerId, childId, "owner-unmounted")
                  : unavailable(
                      ownerId,
                      childId,
                      currentChildStatus === "child-missing" ? "child-missing" : "owner-unmounted",
                    ),
              );
              return;
            }
            if (!currentTrack || !currentTimelineEvent) {
              finish(unavailable(ownerId, childId, "temporarily-unavailable"));
              return;
            }
            const reduceMotion =
              currentTrack.ownerDocument.defaultView?.matchMedia?.(
                "(prefers-reduced-motion: reduce)",
              ).matches === true;
            scrollTimelineEventIntoView(
              currentTrack,
              currentTimelineEvent,
              presentation,
              reduceMotion ? "auto" : "smooth",
            );
            finish(outcome("revealed", ownerId, childId));
          });
        });
      },
    });

    return () => {
      active = false;
      if (pendingReveal) {
        pendingReveal.finish(
          unavailable(
            ownerId,
            pendingReveal.childId,
            currentDirectChildStatus({
              childId: pendingReveal.childId,
              childNodeType: TIMELINE_ITEM_NODE,
              editor,
              getPos,
              ownerId,
              ownerNodeType: TIMELINE_NODE,
            }) === "child-missing"
              ? "child-missing"
              : "owner-unmounted",
          ),
        );
      }
      unregister();
    };
  }, [editor, getPos, getTrackElement, node, presentation, registry, timelineId]);
}

interface PendingReveal {
  readonly childId: EmbeddedNodeId;
  readonly finish: (result: SemanticActivationOutcome) => void;
}

function outcome(
  kind: "revealed" | "already-visible" | "interrupted",
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
): SemanticActivationOutcome {
  return Object.freeze({ kind, ownerId, childId });
}

function unavailable(
  ownerId: EmbeddedNodeId,
  childId: EmbeddedNodeId,
  reason: "owner-unmounted" | "child-missing" | "temporarily-unavailable",
): SemanticActivationOutcome {
  return Object.freeze({ kind: "unavailable", ownerId, childId, reason });
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
