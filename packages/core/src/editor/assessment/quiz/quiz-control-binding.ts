import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import {
  tryGetControlBindingRegistryForEditor,
  type ControlBinding,
  type ControlEvent,
  type ControlEventListener,
  type ControlStateReadRequest,
} from "@/document/control-binding";
import type { AssessmentGroupId, AssessmentStoreApi } from "@/runtime/assessment/types";

interface CreateQuizControlBindingInput {
  readonly groupId: AssessmentGroupId;
  readonly ownerId: EmbeddedNodeId;
  readonly requireMounted: () => void;
  readonly store: AssessmentStoreApi;
}

interface UseQuizControlBindingInput {
  readonly editor: Editor;
  readonly enabled: boolean;
  readonly getPos: () => number | undefined;
  readonly groupId: AssessmentGroupId | null;
  readonly node: ProseMirrorNode;
  readonly store: AssessmentStoreApi | null;
}

export function useQuizControlBinding(input: UseQuizControlBindingInput): void {
  const { editor, enabled, groupId, store } = input;
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(input.node.attrs["id"]);
  const ownerId = parsedOwnerId.success ? parsedOwnerId.data : null;
  const behaviorRef = useRef(input);
  behaviorRef.current = input;

  useEffect(() => {
    if (!enabled || !groupId || !ownerId || !registry || !store) return;
    if (!hasCurrentQuizRegistration(store, ownerId, groupId)) return;
    requireCurrentQuizOwner(behaviorRef.current, ownerId, groupId);
    return registry.register(
      createQuizControlBinding({
        groupId,
        ownerId,
        requireMounted: () => requireCurrentQuizOwner(behaviorRef.current, ownerId, groupId),
        store,
      }),
    );
  }, [editor, enabled, groupId, ownerId, registry, store]);
}

/** Adapts one mounted Quiz Store attempt without owning Quiz state. */
export function createQuizControlBinding({
  groupId,
  ownerId,
  requireMounted,
  store,
}: CreateQuizControlBindingInput): ControlBinding {
  return Object.freeze({
    ownerId,
    eventSource: {
      subscribe(listener: ControlEventListener) {
        requireMounted();
        return store.subscribeToCommittedOperations((commit) => {
          if (!("groupId" in commit) || commit.groupId !== groupId) return;
          requireMounted();
          const type = commit.operation === "quiz-started" ? "started" : "finished";
          listener(Object.freeze({ targetId: ownerId, type }) satisfies ControlEvent);
        });
      },
    },
    stateReader: {
      read({ key, targetId }: ControlStateReadRequest) {
        requireMounted();
        if (targetId !== ownerId) {
          throw new Error(`Quiz Control Binding target "${targetId}" is not owner "${ownerId}".`);
        }
        const attempt = store.getState().durable.quizzes[groupId];
        if (key === "status") {
          if (!attempt) return "not-started";
          if (attempt.status === "in_progress") return "in-progress";
          return attempt.status;
        }
        if (key === "outcome") return attempt?.successStatus ?? "unavailable";
        throw new Error(`Unsupported Quiz Control state "${key}".`);
      },
    },
  });
}

function requireCurrentQuizOwner(
  behavior: UseQuizControlBindingInput,
  ownerId: EmbeddedNodeId,
  groupId: AssessmentGroupId,
): void {
  if (!behavior.enabled || behavior.groupId !== groupId || !behavior.store) {
    throw new Error(`Quiz Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (behavior.node.attrs["id"] !== ownerId || behavior.node.childCount === 0) {
    throw new Error(`Quiz Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Quiz Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Quiz Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  const current = behavior.editor.state.doc.nodeAt(position);
  if (
    current?.type.name !== "quiz" ||
    current.attrs["id"] !== ownerId ||
    current.childCount === 0
  ) {
    throw new Error(`Quiz Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (!hasCurrentQuizRegistration(behavior.store, ownerId, groupId)) {
    throw new Error(`Quiz Control Binding owner "${ownerId}" has no current registration.`);
  }
}

function hasCurrentQuizRegistration(
  store: AssessmentStoreApi,
  ownerId: EmbeddedNodeId,
  groupId: AssessmentGroupId,
): boolean {
  const registration = store.getState().quizRegistrations[groupId];
  if (
    !registration ||
    registration.groupId !== groupId ||
    registration.authoredGroupId !== ownerId ||
    registration.targetIds.length === 0
  ) {
    return false;
  }
  return true;
}
