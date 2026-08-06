import { XIcon as X } from "@phosphor-icons/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useId, useLayoutEffect, useMemo, useState } from "react";

import { findAncestorAssessmentBlockId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionDragSource } from "@/editor/interactions/drag/react/use-interaction-drag-source";
import { useInteractionDropTarget } from "@/editor/interactions/drag/react/use-interaction-drop-target";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { cn } from "@/lib/cn";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { iconSm } from "@/ui/tokens/icon-sizes";

import {
  EMPTY_PLACEMENTS,
  categoriesFromContent,
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
  type CategoriseCategoryProjection,
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

interface CategoriseDragData {
  readonly html: string;
  readonly itemId: string;
}

interface CategoriseDropData {
  readonly categoryId: string;
}

function CategoriseContentRuntimeNodeView(props: NodeViewProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const pos = safeGetPos(props.getPos);
  const authoredBlockId = findAncestorAssessmentBlockId(props.editor, pos ?? undefined, [
    "categorise",
  ]);
  const assessment = useAssessmentRuntimeById(authoredBlockId, "classify");
  const shuffleScopeId = assessment?.problemId ?? authoredBlockId;
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const categories = useMemo(
    () => categoriesFromContent(props.node, serializer),
    [props.node, serializer],
  );
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
    `${shuffleScopeId ?? "categorise"}|${items.map((item) => item.id).join("|")}`,
  );
  const sourceItems = orderedItems.filter((item) => displayPlacements[item.id] === undefined);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  useLayoutEffect(() => {
    if (
      selectedItemId !== null &&
      (!itemById.has(selectedItemId) || displayPlacements[selectedItemId] !== undefined)
    ) {
      setSelectedItemId(null);
    }
  }, [displayPlacements, itemById, selectedItemId]);

  const commitPlacement = (itemId: string, categoryId: string) => {
    const itemAvailable = itemById.has(itemId) && displayPlacements[itemId] === undefined;
    const categoryAvailable = categories.some((category) => category.id === categoryId);
    if (interactionLocked || !itemAvailable || !categoryAvailable) return false;
    problem?.setPlacement(itemId, categoryId);
    setSelectedItemId(null);
    setHoveredCategoryId(null);
    return true;
  };
  const clearDragState = () => {
    setHoveredCategoryId(null);
  };
  const handleDragStart = () => {
    setSelectedItemId(null);
  };
  const handleDragMove = (event: { over: { data: CategoriseDropData } | null }) => {
    setHoveredCategoryId(interactionLocked ? null : (event.over?.data.categoryId ?? null));
  };
  const handleDragEnd = (event: {
    active: { data: CategoriseDragData };
    over: { data: CategoriseDropData } | null;
  }) => {
    if (interactionLocked) {
      clearDragState();
      return;
    }
    const itemId = event.active.data.itemId;
    const categoryId = event.over?.data.categoryId ?? null;
    if (categoryId && commitPlacement(itemId, categoryId)) return;
    clearDragState();
  };

  return (
    <NodeViewWrapper
      data-bounded-scroll-frame=""
      data-slot="categorise-content"
      className="sc-categorise-content sc-categorise-content--runtime"
    >
      <div data-bounded-scroll="" className="sc-categorise-content-scroll">
        <InteractionDragSession<CategoriseDragData, CategoriseDropData>
          accessibilityMode="selection-alternative"
          collisionPolicy="pointer"
          labels={{ draggable: "Categorise item" }}
          onCancel={clearDragState}
          onEnd={handleDragEnd}
          onMove={handleDragMove}
          onStart={handleDragStart}
          profile="pointer"
          renderPreview={(active) => (
            <div className="sc-categorise-runtime-preview">
              {renderStaticHtml(active.html, "Item")}
            </div>
          )}
          sessionId={`categorise-${authoredBlockId ?? "runtime"}`}
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
                  return (
                    <CategoriseRuntimeSourceItem
                      key={item.id}
                      description={sourceDescription}
                      index={idx}
                      interactionLocked={interactionLocked}
                      item={item}
                      selected={selected}
                      onEscape={() => setSelectedItemId(null)}
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
            {categories.map((category, idx) => {
              const placed = items.filter((item) => displayPlacements[item.id] === category.id);
              return (
                <CategoriseRuntimeCategory
                  key={category.id}
                  answerKeyVisible={answerKeyVisible}
                  category={category}
                  feedbackResultItems={feedbackResult?.items ?? null}
                  hoveredCategoryId={hoveredCategoryId}
                  index={idx}
                  interactionLocked={interactionLocked}
                  items={placed}
                  reveal={reveal}
                  selectedItemId={selectedItemId}
                  showFeedback={showFeedback}
                  submitted={submitted}
                  onPlaceSelected={() => {
                    if (selectedItemId) commitPlacement(selectedItemId, category.id);
                  }}
                  onRemovePlacement={(itemId) => problem?.removePlacement(itemId)}
                />
              );
            })}
          </div>
        </InteractionDragSession>
      </div>
      <div data-bounded-scroll-hint="" aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}

function CategoriseRuntimeSourceItem({
  description,
  index,
  interactionLocked,
  item,
  onEscape,
  onSelect,
  selected,
}: {
  description: string;
  index: number;
  interactionLocked: boolean;
  item: CategoriseItemProjection;
  onEscape: () => void;
  onSelect: () => void;
  selected: boolean;
}) {
  const descriptionId = useId();
  const drag = useInteractionDragSource<CategoriseDragData>({
    data: { html: item.html, itemId: item.id },
    disabled: interactionLocked,
    id: `categorise-runtime-item:${item.id}`,
    label: `Categorise item ${index + 1}`,
  });

  return (
    <InteractionDragActivationArea
      ref={drag.sourceRef}
      type="button"
      safeLocalHeight={55}
      safeLocalWidth={55}
      tabIndex={interactionLocked ? -1 : 0}
      aria-disabled={interactionLocked || undefined}
      aria-pressed={selected}
      aria-label={`Select item ${index + 1}`}
      aria-describedby={descriptionId}
      data-id={item.id}
      data-interaction-drag-placeholder={drag.isPlaceholder ? "" : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (interactionLocked) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
        if (event.key === "Escape") onEscape();
      }}
      className={cn(
        "sc-categorise-runtime-source-item",
        selected && "sc-categorise-runtime-source-item--selected",
        !interactionLocked && "sc-categorise-runtime-source-item--interactive",
        drag.isPlaceholder && "sc-categorise-runtime-source-item--placeholder",
      )}
    >
      {renderStaticHtml(item.html, `Item ${index + 1}`)}
      <span id={descriptionId} className="sc-sr-only">
        {description}
      </span>
    </InteractionDragActivationArea>
  );
}

function CategoriseRuntimeCategory({
  answerKeyVisible,
  category,
  feedbackResultItems,
  hoveredCategoryId,
  index,
  interactionLocked,
  items,
  onPlaceSelected,
  onRemovePlacement,
  reveal,
  selectedItemId,
  showFeedback,
  submitted,
}: {
  answerKeyVisible: boolean;
  category: CategoriseCategoryProjection;
  feedbackResultItems: CategoriseFeedbackResultItems | null;
  hoveredCategoryId: string | null;
  index: number;
  interactionLocked: boolean;
  items: CategoriseItemProjection[];
  onPlaceSelected: () => void;
  onRemovePlacement: (itemId: string) => void;
  reveal: ReturnType<typeof categoriseRevealFromAnswers>;
  selectedItemId: string | null;
  showFeedback: boolean;
  submitted: boolean;
}) {
  const drop = useInteractionDropTarget<CategoriseDropData>({
    data: { categoryId: category.id },
    disabled: interactionLocked,
    id: `categorise-runtime-category:${category.id}`,
  });
  const activeDrop =
    drop.isDropTarget ||
    hoveredCategoryId === category.id ||
    (selectedItemId !== null && !interactionLocked);
  const categoryDescription = describeCategoriseCategoryAccessibilityState({
    activeDrop,
    placedCount: items.length,
  });
  const categoryDescriptionId = useId();

  return (
    <div
      ref={drop.targetRef}
      role="button"
      tabIndex={interactionLocked ? -1 : 0}
      aria-disabled={interactionLocked || undefined}
      aria-label={`Category ${index + 1}`}
      aria-describedby={categoryDescriptionId}
      data-id={category.id}
      onClick={onPlaceSelected}
      onKeyDown={(event) => {
        if (interactionLocked || !selectedItemId) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPlaceSelected();
        }
      }}
      className={cn(
        "sc-categorise-runtime-category",
        activeDrop && "sc-categorise-runtime-category--active",
      )}
    >
      <span id={categoryDescriptionId} className="sc-sr-only">
        {categoryDescription}
      </span>
      <div className="sc-categorise-runtime-category__title">
        {renderStaticHtml(category.html, `Category ${index + 1}`)}
      </div>
      <div className="sc-categorise-runtime-category__items">
        {items.map((item) => (
          <CategoriseRuntimePlacedItem
            key={item.id}
            answerKeyVisible={answerKeyVisible}
            categoryId={category.id}
            feedbackResultItems={feedbackResultItems}
            item={item}
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
  categoryId,
  feedbackResultItems,
  interactionLocked,
  item,
  onRemovePlacement,
  reveal,
  showFeedback,
  submitted,
}: {
  answerKeyVisible: boolean;
  categoryId: string;
  feedbackResultItems: CategoriseFeedbackResultItems | null;
  interactionLocked: boolean;
  item: CategoriseItemProjection;
  onRemovePlacement: (itemId: string) => void;
  reveal: ReturnType<typeof categoriseRevealFromAnswers>;
  showFeedback: boolean;
  submitted: boolean;
}) {
  const detail = feedbackResultItems?.[item.id] ?? null;
  const correct =
    answerKeyVisible && reveal !== null
      ? reveal.placements[item.id] === categoryId
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
  const placedItemDescriptionId = useId();

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
      <span id={placedItemDescriptionId} className="sc-sr-only">
        {placedItemDescription}
      </span>
    </div>
  );
}

function renderStaticHtml(html: string, fallback: string) {
  if (!html) return fallback;
  return <div className="sc-categorise-static-html" dangerouslySetInnerHTML={{ __html: html }} />;
}
