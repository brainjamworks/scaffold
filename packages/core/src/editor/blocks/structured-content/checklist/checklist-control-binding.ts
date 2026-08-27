import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import {
  tryGetControlBindingRegistryForEditor,
  type ControlEventListener,
} from "@/document/control-binding";
import { useScopedLearnerActivityApi } from "@/runtime/learner-activity/LearnerActivityRuntimeProvider";

import { CHECKLIST_ITEM_NODE, CHECKLIST_NODE } from "./content";
import { subscribeToChecklistLearnerCommits } from "./checklist-learner-commits";
import { readChecklistActivityData } from "./runtime-shared";

interface ChecklistControlBindingInput {
  readonly editor: Editor;
  readonly getPos: () => number | undefined;
  readonly blockId: string | null;
  readonly node: ProseMirrorNode;
}

export function useChecklistControlBinding(input: ChecklistControlBindingInput): void {
  const { blockId, editor } = input;
  const activityStore = useScopedLearnerActivityApi();
  if (!activityStore) {
    throw new Error("Checklist Control Binding requires a valid runtime artifact identity.");
  }
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const listenersRef = useRef(new Set<ControlEventListener>());
  const behaviorRef = useRef(input);
  behaviorRef.current = input;

  useEffect(() => {
    if (!registry) return;
    const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(blockId);
    if (!parsedOwnerId.success) return;
    const ownerId = parsedOwnerId.data;
    const listeners = listenersRef.current;
    const unsubscribeCommits = subscribeToChecklistLearnerCommits(editor, ownerId, (commit) => {
      const targetId =
        commit.type === "completed" ? ownerId : EmbeddedNodeIdSchema.parse(commit.targetId);
      requireCurrentChecklistTarget(
        behaviorRef.current,
        ownerId,
        targetId,
        commit.type !== "completed",
      );
      for (const listener of [...listeners]) {
        listener(Object.freeze({ targetId, type: commit.type }));
      }
    });
    const unregister = registry.register({
      ownerId,
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
          requireCurrentChecklistTarget(
            behaviorRef.current,
            ownerId,
            targetId,
            targetId !== ownerId,
          );
          const record = activityStore.getState().activities[ownerId];
          if (targetId === ownerId) return record?.completed ?? false;
          return Boolean(readChecklistActivityData(record?.data).checked[targetId]);
        },
      },
    });

    return () => {
      try {
        unregister();
      } finally {
        unsubscribeCommits();
        listeners.clear();
      }
    };
  }, [activityStore, blockId, editor, registry]);
}

function requireCurrentChecklistTarget(
  behavior: ChecklistControlBindingInput,
  ownerId: string,
  targetId: string,
  requireItem: boolean,
): ProseMirrorNode {
  if (behavior.node.type.name !== CHECKLIST_NODE || behavior.node.attrs["id"] !== ownerId) {
    throw new Error(`Checklist Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Checklist Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Checklist Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const current = behavior.editor.state.doc.nodeAt(position);
  if (current?.type.name !== CHECKLIST_NODE || current.attrs["id"] !== ownerId) {
    throw new Error(`Checklist Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (!requireItem && targetId === ownerId) return current;

  let isCurrentItem = false;
  current.forEach((child) => {
    if (child.type.name === CHECKLIST_ITEM_NODE && child.attrs["id"] === targetId) {
      isCurrentItem = true;
    }
  });
  if (!isCurrentItem) {
    throw new Error(`Checklist item "${targetId}" is not a current child of owner "${ownerId}".`);
  }
  return current;
}
