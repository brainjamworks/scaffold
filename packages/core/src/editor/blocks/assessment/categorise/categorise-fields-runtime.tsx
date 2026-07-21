import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { XIcon as X } from "@phosphor-icons/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useMemo, useState } from "react";

import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import {
  RUNTIME_DRAG_SOURCE_PLACEHOLDER_CLASS,
  RuntimeDragOverlay,
  RuntimeDragPreview,
} from "@/editor/blocks/assessment/shared/runtime/runtime-dnd";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { cn } from "@/lib/cn";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { iconSm } from "@/ui/tokens/icon-sizes";

import {
  EMPTY_PLACEMENTS,
  binsFromContent,
  categoriseRevealFromAnswers,
  createCategoriseBinNode,
  createCategoriseBinsGroupNode,
  createCategoriseContentNode,
  createCategoriseItemBodyNode,
  createCategoriseItemNode,
  createCategoriseItemsGroupNode,
  describeCategoriseCategoryAccessibilityState,
  describeCategorisePlacedItemAccessibilityState,
  describeCategoriseSourceItemAccessibilityState,
  deterministicShuffle,
  itemsFromContent,
  type CategoriseBinProjection,
  type CategoriseItemProjection,
} from "./categorise-fields-shared";
import "./Categorise.css";

export {
  categoriseRevealFromAnswers,
  describeCategoriseCategoryAccessibilityState,
  describeCategorisePlacedItemAccessibilityState,
  describeCategoriseSourceItemAccessibilityState,
} from "./categorise-fields-shared";

export const CategoriseBinRuntimeNode = createCategoriseBinNode();
export const CategoriseBinsGroupRuntimeNode = createCategoriseBinsGroupNode();
export const CategoriseItemBodyRuntimeNode = createCategoriseItemBodyNode();
export const CategoriseItemRuntimeNode = createCategoriseItemNode();
export const CategoriseItemsGroupRuntimeNode = createCategoriseItemsGroupNode({
  content: "categorise_item*",
});

export const CategoriseContentRuntimeNode = createCategoriseContentNode({
  addNodeView: () => ReactNodeViewRenderer(CategoriseContentRuntimeNodeView),
});

type CategoriseFeedbackResultItems = Record<
  string,
  { correct: boolean; expected?: unknown; given?: unknown; feedback?: unknown }
>;

function CategoriseContentRuntimeNodeView(props: NodeViewProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [hoverBinId, setHoverBinId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );
  const pos = safeGetPos(props.getPos);
  const problemId = findAncestorAssessmentId(props.editor, pos ?? undefined, ["categorise"]);
  const assessment = useAssessmentRuntimeById(problemId, "classify");
  const runtimeProblemId = assessment?.problemId ?? problemId;
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const bins = useMemo(() => binsFromContent(props.node, serializer), [props.node, serializer]);
  const items = useMemo(() => itemsFromContent(props.node, serializer), [props.node, serializer]);

  const submitted = runtimeProblem?.state.submitted ?? false;
  const answerKeyVisible = runtimeProblem?.answerKeyVisible ?? false;
  const hasRevealPayload = (runtimeProblem?.state.revealedAnswer ?? null) !== null;
  const feedbackResult = runtimeProblem?.feedbackResult ?? null;
  const hasFeedback =
    submitted || (runtimeProblem?.state.feedbackMode === "immediate" && feedbackResult !== null);
  const interactionLocked = submitted || hasRevealPayload || (runtimeProblem?.exhausted ?? false);
  const reveal = categoriseRevealFromAnswers(runtimeProblem?.state.revealedAnswer?.answers);
  const displayPlacements =
    answerKeyVisible && reveal !== null
      ? reveal.placements
      : (problem?.placements ?? EMPTY_PLACEMENTS);
  const showFeedback = hasFeedback || answerKeyVisible;
  const orderedItems = deterministicShuffle(
    items,
    `${runtimeProblemId ?? "categorise"}|${items.map((item) => item.id).join("|")}`,
  );
  const sourceItems = orderedItems.filter((item) => displayPlacements[item.id] === undefined);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const draggingItem = draggingItemId ? (itemById.get(draggingItemId) ?? null) : null;

  const commitPlacement = (itemId: string, binId: string) => {
    if (interactionLocked) return;
    problem?.setPlacement(itemId, binId);
    setSelectedItemId(null);
    setDraggingItemId(null);
    setHoverBinId(null);
  };
  const clearDragState = () => {
    setDraggingItemId(null);
    setHoverBinId(null);
  };
  const handleDragStart = (event: DragStartEvent) => {
    if (interactionLocked) return;
    const itemId = runtimeCategoriseItemId(event.active.data.current);
    if (!itemId) {
      clearDragState();
      return;
    }
    setDraggingItemId(itemId);
    setSelectedItemId(null);
  };
  const handleDragOver = (event: DragOverEvent) => {
    if (interactionLocked) return;
    setHoverBinId(runtimeCategoriseBinId(event.over?.data.current) ?? null);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    if (interactionLocked) {
      clearDragState();
      return;
    }
    const itemId = runtimeCategoriseItemId(event.active.data.current);
    const binId = runtimeCategoriseBinId(event.over?.data.current);
    if (itemId && binId) {
      commitPlacement(itemId, binId);
      return;
    }
    clearDragState();
  };

  return (
    <NodeViewWrapper
      data-assessment-bounded-scroll-frame=""
      data-slot="categorise-content"
      className="sc-categorise-content sc-categorise-content--runtime"
    >
      <div data-assessment-bounded-scroll="" className="sc-categorise-content-scroll">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragCancel={clearDragState}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragStart={handleDragStart}
        >
          {sourceItems.length > 0 && (
            <div className="sc-categorise-runtime-source">
              <div className="sc-categorise-runtime-source-label">Items</div>
              <div className="sc-categorise-grid">
                {sourceItems.map((item, idx) => {
                  const selected = selectedItemId === item.id;
                  const sourceDescription = describeCategoriseSourceItemAccessibilityState({
                    interactionLocked,
                    selected,
                  });
                  const sourceDescriptionId =
                    runtimeProblemId !== null
                      ? `${runtimeProblemId}:${item.id}:categorise-source-description`
                      : undefined;
                  return (
                    <CategoriseRuntimeSourceItem
                      key={item.id}
                      description={sourceDescription}
                      descriptionId={sourceDescriptionId}
                      index={idx}
                      interactionLocked={interactionLocked}
                      item={item}
                      selected={selected}
                      onSelect={() => {
                        if (interactionLocked) return;
                        setSelectedItemId(selected ? null : item.id);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="sc-categorise-runtime-bin-grid">
            {bins.map((bin, idx) => {
              const placed = items.filter((item) => displayPlacements[item.id] === bin.id);
              return (
                <CategoriseRuntimeCategory
                  key={bin.id}
                  answerKeyVisible={answerKeyVisible}
                  bin={bin}
                  feedbackResultItems={feedbackResult?.items ?? null}
                  hoverBinId={hoverBinId}
                  index={idx}
                  interactionLocked={interactionLocked}
                  items={placed}
                  problemId={runtimeProblemId}
                  reveal={reveal}
                  selectedItemId={selectedItemId}
                  showFeedback={showFeedback}
                  submitted={submitted}
                  onPlaceSelected={() => {
                    if (selectedItemId) commitPlacement(selectedItemId, bin.id);
                  }}
                  onRemovePlacement={(itemId) => problem?.removePlacement(itemId)}
                />
              );
            })}
          </div>
          <RuntimeDragOverlay>
            {draggingItem ? (
              <RuntimeDragPreview className="sc-categorise-runtime-preview">
                {renderStaticHtml(draggingItem.html, "Item")}
              </RuntimeDragPreview>
            ) : null}
          </RuntimeDragOverlay>
        </DndContext>
      </div>
      <div data-assessment-bounded-scroll-hint="" aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}

function CategoriseRuntimeSourceItem({
  description,
  descriptionId,
  index,
  interactionLocked,
  item,
  onSelect,
  selected,
}: {
  description: string;
  descriptionId: string | undefined;
  index: number;
  interactionLocked: boolean;
  item: CategoriseItemProjection;
  onSelect: () => void;
  selected: boolean;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    id: `categorise-runtime-item:${item.id}`,
    disabled: interactionLocked,
    data: {
      categoriseRuntimeItem: true,
      itemId: item.id,
    },
  });
  const style =
    transform && !isDragging ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      {...attributes}
      {...listeners}
      ref={setNodeRef}
      role="button"
      tabIndex={interactionLocked ? -1 : 0}
      aria-pressed={selected}
      aria-label={`Select item ${index + 1}`}
      aria-describedby={descriptionId}
      data-item-id={item.id}
      onClick={onSelect}
      style={style}
      className={cn(
        "sc-categorise-runtime-source-item",
        selected && "sc-categorise-runtime-source-item--selected",
        !interactionLocked && "sc-categorise-runtime-source-item--interactive",
        isDragging && RUNTIME_DRAG_SOURCE_PLACEHOLDER_CLASS,
      )}
    >
      {renderStaticHtml(item.html, `Item ${index + 1}`)}
      {descriptionId && (
        <span id={descriptionId} className="sc-sr-only">
          {description}
        </span>
      )}
    </div>
  );
}

function CategoriseRuntimeCategory({
  answerKeyVisible,
  bin,
  feedbackResultItems,
  hoverBinId,
  index,
  interactionLocked,
  items,
  onPlaceSelected,
  onRemovePlacement,
  problemId,
  reveal,
  selectedItemId,
  showFeedback,
  submitted,
}: {
  answerKeyVisible: boolean;
  bin: CategoriseBinProjection;
  feedbackResultItems: CategoriseFeedbackResultItems | null;
  hoverBinId: string | null;
  index: number;
  interactionLocked: boolean;
  items: CategoriseItemProjection[];
  onPlaceSelected: () => void;
  onRemovePlacement: (itemId: string) => void;
  problemId: string | null;
  reveal: ReturnType<typeof categoriseRevealFromAnswers>;
  selectedItemId: string | null;
  showFeedback: boolean;
  submitted: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `categorise-runtime-bin:${bin.id}`,
    disabled: interactionLocked,
    data: {
      categoriseRuntimeBin: true,
      binId: bin.id,
    },
  });
  const activeDrop =
    isOver || hoverBinId === bin.id || (selectedItemId !== null && !interactionLocked);
  const categoryDescription = describeCategoriseCategoryAccessibilityState({
    activeDrop,
    placedCount: items.length,
  });
  const categoryDescriptionId =
    problemId !== null ? `${problemId}:${bin.id}:categorise-category-description` : undefined;

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={interactionLocked ? -1 : 0}
      aria-label={`Category ${index + 1}`}
      aria-describedby={categoryDescriptionId}
      data-bin-id={bin.id}
      onClick={onPlaceSelected}
      className={cn(
        "sc-categorise-runtime-category",
        activeDrop && "sc-categorise-runtime-category--active",
      )}
    >
      {categoryDescriptionId && (
        <span id={categoryDescriptionId} className="sc-sr-only">
          {categoryDescription}
        </span>
      )}
      <div className="sc-categorise-runtime-category__title">
        {renderStaticHtml(bin.html, `Category ${index + 1}`)}
      </div>
      <div className="sc-categorise-runtime-category__items">
        {items.map((item) => (
          <CategoriseRuntimePlacedItem
            key={item.id}
            answerKeyVisible={answerKeyVisible}
            binId={bin.id}
            feedbackResultItems={feedbackResultItems}
            item={item}
            problemId={problemId}
            reveal={reveal}
            showFeedback={showFeedback}
            submitted={submitted}
            interactionLocked={interactionLocked}
            onRemovePlacement={onRemovePlacement}
          />
        ))}
        {items.length === 0 && (
          <span className="sc-categorise-empty">
            {selectedItemId ? "Click to place selected item" : "Drop items here"}
          </span>
        )}
      </div>
    </div>
  );
}

function CategoriseRuntimePlacedItem({
  answerKeyVisible,
  binId,
  feedbackResultItems,
  interactionLocked,
  item,
  onRemovePlacement,
  problemId,
  reveal,
  showFeedback,
  submitted,
}: {
  answerKeyVisible: boolean;
  binId: string;
  feedbackResultItems: CategoriseFeedbackResultItems | null;
  interactionLocked: boolean;
  item: CategoriseItemProjection;
  onRemovePlacement: (itemId: string) => void;
  problemId: string | null;
  reveal: ReturnType<typeof categoriseRevealFromAnswers>;
  showFeedback: boolean;
  submitted: boolean;
}) {
  const detail = feedbackResultItems?.[item.id] ?? null;
  const correct =
    answerKeyVisible && reveal !== null
      ? reveal.placements[item.id] === binId
      : showFeedback && detail
        ? detail.correct
        : null;
  const feedback =
    answerKeyVisible && reveal?.feedbackByItemId[item.id] !== undefined
      ? reveal.feedbackByItemId[item.id]
      : detail?.feedback;
  const parsedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);
  const placedItemDescription = describeCategorisePlacedItemAccessibilityState({
    correct,
    hasFeedback: showFeedback && parsedFeedback.success,
    revealed: answerKeyVisible,
    submitted,
  });
  const placedItemDescriptionId =
    problemId !== null ? `${problemId}:${item.id}:categorise-placement-description` : undefined;

  return (
    <div
      role="group"
      aria-label="Placed item"
      aria-describedby={placedItemDescriptionId}
      data-placed-item-id={item.id}
      className={cn(
        "sc-categorise-runtime-placed-item",
        showFeedback && correct === true && "sc-categorise-runtime-placed-item--correct",
        showFeedback && correct === false && "sc-categorise-runtime-placed-item--incorrect",
      )}
    >
      <div className="sc-categorise-placed-item__row">
        <div className="sc-categorise-placed-item__content">
          {renderStaticHtml(item.html, "Item")}
        </div>
        {!interactionLocked && (
          <button
            type="button"
            aria-label="Remove item placement"
            onClick={(e) => {
              e.stopPropagation();
              onRemovePlacement(item.id);
            }}
            className="sc-categorise-runtime-remove"
          >
            <X size={iconSm} />
          </button>
        )}
      </div>
      {showFeedback && parsedFeedback.success && (
        <RichFeedbackRuntimePopover feedback={parsedFeedback.data} />
      )}
      {placedItemDescriptionId && (
        <span id={placedItemDescriptionId} className="sc-sr-only">
          {placedItemDescription}
        </span>
      )}
    </div>
  );
}

function runtimeCategoriseItemId(data: Record<string, unknown> | undefined) {
  if (data?.["categoriseRuntimeItem"] !== true) return null;
  const itemId = data["itemId"];
  return typeof itemId === "string" && itemId.length > 0 ? itemId : null;
}

function runtimeCategoriseBinId(data: Record<string, unknown> | undefined) {
  if (data?.["categoriseRuntimeBin"] !== true) return null;
  const binId = data["binId"];
  return typeof binId === "string" && binId.length > 0 ? binId : null;
}

function renderStaticHtml(html: string, fallback: string) {
  if (!html) return fallback;
  return <div className="sc-categorise-static-html" dangerouslySetInnerHTML={{ __html: html }} />;
}
