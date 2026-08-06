import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircleIcon as CheckCircle,
  DotsSixVerticalIcon as DotsSixVertical,
  XCircleIcon as XCircle,
} from "@phosphor-icons/react";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useId, useMemo, useState, type CSSProperties } from "react";

import {
  assessmentPromptDomId,
  findAncestorAssessmentBlockId,
} from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { iconSm, iconXs } from "@/ui/tokens/icon-sizes";
import {
  assessmentDndDropAnimationFor,
  useAssessmentDndReducedMotion,
} from "@/editor/blocks/assessment/shared/runtime/runtime-dnd";

import {
  createSequencingItemNode,
  createSequencingItemsGroupNode,
  describeSequencingItemAccessibilityState,
  getSequencingDisplayOrder,
  getSequencingReorderedOrder,
  reconcileSequencingOrder,
  revealedSequenceAssessment,
  resolveAuthorizedSequenceOrder,
  sequencingItemPublicLabel,
  sequencingReorderLabel,
} from "./sequencing-fields-shared";
import "./Sequencing.css";

interface SequencingProjectionItem {
  id: string;
  html: string;
  label: string;
}

const sequencingScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "To pick up a sequencing item, press Space or Enter. Use the Arrow keys to move it. Press Space or Enter again to drop it, or Escape to cancel.",
};
const emptySequenceOrder: readonly string[] = [];

export const SequencingItemRuntimeNode = createSequencingItemNode();

export const SequencingItemsGroupRuntimeNode = createSequencingItemsGroupNode({
  addNodeView: () => ReactNodeViewRenderer(SequencingItemsGroupRuntimeNodeView),
});

function SequencingItemsGroupRuntimeNodeView(props: NodeViewProps) {
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const reducedMotion = useAssessmentDndReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 9 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      scrollBehavior: reducedMotion ? "auto" : "smooth",
    }),
  );
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
  const responseOrder = useMemo(() => problem?.order ?? emptySequenceOrder, [problem?.order]);
  const setOrder = problem?.setOrder;
  const commitOrder = problem?.commitOrder;

  useEffect(() => {
    if (!setOrder || docOrderIds.length === 0) return;
    const reconciledOrder = reconcileSequencingOrder(responseOrder, docOrderIds);
    if (
      reconciledOrder.length === responseOrder.length &&
      reconciledOrder.every((id, index) => id === responseOrder[index])
    ) {
      return;
    }
    setOrder(reconciledOrder);
  }, [docOrderKey, docOrderIds, responseOrder, setOrder]);

  const answerKeyVisible = runtimeProblem?.answerKeyVisible ?? false;
  const submitted = runtimeProblem?.state.submitted ?? false;
  const feedbackResult = runtimeProblem?.feedbackResult ?? null;
  const hasFeedback =
    submitted || (runtimeProblem?.state.feedbackMode === "immediate" && feedbackResult !== null);
  const itemPositionCorrect = feedbackResult?.items ?? null;
  const revealedAssessment = revealedSequenceAssessment(
    runtimeProblem?.state.revealedAnswer?.answers,
  );
  const answerOrderIds = resolveAuthorizedSequenceOrder({
    answerKeyVisible,
    currentItemIds: docOrderIds,
    revealedOrderIds: revealedAssessment.correctOrder,
    resultItems: itemPositionCorrect,
  });
  const correctOrderShown = answerOrderIds.length === docOrderIds.length && docOrderIds.length > 0;
  const showPositionCue = hasFeedback && itemPositionCorrect !== null && !correctOrderShown;
  const showFeedback = hasFeedback || answerKeyVisible;
  const canReorder =
    Boolean(commitOrder && runtimeProblem && !runtimeProblem.interactionLocked) &&
    !correctOrderShown;
  const effectiveOrder = getSequencingDisplayOrder({
    isEditable: false,
    answerKeyVisible: correctOrderShown,
    docOrderIds,
    answerOrderIds,
    responseOrder,
  });
  const itemById = new Map(items.map((item) => [item.id, item]));
  const draggingItem = draggingItemId ? (itemById.get(draggingItemId) ?? null) : null;
  const orderedItems = effectiveOrder
    .map((id) => itemById.get(id))
    .filter((item): item is SequencingProjectionItem => Boolean(item));
  const orderedItemIds = orderedItems.map((item) => item.id);
  const legend = runtimeProblem?.state.legend.trim() ?? "";
  const announcements = useMemo(() => sequencingAnnouncements(orderedItems), [orderedItems]);

  const commitRuntimeReorder = (sourceId: string, targetId: string) => {
    if (!canReorder || !commitOrder) return;
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
    commitOrder(nextOrder);
  };
  const handleDragStart = (event: DragStartEvent) => {
    if (!canReorder) return;
    setDraggingItemId(String(event.active.id));
  };
  const handleDragEnd = (event: DragEndEvent) => {
    if (!canReorder) {
      setDraggingItemId(null);
      return;
    }
    const sourceId = String(event.active.id);
    const targetId = event.over ? String(event.over.id) : null;
    if (targetId) commitRuntimeReorder(sourceId, targetId);
    setDraggingItemId(null);
  };

  return (
    <NodeViewWrapper
      data-bounded-scroll-frame=""
      data-slot="sequencing-items-group"
      className="sc-course-sequencing__group"
    >
      <div data-bounded-scroll="" className="sc-course-sequencing__scroll">
        <DndContext
          accessibility={{
            announcements,
            screenReaderInstructions: sequencingScreenReaderInstructions,
          }}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragCancel={() => setDraggingItemId(null)}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
        >
          {correctOrderShown ? (
            <p className="sc-course-sequencing__review-status" role="status">
              <CheckCircle size={iconSm} weight="fill" aria-hidden />
              <span>Correct order shown</span>
            </p>
          ) : null}
          <SortableContext items={orderedItemIds} strategy={verticalListSortingStrategy}>
            <ol
              role="list"
              aria-label={legend || undefined}
              aria-labelledby={legend ? undefined : assessmentPromptDomId(authoredBlockId)}
              className="sc-course-sequencing__list"
            >
              {orderedItems.map((item, index) => {
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
                  position: index + 1,
                  revealed: correctOrderShown,
                  submitted: submitted || hasFeedback,
                  total: orderedItems.length,
                });
                return (
                  <SequencingRuntimeItem
                    key={item.id}
                    accessibilityDescription={accessibilityDescription}
                    canReorder={canReorder}
                    correct={correct}
                    correctOrderShown={correctOrderShown}
                    draggingItemId={draggingItemId}
                    feedback={parsedFeedback.success ? parsedFeedback.data : null}
                    index={index}
                    item={item}
                    reducedMotion={reducedMotion}
                    showFeedback={showFeedback}
                    showPositionCue={showPositionCue}
                    total={orderedItems.length}
                  />
                );
              })}
            </ol>
          </SortableContext>
          <DragOverlay dropAnimation={assessmentDndDropAnimationFor(reducedMotion)}>
            {draggingItem ? (
              <div className="sc-course-sequencing__drag-preview">
                <span aria-hidden className="sc-course-sequencing__preview-handle">
                  <DotsSixVertical size={iconXs} weight="bold" />
                </span>
                <div className="sc-course-sequencing__item-content">
                  {renderStaticHtml(draggingItem.html, "Item")}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      <div data-bounded-scroll-hint="" aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}

function SequencingRuntimeItem({
  accessibilityDescription,
  canReorder,
  correct,
  correctOrderShown,
  draggingItemId,
  feedback,
  index,
  item,
  reducedMotion,
  showFeedback,
  showPositionCue,
  total,
}: {
  accessibilityDescription: string;
  canReorder: boolean;
  correct: boolean | null;
  correctOrderShown: boolean;
  draggingItemId: string | null;
  feedback: unknown;
  index: number;
  item: SequencingProjectionItem;
  reducedMotion: boolean;
  showFeedback: boolean;
  showPositionCue: boolean;
  total: number;
}) {
  const descriptionId = useId();
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: item.id,
    disabled: !canReorder,
    ...(reducedMotion ? { transition: null } : {}),
  });
  const style: CSSProperties = {
    transform: isDragging ? undefined : CSS.Transform.toString(transform),
    transition: isDragging || reducedMotion ? undefined : transition,
  };
  const parsedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);
  const state = correctOrderShown
    ? "correct"
    : showPositionCue && correct !== null
      ? correct
        ? "correct"
        : "incorrect"
      : undefined;

  return (
    <li
      ref={setNodeRef}
      aria-describedby={descriptionId}
      data-course-state={state}
      data-draggable={canReorder || undefined}
      data-drag-source={draggingItemId === item.id || isDragging || undefined}
      data-item-id={item.id}
      style={style}
      className="sc-course-sequencing__item"
    >
      <span aria-hidden className="sc-course-sequencing__position">
        {index + 1}
      </span>
      {canReorder ? (
        <button
          {...attributes}
          {...listeners}
          ref={setActivatorNodeRef}
          type="button"
          aria-label={sequencingReorderLabel(item.label, index + 1, total)}
          data-runtime-sequencing-handle=""
          className="sc-course-sequencing__runtime-handle"
        >
          <DotsSixVertical size={iconXs} weight="bold" aria-hidden />
        </button>
      ) : null}
      <div className="sc-course-sequencing__item-content">
        {renderStaticHtml(item.html, `Item ${index + 1}`)}
      </div>
      {showPositionCue && correct !== null ? (
        <span className="sc-course-sequencing__state-cue">
          {correct ? (
            <CheckCircle size={iconSm} weight="fill" aria-hidden />
          ) : (
            <XCircle size={iconSm} weight="fill" aria-hidden />
          )}
          <span>{correct ? "Correct position" : "Incorrect position"}</span>
        </span>
      ) : null}
      {showFeedback && parsedFeedback.success ? (
        <RichFeedbackRuntimePopover feedback={parsedFeedback.data} />
      ) : null}
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
  const seen = new Set<string>();
  node.forEach((child) => {
    if (child.type.name !== "sequencing_item") return;
    const id = String(child.attrs["id"] ?? "");
    if (!id.trim() || seen.has(id)) {
      throw new Error("Runtime sequence item ids must be nonblank and unique.");
    }
    seen.add(id);
    items.push({
      id,
      html: serializeStaticRichTextHtml(serializer, child.content),
      label: sequencingItemPublicLabel(child.textContent),
    });
  });
  return items;
}

function sequencingAnnouncements(items: readonly SequencingProjectionItem[]): Announcements {
  const positionById = new Map(items.map((item, index) => [item.id, index + 1]));
  const labelById = new Map(items.map((item) => [item.id, item.label]));
  const total = items.length;
  const label = (id: string | number) => labelById.get(String(id)) ?? "item";
  const position = (id: string | number) => positionById.get(String(id));

  return {
    onDragStart({ active }) {
      return `Lifted ‘${label(active.id)}’, position ${position(active.id) ?? 1} of ${total}.`;
    },
    onDragOver({ active, over }) {
      if (!over) return `‘${label(active.id)}’ is outside the sequencing list.`;
      return `‘${label(active.id)}’ moved to position ${position(over.id) ?? 1} of ${total}.`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `Dropped ‘${label(active.id)}’ in its original position.`;
      return `Dropped ‘${label(active.id)}’ at position ${position(over.id) ?? 1} of ${total}.`;
    },
    onDragCancel({ active }) {
      return `Cancelled reordering ‘${label(active.id)}’. It returned to position ${position(active.id) ?? 1} of ${total}.`;
    },
  };
}

function renderStaticHtml(html: string, fallback: string) {
  if (!html) return fallback;
  return (
    <div className="sc-course-sequencing__static-html" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
