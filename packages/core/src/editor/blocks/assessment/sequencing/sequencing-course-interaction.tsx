import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { useEffect, useId, useMemo } from "react";

import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import type { InteractionDragEvent } from "@/editor/interactions/drag/model/interaction-drag-event";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionSortable } from "@/editor/interactions/drag/react/use-interaction-sortable";
import { iconXs } from "@/ui/tokens/icon-sizes";

import type { SequencingCourseContent, SequencingCourseItem } from "./sequencing-course-content";
import {
  describeSequencingItemAccessibilityState,
  deterministicShuffle,
  getSequencingDisplayOrder,
  getSequencingReorderedOrder,
  revealedSequenceAssessment,
} from "./sequencing-fields-shared";
import "./Sequencing.css";

interface SequencingDragData {
  readonly html: string;
  readonly itemId: string;
}

export interface SequencingCourseInteractionProps {
  readonly assessmentTargetId: string | null;
  readonly content: SequencingCourseContent;
  readonly presentation: "inline" | "full-slide";
}

export function SequencingCourseInteraction({
  assessmentTargetId,
  content,
  presentation,
}: SequencingCourseInteractionProps) {
  const assessment = useAssessmentRuntimeById(assessmentTargetId, "sequence");
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const items = content.items;
  const docOrderIds = useMemo(() => items.map((item) => item.id), [items]);
  const docOrderKey = docOrderIds.join("|");
  const responseOrder = problem?.order ?? [];
  const setOrder = problem?.setOrder;

  useEffect(() => {
    if (!setOrder || !assessmentTargetId || docOrderIds.length === 0) return;
    const responseSet = new Set(responseOrder);
    const documentSet = new Set(docOrderIds);
    const matches =
      responseOrder.length === docOrderIds.length &&
      docOrderIds.every((id) => responseSet.has(id)) &&
      responseOrder.every((id) => documentSet.has(id));
    if (matches) return;
    setOrder(deterministicShuffle(docOrderIds, `${assessmentTargetId}|${docOrderKey}`));
    // responseOrder intentionally omitted: only reseed when the authored item set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setOrder, assessmentTargetId, docOrderKey]);

  const answerKeyVisible = runtimeProblem?.answerKeyVisible ?? false;
  const submitted = runtimeProblem?.state.submitted ?? false;
  const hasRevealPayload = (runtimeProblem?.state.revealedAnswer ?? null) !== null;
  const feedbackResult = runtimeProblem?.feedbackResult ?? null;
  const hasFeedback =
    submitted || (runtimeProblem?.state.feedbackMode === "immediate" && feedbackResult !== null);
  const itemPositionCorrect = feedbackResult?.items ?? null;
  const showFeedback = hasFeedback || answerKeyVisible;
  const interactionLocked = submitted || hasRevealPayload || (runtimeProblem?.exhausted ?? false);
  const canReorder = Boolean(setOrder) && !interactionLocked && !answerKeyVisible;
  const revealedAssessment = revealedSequenceAssessment(
    runtimeProblem?.state.revealedAnswer?.answers,
  );
  const effectiveOrder = getSequencingDisplayOrder({
    isEditable: false,
    answerKeyVisible,
    docOrderIds,
    answerOrderIds: revealedAssessment.correctOrder,
    responseOrder,
  });
  const itemById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = effectiveOrder
    .map((id) => itemById.get(id))
    .filter((item): item is SequencingCourseItem => Boolean(item));
  const orderedItemIds = orderedItems.map((item) => item.id);

  const commitRuntimeReorder = (sourceId: string, targetId: string) => {
    if (!canReorder || !setOrder) return;
    const sourceIndex = orderedItemIds.indexOf(sourceId);
    const targetIndex = orderedItemIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const nextOrder = getSequencingReorderedOrder({
      order: orderedItemIds,
      sourceId,
      targetId,
      placement: targetIndex > sourceIndex ? "after" : "before",
    });
    if (nextOrder.every((id, index) => id === orderedItemIds[index])) return;
    setOrder(nextOrder);
  };
  const handleDragEnd = (event: InteractionDragEvent<SequencingDragData, SequencingDragData>) => {
    if (!canReorder) return;
    const targetId = orderedItemIds[event.active.sortable?.index ?? -1] ?? null;
    if (targetId) commitRuntimeReorder(event.active.data.itemId, targetId);
  };

  return (
    <div
      data-sequencing-density={orderedItems.length >= 6 ? "compact" : "comfortable"}
      data-sequencing-presentation={presentation}
      className="sc-course-sequencing__group"
    >
      <div
        data-bounded-scroll={presentation === "inline" ? "" : undefined}
        className="sc-course-sequencing__scroll"
      >
        <InteractionDragSession<SequencingDragData, SequencingDragData>
          accessibilityMode="sortable"
          collisionPolicy="closest-center"
          labels={{
            draggable: "Sequencing item",
            instructions: "Use arrow keys to reorder the item.",
          }}
          onEnd={handleDragEnd}
          profile="sortable-vertical"
          renderPreview={(active) => (
            <div className="sc-course-sequencing__drag-preview">
              <div className="sc-course-sequencing__item-content">
                {renderStaticHtml(active.html, "Item")}
              </div>
            </div>
          )}
          sessionId={`sequencing-${assessmentTargetId ?? "runtime"}`}
        >
          <ul className="sc-course-sequencing__list">
            {orderedItems.map((item, index) => {
              const detail = itemPositionCorrect?.[item.id] ?? null;
              const correct = detail?.correct ?? null;
              const feedback =
                answerKeyVisible && revealedAssessment.feedbackByItemId[item.id] !== undefined
                  ? revealedAssessment.feedbackByItemId[item.id]
                  : detail?.feedback;
              const parsedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);
              return (
                <SequencingRuntimeItem
                  key={item.id}
                  accessibilityDescription={describeSequencingItemAccessibilityState({
                    canReorder,
                    correct,
                    hasFeedback: showFeedback && parsedFeedback.success,
                    position: index + 1,
                    revealed: answerKeyVisible,
                    submitted,
                    total: orderedItems.length,
                  })}
                  canReorder={canReorder}
                  correct={correct}
                  feedback={parsedFeedback.success ? parsedFeedback.data : null}
                  index={index}
                  item={item}
                  showFeedback={showFeedback}
                  total={orderedItems.length}
                />
              );
            })}
          </ul>
        </InteractionDragSession>
      </div>
      {presentation === "inline" && (
        <div data-bounded-scroll-hint="" aria-hidden="true">
          Scroll for more ↓
        </div>
      )}
    </div>
  );
}

function SequencingRuntimeItem({
  accessibilityDescription,
  canReorder,
  correct,
  feedback,
  index,
  item,
  showFeedback,
  total,
}: {
  accessibilityDescription: string;
  canReorder: boolean;
  correct: boolean | null;
  feedback: unknown;
  index: number;
  item: SequencingCourseItem;
  showFeedback: boolean;
  total: number;
}) {
  const descriptionId = useId();
  const itemLabel = item.label || `Item ${index + 1}`;
  const reorderLabel = `Reorder ${itemLabel}, position ${index + 1} of ${total}`;
  const sortable = useInteractionSortable<SequencingDragData>({
    data: { html: item.html, itemId: item.id },
    disabled: !canReorder,
    id: item.id,
    index,
    label: reorderLabel,
  });
  const parsedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);

  return (
    <li
      aria-label={itemLabel}
      aria-describedby={descriptionId}
      data-course-state={correct === null ? undefined : correct ? "correct" : "incorrect"}
      data-id={item.id}
      data-draggable={canReorder || undefined}
      data-interaction-drag-placeholder={sortable.isPlaceholder ? "" : undefined}
      ref={sortable.sourceRef}
      className="sc-course-sequencing__item"
    >
      <span aria-hidden="true" className="sc-course-sequencing__position">
        {index + 1}
      </span>
      {canReorder && (
        <InteractionDragActivationArea
          ref={sortable.handleRef}
          type="button"
          aria-label={reorderLabel}
          data-runtime-sequencing-handle=""
          className="sc-course-sequencing__runtime-handle"
          safeLocalHeight={55}
          safeLocalWidth={55}
        >
          <DotsSixVertical size={iconXs} weight="bold" />
        </InteractionDragActivationArea>
      )}
      <div className="sc-course-sequencing__item-content">
        {renderStaticHtml(item.html, `Item ${index + 1}`)}
      </div>
      {showFeedback && parsedFeedback.success && (
        <RichFeedbackRuntimePopover feedback={parsedFeedback.data} />
      )}
      <span id={descriptionId} className="sc-sr-only">
        {accessibilityDescription}
      </span>
    </li>
  );
}

function renderStaticHtml(html: string, fallback: string) {
  if (!html) return fallback;
  return (
    <div className="sc-course-sequencing__static-html" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
