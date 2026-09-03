import { EmbeddedNodeIdSchema, type EmbeddedNodeId } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import { tryGetControlBindingRegistryForEditor } from "@/document/control-binding";
import { createAssessmentControlBinding } from "@/editor/assessment/shared/runtime/assessment-control-binding";
import type { AssessmentProblemId, AssessmentStoreApi } from "@/runtime/assessment/types";

interface UseAssessmentSurfaceControlBindingInput {
  readonly assessmentTargetId: string;
  readonly editor: Editor;
  readonly enabled: boolean;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode;
  readonly problemId: AssessmentProblemId | null;
  readonly store: AssessmentStoreApi | null;
}

/** Adapts one private Surface assessment problem to its public mounted Surface owner. */
export function useAssessmentSurfaceControlBinding(
  input: UseAssessmentSurfaceControlBindingInput,
): void {
  const { assessmentTargetId, editor, enabled, problemId, store } = input;
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(input.node.attrs["id"]);
  const ownerId = parsedOwnerId.success ? parsedOwnerId.data : null;
  const behaviorRef = useRef(input);
  behaviorRef.current = input;

  useEffect(() => {
    if (!enabled || !ownerId || !problemId || !registry || !store) return;
    if (!hasCurrentSurfaceAssessmentRegistration(store, assessmentTargetId, problemId)) return;
    requireCurrentSurfaceAssessmentOwner(
      behaviorRef.current,
      ownerId,
      assessmentTargetId,
      problemId,
    );
    return registry.register(
      createAssessmentControlBinding({
        ownerId,
        problemId,
        store,
        requireMounted: () =>
          requireCurrentSurfaceAssessmentOwner(
            behaviorRef.current,
            ownerId,
            assessmentTargetId,
            problemId,
          ),
      }),
    );
  }, [assessmentTargetId, enabled, ownerId, problemId, registry, store]);
}

function requireCurrentSurfaceAssessmentOwner(
  behavior: UseAssessmentSurfaceControlBindingInput,
  ownerId: EmbeddedNodeId,
  assessmentTargetId: string,
  problemId: AssessmentProblemId,
): void {
  if (
    !behavior.enabled ||
    behavior.assessmentTargetId !== assessmentTargetId ||
    behavior.problemId !== problemId ||
    !behavior.store
  ) {
    throw new Error(`Assessment Surface Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (behavior.node.attrs["id"] !== ownerId) {
    throw new Error(`Assessment Surface Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Assessment Surface Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Assessment Surface Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const current = behavior.editor.state.doc.nodeAt(position);
  if (
    current?.type.name !== behavior.node.type.name ||
    current.attrs["id"] !== ownerId ||
    current.attrs["variant"] !== behavior.node.attrs["variant"]
  ) {
    throw new Error(`Assessment Surface Control Binding owner "${ownerId}" is no longer mounted.`);
  }

  const expectedQuestionType =
    behavior.node.childCount === 1 ? behavior.node.child(0).type.name : null;
  const currentQuestion = current.childCount === 1 ? current.child(0) : null;
  if (
    !expectedQuestionType ||
    currentQuestion?.type.name !== expectedQuestionType ||
    currentQuestion.attrs["id"] !== assessmentTargetId
  ) {
    throw new Error(
      `Assessment Surface Control Binding owner "${ownerId}" no longer owns assessment target "${assessmentTargetId}".`,
    );
  }

  if (!hasCurrentSurfaceAssessmentRegistration(behavior.store, assessmentTargetId, problemId)) {
    throw new Error(
      `Assessment Surface Control Binding owner "${ownerId}" has no current assessment registration.`,
    );
  }
}

function hasCurrentSurfaceAssessmentRegistration(
  store: AssessmentStoreApi,
  assessmentTargetId: string,
  problemId: AssessmentProblemId,
): boolean {
  const state = store.getState();
  const registration = state.registrations[problemId];
  if (
    !registration ||
    registration.problemId !== problemId ||
    registration.targetId !== assessmentTargetId
  ) {
    return false;
  }
  return !Object.values(state.quizRegistrations).some((quiz) =>
    quiz.targetIds.includes(assessmentTargetId),
  );
}
