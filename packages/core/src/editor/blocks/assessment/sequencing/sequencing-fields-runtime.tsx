import { DotsSixVerticalIcon as DotsSixVertical } from "@phosphor-icons/react";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useId, useMemo } from "react";

import { findAncestorAssessmentBlockId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import type { InteractionDragEvent } from "@/editor/interactions/drag/model/interaction-drag-event";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionSortable } from "@/editor/interactions/drag/react/use-interaction-sortable";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import { cn } from "@/lib/cn";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { iconXs } from "@/ui/tokens/icon-sizes";

import {
  createSequencingItemNode,
  createSequencingItemsGroupNode,
  describeSequencingItemAccessibilityState,
  deterministicShuffle,
  getSequencingDisplayOrder,
  getSequencingReorderedOrder,
  revealedSequenceAssessment,
} from "./sequencing-fields-shared";
import "./Sequencing.css";

interface SequencingProjectionItem {
  id: string;
  html: string;
}

interface SequencingDragData {
  readonly html: string;
  readonly itemId: string;
}

export const SequencingItemRuntimeNode = createSequencingItemNode();

export const SequencingItemsGroupRuntimeNode = createSequencingItemsGroupNode({
  addNodeView: () => ReactNodeViewRenderer(SequencingItemsGroupRuntimeNodeView),
});

function SequencingItemsGroupRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const authoredBlockId = findAncestorAssessmentBlockId(props.editor, pos ?? undefined, [
    "sequencing",
  ]);
  const assessment = useAssessmentRuntimeById(authoredBlockId, "sequence");
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const items = useMemo(
    () => projectionItemsFromGroup(props.node, serializer),
    [props.node, serializer],
  );
  const docOrderIds = useMemo(() => items.map((item) => item.id), [items]);
  const docOrderKey = docOrderIds.join("|");
  const responseOrder = problem?.order ?? [];
  const setOrder = problem?.setOrder;

  useEffect(() => {
    if (!setOrder || !authoredBlockId) return;
    if (docOrderIds.length === 0) return;
    const currentSet = new Set(responseOrder);
    const docSet = new Set(docOrderIds);
    const matches =
      responseOrder.length === docOrderIds.length &&
      docOrderIds.every((id) => currentSet.has(id)) &&
      responseOrder.every((id) => docSet.has(id));
    if (matches) return;
    setOrder(deterministicShuffle(docOrderIds, `${authoredBlockId}|${docOrderKey}`));
    // responseOrder intentionally omitted: only reseed when authored item set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setOrder, authoredBlockId, docOrderKey]);

  const answerKeyVisible = runtimeProblem?.answerKeyVisible ?? false;
  const submitted = runtimeProblem?.state.submitted ?? false;
  const hasRevealPayload = (runtimeProblem?.state.revealedAnswer ?? null) !== null;
  const feedbackResult = runtimeProblem?.feedbackResult ?? null;
  const hasFeedback =
    submitted || (runtimeProblem?.state.feedbackMode === "immediate" && feedbackResult !== null);
  const itemPositionCorrect = feedbackResult?.items ?? null;
  const showPositionDots = hasFeedback && itemPositionCorrect !== null && !answerKeyVisible;
  const showFeedback = hasFeedback || answerKeyVisible;
  const interactionLocked = submitted || hasRevealPayload || (runtimeProblem?.exhausted ?? false);
  const canReorder = Boolean(setOrder) && !interactionLocked && !answerKeyVisible;
  const revealedAssessment = revealedSequenceAssessment(
    runtimeProblem?.state.revealedAnswer?.answers,
  );
  const answerOrderIds = revealedAssessment.correctOrder;
  const effectiveOrder = getSequencingDisplayOrder({
    isEditable: false,
    answerKeyVisible,
    docOrderIds,
    answerOrderIds,
    responseOrder,
  });
  const itemById = new Map(items.map((item) => [item.id, item]));
  const orderedItems = effectiveOrder
    .map((id) => itemById.get(id))
    .filter((item): item is SequencingProjectionItem => Boolean(item));
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
  const handleDragEnd = (
    event: InteractionDragEvent<SequencingDragData, SequencingDragData>,
  ) => {
    if (!canReorder) {
      return;
    }
    const sourceId = event.active.data.itemId;
    const targetIndex = event.active.sortable?.index ?? -1;
    const targetId = orderedItemIds[targetIndex] ?? null;
    if (targetId) commitRuntimeReorder(sourceId, targetId);
  };

  return (
    <NodeViewWrapper
      data-bounded-scroll-frame=""
      data-slot="sequencing-items-group"
      className="sc-sequencing-items-group"
    >
      <div data-bounded-scroll="" className="sc-sequencing-items-scroll">
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
            <div className="sc-sequencing-runtime-preview">
              <div className="sc-sequencing-runtime-preview__content">
                {renderStaticHtml(active.html, "Item")}
              </div>
            </div>
          )}
          sessionId={`sequencing-${authoredBlockId ?? "runtime"}`}
        >
          <ul className="sc-sequencing-runtime-list">
            {orderedItems.map((item, idx) => {
              const detail = itemPositionCorrect?.[item.id] ?? null;
              const correct = detail?.correct ?? null;
              const feedback =
                answerKeyVisible && revealedAssessment.feedbackByItemId[item.id] !== undefined
                  ? revealedAssessment.feedbackByItemId[item.id]
                  : detail?.feedback;
              const parsedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);
              const accessibilityDescription = describeSequencingItemAccessibilityState({
                canReorder,
                correct,
                hasFeedback: showFeedback && parsedFeedback.success,
                position: idx + 1,
                revealed: answerKeyVisible,
                submitted,
                total: orderedItems.length,
              });
              return (
                <SequencingRuntimeItem
                  key={item.id}
                  accessibilityDescription={accessibilityDescription}
                  answerKeyVisible={answerKeyVisible}
                  canReorder={canReorder}
                  correct={correct}
                  feedback={parsedFeedback.success ? parsedFeedback.data : null}
                  index={idx}
                  item={item}
                  showFeedback={showFeedback}
                  showPositionDots={showPositionDots}
                />
              );
            })}
          </ul>
        </InteractionDragSession>
      </div>
      <div data-bounded-scroll-hint="" aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}

function SequencingRuntimeItem({
  accessibilityDescription,
  answerKeyVisible,
  canReorder,
  correct,
  feedback,
  index,
  item,
  showFeedback,
  showPositionDots,
}: {
  accessibilityDescription: string;
  answerKeyVisible: boolean;
  canReorder: boolean;
  correct: boolean | null;
  feedback: unknown;
  index: number;
  item: SequencingProjectionItem;
  showFeedback: boolean;
  showPositionDots: boolean;
}) {
  const descriptionId = useId();
  const sortable = useInteractionSortable<SequencingDragData>({
    data: { html: item.html, itemId: item.id },
    disabled: !canReorder,
    id: item.id,
    index,
    label: `Drag sequencing item ${index + 1}`,
  });
  const parsedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);

  return (
    <li
      aria-label={`Sequencing item ${index + 1}`}
      aria-describedby={descriptionId}
      data-id={item.id}
      data-interaction-drag-placeholder={sortable.isPlaceholder ? "" : undefined}
      ref={sortable.sourceRef}
      className={cn(
        "sc-sequencing-item",
        "sc-sequencing-item--runtime",
        canReorder && "sc-sequencing-item--draggable",
        sortable.isPlaceholder && "sc-sequencing-item--placeholder",
        answerKeyVisible && "sc-sequencing-item--answer-key",
      )}
    >
      {canReorder && (
        <InteractionDragActivationArea
          ref={sortable.handleRef}
          type="button"
          aria-label={`Drag sequencing item ${index + 1}`}
          data-runtime-sequencing-handle=""
          className="sc-sequencing-runtime-activation"
          safeLocalHeight={55}
          safeLocalWidth={55}
        >
          <DotsSixVertical size={iconXs} weight="bold" />
        </InteractionDragActivationArea>
      )}
      <div className="sc-sequencing-item__content">
        {renderStaticHtml(item.html, `Item ${index + 1}`)}
      </div>
      {showPositionDots && correct !== null && (
        <span
          aria-label={
            correct
              ? `Item ${index + 1} is in the right place`
              : `Item ${index + 1} is not in the right place`
          }
          className={cn(
            "sc-sequencing-position-dot",
            correct
              ? "sc-sequencing-position-dot--correct"
              : "sc-sequencing-position-dot--incorrect",
          )}
        />
      )}
      {showFeedback && parsedFeedback.success && (
        <RichFeedbackRuntimePopover feedback={parsedFeedback.data} />
      )}
      <span id={descriptionId} className="sc-sr-only">
        {accessibilityDescription}
      </span>
    </li>
  );
}

function projectionItemsFromGroup(
  node: PMNode,
  serializer: DOMSerializer,
): SequencingProjectionItem[] {
  const items: SequencingProjectionItem[] = [];
  node.forEach((child) => {
    if (child.type.name !== "sequencing_item") return;
    const id = String(child.attrs["id"] ?? "");
    if (!id) return;
    items.push({
      id,
      html: serializeStaticRichTextHtml(serializer, child.content),
    });
  });
  return items;
}

function renderStaticHtml(html: string, fallback: string) {
  if (!html) return fallback;
  return <div className="sc-sequencing-static-html" dangerouslySetInnerHTML={{ __html: html }} />;
}
