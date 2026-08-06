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
    { id: "target_00001", correctOptionId: "option_00001" },
    { id: "target_00002", correctOptionId: "option_00002" },
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
    passingScore: null,
    timer: { enabled: false, durationSeconds: 0 },
    ...settings,
  };

  return {
    assessmentGroups: [
      {
        schemaVersion: 2,
        kind: "quiz",
        groupId: "quiz__000001",
        targetIds: targets.map(({ id }) => id),
        settings: quizSettings,
      },
    ],
    assessmentTargets: targets.map(({ id, correctOptionId }) => ({
      schemaVersion: 2,
      targetId: id,
      blockId: id,
      blockType: "mcq",
      interaction: {
        kind: "single-select",
        options: [{ id: "option_00001" }, { id: "option_00002" }],
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
