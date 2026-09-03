export function SlideQuizActiveQuestionStyle({
  activeQuestionId,
  quizId,
}: {
  activeQuestionId: string | null;
  quizId: string;
}) {
  return (
    <style contentEditable={false}>
      {`
        [data-quiz-view-id="${cssString(quizId)}"] [data-surface-quiz] > [data-surface-assessment-question] {
          display: none !important;
        }
        ${
          activeQuestionId
            ? `
              .sc-slide-quiz-surface-runtime-view[data-quiz-view-id="${cssString(quizId)}"] [data-surface-quiz] > [data-surface-assessment-question][data-id="${cssString(activeQuestionId)}"] { display: contents !important; }
              .sc-slide-quiz-surface-authoring-view[data-quiz-view-id="${cssString(quizId)}"] [data-surface-quiz] > [data-surface-assessment-question][data-id="${cssString(activeQuestionId)}"] { display: grid !important; }
            `
            : ""
        }
      `}
    </style>
  );
}

function cssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
