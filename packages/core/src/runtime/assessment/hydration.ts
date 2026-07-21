import {
  AssessmentLearnerSnapshotSchema,
  SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION,
  QuizAttemptSnapshotSchema,
  QuizAttemptStateSchema,
  type AssessmentLearnerSnapshot,
  type AssessmentProblemSnapshot,
} from "@scaffold/contracts";
import { scopeAssessmentGroupId, scopeAssessmentProblemId } from "./assessment-store";
import type { AssessmentProblemId, AssessmentStoreApi } from "./types";

export function hydrateAssessmentSnapshot(store: AssessmentStoreApi, value: unknown): void {
  const snapshot = AssessmentLearnerSnapshotSchema.parse(value);
  const state = store.getState();
  if (snapshot.artifactId !== state.artifactId) {
    throw new Error(
      `Assessment snapshot artifactId ${snapshot.artifactId} does not match runtime artifactId ${state.artifactId}`,
    );
  }
  const problems: Record<AssessmentProblemId, AssessmentProblemSnapshot> = {};
  for (const [targetId, problem] of Object.entries(snapshot.problems)) {
    problems[scopeAssessmentProblemId(state.artifactId, targetId)] = problem;
  }

  const quizzes = Object.fromEntries(
    Object.entries(snapshot.quizzes).map(([groupId, attempt]) => {
      const scopedGroupId = scopeAssessmentGroupId(state.artifactId, groupId);
      return [
        scopedGroupId,
        QuizAttemptStateSchema.parse({
          ...attempt,
          groupId: scopedGroupId,
        }),
      ];
    }),
  );

  store.setState({ durable: { problems, quizzes }, targetBindings: {} });
}

export function projectAssessmentSnapshot(store: AssessmentStoreApi): AssessmentLearnerSnapshot {
  const state = store.getState();
  const problems: Record<string, AssessmentProblemSnapshot> = {};

  for (const [problemId, problem] of Object.entries(state.durable.problems)) {
    const registration = Object.values(state.registrations).find(
      (candidate) => candidate.problemId === problemId,
    );
    const boundTargetId = Object.entries(state.targetBindings).find(
      ([boundProblemId]) => boundProblemId === problemId,
    )?.[1];
    const targetId =
      registration?.targetId ??
      boundTargetId ??
      unscopedAssessmentProblemId(state.artifactId, problemId);
    if (problems[targetId] !== undefined) {
      throw new Error(`Assessment snapshot projection has duplicate targetId ${targetId}`);
    }
    problems[targetId] = problem;
  }

  const quizzes = Object.fromEntries(
    Object.entries(state.durable.quizzes).map(([groupId, attempt]) => {
      if (attempt.groupId !== groupId) {
        throw new Error("Assessment Quiz attempt groupId does not match its runtime record key");
      }
      const { groupId: _runtimeGroupId, ...snapshot } = attempt;
      return [
        unscopedAssessmentGroupId(state.artifactId, groupId),
        QuizAttemptSnapshotSchema.parse(snapshot),
      ];
    }),
  );

  return AssessmentLearnerSnapshotSchema.parse({
    snapshotVersion: SCAFFOLD_ASSESSMENT_SNAPSHOT_VERSION,
    artifactId: state.artifactId,
    problems,
    quizzes,
  });
}

function unscopedAssessmentProblemId(artifactId: string, problemId: string): string {
  return unscopedAssessmentId(artifactId, problemId, "block");
}

function unscopedAssessmentGroupId(artifactId: string, groupId: string): string {
  return unscopedAssessmentId(artifactId, groupId, "group");
}

function unscopedAssessmentId(
  artifactId: string,
  scopedId: string,
  kind: "block" | "group",
): string {
  const prefix = `artifact:${encodeURIComponent(artifactId)}/${kind}:`;
  if (!scopedId.startsWith(prefix)) {
    throw new Error(`Assessment ${kind} id is outside runtime artifact scope`);
  }
  return decodeURIComponent(scopedId.slice(prefix.length));
}
