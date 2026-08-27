import {
  EmbeddedNodeIdSchema,
  type AssessmentProblemSnapshot,
  type EmbeddedNodeId,
} from "@scaffold/contracts";
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
import type {
  AssessmentCommittedOperation,
  AssessmentProblemId,
  AssessmentStoreApi,
} from "@/runtime/assessment/types";

type AssessmentProblemCommittedOperation = Extract<
  AssessmentCommittedOperation,
  { readonly problemId: AssessmentProblemId }
>["operation"];

interface CreateAssessmentControlBindingInput {
  readonly ownerId: EmbeddedNodeId;
  readonly problemId: AssessmentProblemId;
  readonly requireMounted: () => void;
  readonly store: AssessmentStoreApi;
}

interface UseAssessmentControlBindingInput {
  readonly editor: Editor;
  readonly enabled: boolean;
  readonly getPos: () => number | undefined;
  readonly node: ProseMirrorNode;
  readonly problemId: AssessmentProblemId | null;
  readonly store: AssessmentStoreApi | null;
}

export function useAssessmentControlBinding(input: UseAssessmentControlBindingInput): void {
  const { editor, enabled, problemId, store } = input;
  const registry = tryGetControlBindingRegistryForEditor(editor);
  const parsedOwnerId = EmbeddedNodeIdSchema.safeParse(input.node.attrs["id"]);
  const ownerId = parsedOwnerId.success ? parsedOwnerId.data : null;
  const behaviorRef = useRef(input);
  behaviorRef.current = input;

  useEffect(() => {
    if (!enabled || !ownerId || !problemId || !registry || !store) return;
    if (isPrivateQuizChild(editor, behaviorRef.current.getPos)) return;
    if (!hasCurrentStandaloneRegistration(store, ownerId, problemId)) return;
    requireCurrentStandaloneAssessmentOwner(behaviorRef.current, ownerId, problemId);
    return registry.register(
      createAssessmentControlBinding({
        ownerId,
        problemId,
        store,
        requireMounted: () =>
          requireCurrentStandaloneAssessmentOwner(behaviorRef.current, ownerId, problemId),
      }),
    );
  }, [editor, enabled, ownerId, problemId, registry, store]);
}

/** Adapts one mounted standalone Assessment Store problem without owning assessment state. */
export function createAssessmentControlBinding({
  ownerId,
  problemId,
  requireMounted,
  store,
}: CreateAssessmentControlBindingInput): ControlBinding {
  return Object.freeze({
    ownerId,
    eventSource: {
      subscribe(listener: ControlEventListener) {
        requireMounted();
        return store.subscribeToCommittedOperations((commit) => {
          if (!("problemId" in commit)) return;
          if (commit.problemId !== problemId) return;
          requireMounted();
          const type = assessmentControlEventType(commit.operation);
          listener(Object.freeze({ targetId: ownerId, type }) satisfies ControlEvent);
        });
      },
    },
    stateReader: {
      read({ key, targetId }: ControlStateReadRequest) {
        requireMounted();
        if (targetId !== ownerId) {
          throw new Error(
            `Assessment Control Binding target "${targetId}" is not owner "${ownerId}".`,
          );
        }
        const state = store.getState();
        const problem = state.durable.problems[problemId];
        if (key === "phase") {
          return assessmentPhase(problem, state.transient.responseReady[problemId] === true);
        }
        if (key === "result") return assessmentResult(problem);
        throw new Error(`Unsupported Assessment Control state "${key}".`);
      },
    },
  });
}

function assessmentControlEventType(
  operation: AssessmentProblemCommittedOperation,
): "evaluated" | "submitted" {
  switch (operation) {
    case "check":
      return "evaluated";
    case "submit":
      return "submitted";
    default:
      return unsupportedAssessmentCommittedOperation(operation);
  }
}

function unsupportedAssessmentCommittedOperation(operation: never): never {
  throw new Error(`Unsupported Assessment committed operation "${String(operation)}".`);
}

function assessmentPhase(
  problem: AssessmentProblemSnapshot | undefined,
  responseReady: boolean,
): "unanswered" | "ready" | "evaluated" | "submitted" {
  if (problem?.submitted) return "submitted";
  if (problem?.checkResult) return "evaluated";
  if (responseReady) return "ready";
  return "unanswered";
}

function assessmentResult(
  problem: AssessmentProblemSnapshot | undefined,
): "ungraded" | "correct" | "incorrect" {
  const result = problem?.submissionResult ?? problem?.checkResult;
  if (!result) return "ungraded";
  return result.isCorrect ? "correct" : "incorrect";
}

function requireCurrentStandaloneAssessmentOwner(
  behavior: UseAssessmentControlBindingInput,
  ownerId: EmbeddedNodeId,
  problemId: AssessmentProblemId,
): void {
  if (!behavior.enabled || behavior.problemId !== problemId || !behavior.store) {
    throw new Error(`Assessment Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (behavior.node.attrs["id"] !== ownerId) {
    throw new Error(`Assessment Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  let position: number | undefined;
  try {
    position = behavior.getPos();
  } catch {
    throw new Error(`Assessment Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (typeof position !== "number") {
    throw new Error(`Assessment Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  const current = behavior.editor.state.doc.nodeAt(position);
  if (current?.type.name !== behavior.node.type.name || current.attrs["id"] !== ownerId) {
    throw new Error(`Assessment Control Binding owner "${ownerId}" is no longer mounted.`);
  }
  if (behavior.editor.state.doc.resolve(position).parent.type.name === "quiz") {
    throw new Error(`Assessment Control Binding owner "${ownerId}" is a private Quiz member.`);
  }

  if (!hasCurrentStandaloneRegistration(behavior.store, ownerId, problemId)) {
    throw new Error(
      `Assessment Control Binding owner "${ownerId}" has no current standalone registration.`,
    );
  }
}

function isPrivateQuizChild(editor: Editor, getPos: () => number | undefined): boolean {
  let position: number | undefined;
  try {
    position = getPos();
  } catch {
    return false;
  }
  return (
    typeof position === "number" && editor.state.doc.resolve(position).parent.type.name === "quiz"
  );
}

function hasCurrentStandaloneRegistration(
  store: AssessmentStoreApi,
  ownerId: EmbeddedNodeId,
  problemId: AssessmentProblemId,
): boolean {
  const state = store.getState();
  const registration = state.registrations[problemId];
  if (!registration || registration.problemId !== problemId || registration.targetId !== ownerId) {
    return false;
  }
  return !Object.values(state.quizRegistrations).some((quiz) =>
    quiz.targetIds.includes(registration.targetId),
  );
}
