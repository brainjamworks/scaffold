import type {
  AssessmentGroupContract,
  AssessmentTargetContract,
  QuizAssessmentSettings,
} from "@scaffold/contracts";

export interface LocalAssessmentFixtureTarget {
  id: string;
  correctOptionId: string;
}

export function quizAssessmentProjection(
  settings: Partial<QuizAssessmentSettings> = {},
  targets: LocalAssessmentFixtureTarget[] = [
    { id: "mcq-1", correctOptionId: "a" },
    { id: "mcq-2", correctOptionId: "b" },
  ],
): {
  assessmentGroups: AssessmentGroupContract[];
  assessmentTargets: AssessmentTargetContract[];
} {
  const quizSettings: QuizAssessmentSettings = {
    allowBacktracking: true,
    reviewTiming: "after_quiz",
    reviewDetail: "result_only",
    attemptsPerQuestion: 1,
    isGraded: true,
    timer: { enabled: false, durationSeconds: 0 },
    ...settings,
  };

  return {
    assessmentGroups: [
      {
        schemaVersion: 1,
        kind: "quiz",
        groupId: "quiz-1",
        targetIds: targets.map(({ id }) => id),
        settings: quizSettings,
      },
    ],
    assessmentTargets: targets.map(({ id, correctOptionId }) => ({
      schemaVersion: 1,
      targetId: id,
      blockId: id,
      blockType: "mcq",
      interaction: {
        kind: "single-select",
        options: [{ id: "a" }, { id: "b" }],
      },
      assessment: {
        kind: "single-select",
        correctOptionId,
        feedbackByOptionId: {},
        summaryFeedback: null,
      },
      settings: {
        feedbackMode: "on_submit",
        isGraded: true,
        showAnswer: true,
        points: 1,
        maxAttempts: null,
      },
    })),
  };
}
