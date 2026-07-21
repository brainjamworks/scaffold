import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { cn } from "@/lib/cn";

import { QuizEmptyStage } from "./QuizEmptyStage";
import { QuizHeader } from "./QuizHeader";
import { QuizActiveStageStyle } from "./QuizRuntime";
import { QuizStageMeta } from "./QuizStageMeta";
import { QuizStrip } from "./QuizStrip";
import { resolveActiveQuestionQuickActions } from "./quick-actions";
import { useActiveQuestionScrollReset } from "./use-active-question-scroll-reset";
import { useQuizAuthoringController } from "./use-quiz-authoring-controller";

import "./Quiz.css";

/**
 * Orchestrates the quiz authoring surface. Learner runtime has a
 * separate NodeView so runtime registration never imports quiz
 * authoring chrome, catalog mutation helpers, or interaction settings
 * targets.
 *
 *   QuizHeader              brand mark + meta + timer slot
 *   QuizStrip               sortable question pills (authoring)
 *   QuizStageMeta           position + type + per-question actions
 *   QuizEmptyStage          zero-question picker (authoring)
 *   QuizActiveStageStyle    scoped <style> hiding non-active children
 *   NodeViewContent         the active question's authored content
 */
export function QuizNodeView(props: NodeViewProps) {
  const quiz = useQuizAuthoringController({
    editor: props.editor,
    getPos: typeof props.getPos === "function" ? props.getPos : undefined,
    node: props.node,
  });

  const activeType = quiz.activeChildIndex >= 0 ? quiz.childTypes[quiz.activeChildIndex] : null;

  const showStrip = !quiz.isEmpty;
  const showStageMeta = !quiz.isEmpty && quiz.activeChildIndex >= 0 && activeType !== null;
  const showEmptyStage = quiz.isEmpty;
  const hideStage = quiz.isEmpty;
  const quizRootRef = useActiveQuestionScrollReset(quiz.activeChildKey);

  return (
    <section
      ref={quizRootRef}
      data-quiz-view-id={quiz.quizViewId}
      data-quiz-review-timing={quiz.settings.reviewTiming}
      data-active-question-id={quiz.activeChildKey ?? undefined}
      data-active-question-index={quiz.activeChildIndex >= 0 ? quiz.activeChildIndex : undefined}
      className="sc-quiz"
    >
      <section className="sc-quiz__container">
        <QuizHeader count={quiz.childCount} points={quiz.totalPoints} timer={null} />

        {showStrip ? (
          <QuizStrip
            activeChildKey={quiz.activeChildKey}
            childKeys={quiz.childKeys}
            childTypes={quiz.childTypes}
            items={quiz.assessmentCatalogItems}
            onAdd={(item) => quiz.actions.addQuestion(item.id)}
            onMove={quiz.actions.moveQuestion}
            onSelect={quiz.actions.selectAuthoringChild}
          />
        ) : null}

        {showStageMeta && activeType ? (
          <QuizStageMeta
            activeIndex={quiz.activeChildIndex}
            editor={props.editor}
            total={quiz.childCount}
            type={activeType}
            quickActions={resolveActiveQuestionQuickActions({
              activeIndex: quiz.activeChildIndex,
              editor: props.editor,
              getPos: typeof props.getPos === "function" ? props.getPos : undefined,
              node: props.node,
              nodeType: activeType,
            })}
            onSettings={() => quiz.actions.openQuestionSettings()}
            onDuplicate={() => quiz.actions.duplicateQuestion()}
            onDelete={() => quiz.actions.deleteQuestion()}
          />
        ) : null}

        {showEmptyStage ? (
          <QuizEmptyStage
            items={quiz.assessmentCatalogItems}
            onAdd={(item) => quiz.actions.addQuestion(item.id)}
          />
        ) : null}

        {!quiz.isEmpty ? (
          <QuizActiveStageStyle
            activeChildIndex={quiz.activeChildIndex}
            quizViewId={quiz.quizViewId}
          />
        ) : null}

        <NodeViewContent
          className={cn("sc-quiz__stage", hideStage && "sc-quiz__stage--hidden")}
          data-slot="quiz-content"
          data-testid="quiz-stage-viewport"
        />
      </section>
    </section>
  );
}
