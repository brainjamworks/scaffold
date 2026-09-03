import { EmbeddedNodeIdSchema } from "@scaffold/contracts";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { useEffect, useRef } from "react";

import { createQuizControlBinding } from "@/editor/blocks/assessment/quiz/quiz-control-binding";
import { requireSurfaceQuizChild } from "@/editor/surfaces/model/assessment/surface-quiz-node";
import { tryGetControlBindingRegistryForEditor } from "@/document/control-binding";
import { useAssessmentStoreApi } from "@/runtime/assessment/AssessmentRuntimeProvider";
import type { AssessmentGroupId, AssessmentStoreApi } from "@/runtime/assessment/types";

interface UseQuizSurfaceControlBindingInput {
  readonly editor: Editor;
  readonly getPos: (() => number | undefined) | boolean;
  readonly groupId: AssessmentGroupId | null;
  readonly node: ProseMirrorNode;
  readonly quizId: string;
}

interface QuizSurfaceControlBindingBehavior extends UseQuizSurfaceControlBindingInput {
  readonly store: AssessmentStoreApi | null;
}

/** Exposes the nested Quiz's authoritative lifecycle through the Surface placement identity. */
export function useQuizSurfaceControlBinding(input: UseQuizSurfaceControlBindingInput): void {
  const store = useAssessmentStoreApi();
  const registry = tryGetControlBindingRegistryForEditor(input.editor);
  const ownerId = EmbeddedNodeIdSchema.parse(input.node.attrs["id"]);
  const groupId = input.groupId;
  const behaviorRef = useRef<QuizSurfaceControlBindingBehavior>({ ...input, store });
  behaviorRef.current = { ...input, store };

  useEffect(() => {
    if (!store || !registry || !groupId) return;
    requireCurrentQuizSurface(behaviorRef.current, groupId);
    return registry.register(
      createQuizControlBinding({
        groupId,
        ownerId,
        requireMounted: () => requireCurrentQuizSurface(behaviorRef.current, groupId),
        store,
      }),
    );
  }, [groupId, ownerId, registry, store]);
}

function requireCurrentQuizSurface(
  input: QuizSurfaceControlBindingBehavior,
  groupId: AssessmentGroupId,
): void {
  if (typeof input.getPos !== "function") {
    throw new Error(`Quiz Surface Control Binding owner "${input.node.attrs["id"]}" is unmounted.`);
  }

  let position: number | undefined;
  try {
    position = input.getPos();
  } catch {
    throw new Error(`Quiz Surface Control Binding owner "${input.node.attrs["id"]}" is unmounted.`);
  }
  const current = typeof position === "number" ? input.editor.state.doc.nodeAt(position) : null;
  const currentQuiz = current?.type.name === "surface" ? requireSurfaceQuizChild(current) : null;
  if (
    current?.type.name !== "surface" ||
    current.attrs["id"] !== input.node.attrs["id"] ||
    current.attrs["variant"] !== "slide-quiz" ||
    currentQuiz?.attrs["id"] !== input.quizId
  ) {
    throw new Error(`Quiz Surface Control Binding owner "${input.node.attrs["id"]}" is unmounted.`);
  }

  if (!input.store) {
    throw new Error(
      `Quiz Surface Control Binding owner "${input.node.attrs["id"]}" has no Assessment Store.`,
    );
  }
  const registration = input.store.getState().quizRegistrations[groupId];
  if (
    !registration ||
    registration.authoredGroupId !== input.quizId ||
    registration.targetIds.length === 0
  ) {
    throw new Error(
      `Quiz Surface Control Binding owner "${input.node.attrs["id"]}" has no current Quiz registration.`,
    );
  }
}
