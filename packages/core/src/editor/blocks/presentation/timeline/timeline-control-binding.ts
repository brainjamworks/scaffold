import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Result } from "better-result";
import { useEffect, useRef } from "react";

import {
  tryGetControlBindingRegistryForEditor,
  type ControlEventListener,
} from "@/document/control-binding";

import { TIMELINE_ITEM_NODE, TIMELINE_NODE } from "./content";
import type { TimelineRuntimeController } from "./timeline-runtime-controller";

interface TimelineControlBindingInput {
  readonly controller: TimelineRuntimeController;
  readonly editor: Editor;
  readonly enabled: boolean;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode;
  readonly ownerId: unknown;
}

/** Mounts one runtime carousel binding over settled Timeline geometry. */
export function useTimelineControlBinding(input: TimelineControlBindingInput): void {
  const { controller, editor, enabled, ownerId } = input;
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const listenersRef = useRef(new Set<ControlEventListener>());
  const behaviorRef = useRef(input);
  behaviorRef.current = input;

  useEffect(() => {
    if (!enabled || !registry) return;
    const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(ownerId);
    if (!parsedOwnerId.success) return;
    const mountedOwnerId = parsedOwnerId.data;
    const listeners = listenersRef.current;
    const unsubscribeChanges = controller.subscribeToChanges((change) => {
      if (change.origin !== "learner") return;
      const targetId = EmbeddedNodeIdSchema.parse(change.entryId);
      requireCurrentTimelineItem(behaviorRef.current, mountedOwnerId, targetId);
      const event = Object.freeze({ targetId, type: "navigated-to" });
      for (const listener of [...listeners]) listener(event);
    });
    const unregister = registry.register({
      ownerId: mountedOwnerId,
      eventSource: {
        subscribe(listener) {
          listeners.add(listener);
          let subscribed = true;
          return () => {
            if (!subscribed) return;
            subscribed = false;
            listeners.delete(listener);
          };
        },
      },
      stateReader: {
        read({ targetId }) {
          requireCurrentTimelineItem(behaviorRef.current, mountedOwnerId, targetId);
          return controller.getCurrentEntryId() === targetId;
        },
      },
      commandExecutor: {
        async execute({ targetId, type, signal }) {
          requireCurrentTimelineItem(behaviorRef.current, mountedOwnerId, targetId);
          if (signal.aborted) {
            return Result.err(Object.freeze({ reason: "cancelled" as const }));
          }
          if (type !== "scroll-to") {
            throw new Error(`Unsupported Timeline Control command "${type}".`);
          }
          const result = await controller.navigateTo({
            origin: "control-command",
            signal,
            targetId,
          });
          if (result === "cancelled") {
            return Result.err(Object.freeze({ reason: "cancelled" as const }));
          }
          requireCurrentTimelineItem(behaviorRef.current, mountedOwnerId, targetId);
          if (result !== "settled" || controller.getCurrentEntryId() !== targetId) {
            throw new Error(`Timeline entry "${targetId}" could not be centred.`);
          }
          return Result.ok();
        },
      },
    });

    return () => {
      try {
        unregister();
      } finally {
        unsubscribeChanges();
        listeners.clear();
      }
    };
  }, [controller, editor, enabled, ownerId, registry]);
}

function requireCurrentTimelineItem(
  behavior: TimelineControlBindingInput,
  ownerId: EmbeddedNodeId,
  targetId: EmbeddedNodeId,
): ProseMirrorNode {
  if (behavior.node.type.name !== TIMELINE_NODE || behavior.node.attrs["id"] !== ownerId) {
    throw new Error(`Timeline Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Timeline Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Timeline Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  const current = behavior.editor.state.doc.nodeAt(position);
  if (current?.type.name !== TIMELINE_NODE || current.attrs["id"] !== ownerId) {
    throw new Error(`Timeline Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  let isCurrentItem = false;
  current.forEach((child) => {
    if (child.type.name === TIMELINE_ITEM_NODE && child.attrs["id"] === targetId) {
      isCurrentItem = true;
    }
  });
  if (!isCurrentItem) {
    throw new Error(`Timeline entry "${targetId}" is not a current child of owner "${ownerId}".`);
  }
  return current;
}
