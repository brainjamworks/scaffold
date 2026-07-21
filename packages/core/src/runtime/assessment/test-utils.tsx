import { createElement, useLayoutEffect, type ReactNode } from "react";

import type {
  AssessmentProblemSnapshot,
  AssessmentResult,
  QuizAttemptState,
} from "@scaffold/contracts";
import { AssessmentProblemSnapshotSchema } from "@scaffold/contracts";
import type {
  AssessmentPort,
  AssessmentProblemCommandOutcome,
  AssessmentQuizCommandOutcome,
  ScaffoldRuntimePorts,
} from "@/host/ports";
import { ScaffoldServicesProvider } from "@/host/providers/ScaffoldServicesProvider";
import { ScaffoldArtifactIdentityProvider } from "@/host/providers/ScaffoldArtifactIdentityProvider";
import { AssessmentRuntimeProvider, useAssessmentStoreApi } from "./AssessmentRuntimeProvider";
import type { AssessmentStoreApi } from "./types";
import { scopeAssessmentProblemId } from "./assessment-store";

export function createAssessmentRuntimeTestRoot({
  assessment = null,
  children,
  initialSnapshot,
  media = null,
  onStore,
}: {
  assessment?: AssessmentPort | null;
  children: ReactNode;
  initialSnapshot?: unknown;
  media?: ScaffoldRuntimePorts["media"];
  onStore?: (store: AssessmentStoreApi | null) => void;
}) {
  return createElement(
    ScaffoldServicesProvider,
    { ports: { assessment, media } },
    createElement(ScaffoldArtifactIdentityProvider, {
      artifactId: "artifact-1",
      children: createElement(
        AssessmentRuntimeProvider,
        initialSnapshot === undefined ? null : { initialSnapshot },
        onStore ? createElement(AssessmentStoreCapture, { onStore }) : null,
        children,
      ),
    }),
  );
}

export function assessmentProblemOutcome(
  result: AssessmentResult,
  overrides: Partial<AssessmentProblemSnapshot> = {},
): AssessmentProblemCommandOutcome {
  return {
    problem: AssessmentProblemSnapshotSchema.parse({
      response: null,
      attemptNumber: 1,
      hintsShown: 0,
      checkResult: null,
      submitted: true,
      submissionResult: result,
      ...overrides,
    }),
  };
}

export function assessmentQuizOutcome(
  quizAttempt: QuizAttemptState,
  problemsByTargetId: AssessmentQuizCommandOutcome["problemsByTargetId"] = {},
): AssessmentQuizCommandOutcome {
  return { quizAttempt, problemsByTargetId };
}

function AssessmentStoreCapture({
  onStore,
}: {
  onStore: (store: AssessmentStoreApi | null) => void;
}) {
  const store = useAssessmentStoreApi();
  useLayoutEffect(() => {
    onStore(store);
    return () => onStore(null);
  }, [onStore, store]);
  return null;
}

export function hasAssessmentRegistration(
  store: AssessmentStoreApi | null,
  problemId: string,
): boolean {
  if (!store) return false;
  return Boolean(store.getState().registrations[scopedProblemId(problemId)]);
}

export function setAssessmentResponseField(
  store: AssessmentStoreApi | null,
  problemId: string,
  field: string,
  value: unknown,
): boolean {
  if (!store) return false;
  const registration = store.getState().registrations[scopedProblemId(problemId)];
  if (!registration) return false;
  const problem = store.getState().durable.problems[registration.problemId];
  const localResponse = problem?.response
    ? registration.response.fromContractResponse(problem.response)
    : {};
  const parsed = registration.response.schema.safeParse(localResponse);
  const current = parsed.success && isRecord(parsed.data) ? parsed.data : {};
  return store.getState().setLocalResponse(
    {
      problemId: authoredProblemId(problemId),
      targetId: registration.targetId,
      interactionKind: registration.interactionKind,
    },
    { ...current, [field]: value },
  );
}

export function localAssessmentResponse(
  store: AssessmentStoreApi | null,
  problemId: string,
): Record<string, unknown> | null {
  if (!store) return null;
  const registration = store.getState().registrations[scopedProblemId(problemId)];
  const problem = registration
    ? store.getState().durable.problems[registration.problemId]
    : undefined;
  if (!registration || !problem?.response) return null;
  const response = registration.response.fromContractResponse(problem.response);
  return isRecord(response) ? response : null;
}

export function assessmentProblemIdentity(store: AssessmentStoreApi | null, problemId: string) {
  if (!store) return null;
  const registration = store.getState().registrations[scopedProblemId(problemId)];
  return registration
    ? {
        problemId: authoredProblemId(problemId),
        targetId: registration.targetId,
        interactionKind: registration.interactionKind,
      }
    : null;
}

function scopedProblemId(problemId: string) {
  return scopeAssessmentProblemId("artifact-1", authoredProblemId(problemId));
}

function authoredProblemId(problemId: string) {
  const prefix = "artifact:artifact-1/block:";
  return problemId.startsWith(prefix)
    ? decodeURIComponent(problemId.slice(prefix.length))
    : problemId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
