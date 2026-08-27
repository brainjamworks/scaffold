import {
  CaretLeftIcon as CaretLeft,
  CaretRightIcon as CaretRight,
  ListBulletsIcon as ListBullets,
  XIcon as X,
} from "@phosphor-icons/react";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionDragSource } from "@/editor/interactions/drag/react/use-interaction-drag-source";
import { useInteractionDropTarget } from "@/editor/interactions/drag/react/use-interaction-drop-target";
import * as Popover from "@/ui/components/Popover/Popover";
import { CoursePopoverSurface } from "@/ui/components/course/CoursePopoverSurface/CoursePopoverSurface";
import { zIndex } from "@/ui/overlays/z-index";
import { iconSm } from "@/ui/tokens/icon-sizes";

import type {
  CategoriseCategoryProjection,
  CategoriseCourseContent,
  CategoriseItemProjection,
} from "./categorise-course-content";
import {
  EMPTY_PLACEMENTS,
  categoriseRevealFromAnswers,
  describeCategoriseCategoryAccessibilityState,
  describeCategorisePlacedItemAccessibilityState,
  describeCategoriseSourceItemAccessibilityState,
  deterministicShuffle,
} from "./categorise-fields-shared";
import "./Categorise.css";

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

type ItemTransitionDirection = "backward" | "forward";

interface DepartingItem {
  readonly direction: ItemTransitionDirection;
  readonly item: CategoriseItemProjection;
}

function shouldAnimateItemHandoff(requested: boolean): boolean {
  if (!requested) return false;
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface CategoriseCourseInteractionProps {
  readonly assessmentTargetId: string | null;
  readonly content: CategoriseCourseContent;
  readonly presentation: "inline" | "full-slide";
}

export function CategoriseCourseInteraction({
  assessmentTargetId,
  content,
  presentation,
}: CategoriseCourseInteractionProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [openReviewCategoryId, setOpenReviewCategoryId] = useState<string | null>(null);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [departingItem, setDepartingItem] = useState<DepartingItem | null>(null);
  const selectedPlacementAtArmRef = useRef<string | undefined>(undefined);
  const assessment = useAssessmentRuntimeById(assessmentTargetId, "classify");
  const shuffleScopeId = assessment?.problemId ?? assessmentTargetId;
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const { categories, items } = content;

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
  const availableItems = orderedItems.filter((item) => displayPlacements[item.id] === undefined);
  const currentItem = availableItems[activeItemIndex] ?? null;
  const currentItemNumber = currentItem ? activeItemIndex + 1 : 0;
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const currentItemStatus = `Item ${currentItemNumber} of ${availableItems.length}, not placed`;
  const selectedForPlacement = selectedItemId;
  const selectedItemCurrentPlacement = selectedItemId
    ? displayPlacements[selectedItemId]
    : undefined;
  const selectedItemLabel = selectedForPlacement
    ? (itemById.get(selectedForPlacement)?.label ?? "selected item")
    : null;

  useLayoutEffect(() => {
    if (
      selectedItemId !== null &&
      (currentItem?.id !== selectedItemId ||
        interactionLocked ||
        selectedItemCurrentPlacement !== selectedPlacementAtArmRef.current)
    ) {
      setSelectedItemId(null);
    }
  }, [currentItem?.id, interactionLocked, selectedItemCurrentPlacement, selectedItemId]);

  useLayoutEffect(() => {
    setActiveItemIndex((index) => Math.min(index, Math.max(availableItems.length - 1, 0)));
  }, [availableItems.length]);

  const navigateToItem = (nextIndex: number, animateHandoff: boolean) => {
    const resolvedIndex = Math.min(Math.max(nextIndex, 0), Math.max(availableItems.length - 1, 0));
    const direction: ItemTransitionDirection | null =
      resolvedIndex === activeItemIndex
        ? null
        : resolvedIndex > activeItemIndex
          ? "forward"
          : "backward";
    const animateTransition = direction !== null && shouldAnimateItemHandoff(animateHandoff);
    setDepartingItem(
      animateTransition && direction && currentItem ? { direction, item: currentItem } : null,
    );
    setActiveItemIndex(resolvedIndex);
    setSelectedItemId(null);
    setHoveredCategoryId(null);
    setOpenReviewCategoryId(null);
  };

  const commitPlacement = (itemId: string, categoryId: string, animateHandoff = true) => {
    const itemAvailable = itemById.has(itemId) && displayPlacements[itemId] === undefined;
    const categoryAvailable = categories.some((category) => category.id === categoryId);
    if (interactionLocked || !itemAvailable || !categoryAvailable) return false;
    problem?.setPlacement(itemId, categoryId);
    setSelectedItemId(null);
    setHoveredCategoryId(null);
    const placesCurrentItem = availableItems[activeItemIndex]?.id === itemId;
    const advancesCurrentItem =
      placesCurrentItem && availableItems.length > 1 && shouldAnimateItemHandoff(animateHandoff);
    setDepartingItem(
      advancesCurrentItem && currentItem ? { direction: "forward", item: currentItem } : null,
    );
    if (placesCurrentItem) {
      setActiveItemIndex((index) => (index >= availableItems.length - 1 ? 0 : index));
    }
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
  const currentItemElement = currentItem ? (
    <CategoriseRuntimeCurrentItem
      key={currentItem.id}
      interactionLocked={interactionLocked}
      item={currentItem}
      selected={selectedItemId === currentItem.id}
      onEscape={() => setSelectedItemId(null)}
      onSelect={() => {
        if (interactionLocked) return;
        setSelectedItemId((selected) => {
          if (selected === currentItem.id) return null;
          selectedPlacementAtArmRef.current = displayPlacements[currentItem.id];
          return currentItem.id;
        });
      }}
    />
  ) : null;
  const departingItemElement = departingItem ? (
    <CategoriseRuntimeDepartingItem
      key={`departing-${departingItem.item.id}`}
      item={departingItem.item}
    />
  ) : null;

  return (
    <>
      <div
        data-bounded-scroll={presentation === "inline" ? "" : undefined}
        data-category-count={categories.length}
        data-categorise-presentation={presentation}
        className="sc-course-categorise__scroll"
      >
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
            <div className="sc-course-categorise__drag-preview">
              {renderStaticHtml(active.html, "Item")}
            </div>
          )}
          sessionId={`categorise-${assessmentTargetId ?? "runtime"}`}
        >
          <div className="sc-course-categorise__source" data-source-mode="current-item">
            <div className="sc-course-categorise__source-heading">
              <div className="sc-course-categorise__source-label">
                {currentItem ? "Sort this item" : "No items to sort"}
              </div>
              {currentItem ? (
                <span role="status" aria-live="polite" className="sc-sr-only">
                  {currentItemStatus}
                </span>
              ) : null}
              {currentItem ? (
                <div
                  role="group"
                  aria-label="Categorise item navigation"
                  className="sc-course-categorise__item-navigation"
                >
                  <button
                    type="button"
                    aria-label="Previous Categorise item"
                    disabled={activeItemIndex <= 0}
                    className="sc-course-categorise__item-navigation-action"
                    onClick={(event) => navigateToItem(activeItemIndex - 1, event.detail !== 0)}
                  >
                    <CaretLeft aria-hidden="true" size={iconSm} weight="bold" />
                  </button>
                  <span className="sc-course-categorise__source-count">
                    {currentItemNumber} of {availableItems.length}
                  </span>
                  <button
                    type="button"
                    aria-label="Next Categorise item"
                    disabled={activeItemIndex >= availableItems.length - 1}
                    className="sc-course-categorise__item-navigation-action"
                    onClick={(event) => navigateToItem(activeItemIndex + 1, event.detail !== 0)}
                  >
                    <CaretRight aria-hidden="true" size={iconSm} weight="bold" />
                  </button>
                </div>
              ) : null}
            </div>
            <div
              data-item-transition={departingItem ? departingItem.direction : undefined}
              className="sc-course-categorise__source-grid"
            >
              {departingItem && currentItem && currentItemElement ? (
                <div
                  key={`${departingItem.item.id}-${currentItem.id}`}
                  data-item-carousel-track=""
                  data-item-transition={departingItem.direction}
                  className="sc-course-categorise__source-track"
                  onTransitionEnd={(event) => {
                    if (event.target === event.currentTarget) setDepartingItem(null);
                  }}
                >
                  {departingItem.direction === "forward"
                    ? departingItemElement
                    : currentItemElement}
                  {departingItem.direction === "forward"
                    ? currentItemElement
                    : departingItemElement}
                </div>
              ) : currentItemElement ? (
                currentItemElement
              ) : (
                <span className="sc-course-categorise__source-empty">All items placed</span>
              )}
            </div>
          </div>

          <div className="sc-course-categorise__bin-grid">
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
                  reviewOpen={openReviewCategoryId === category.id}
                  reveal={reveal}
                  selectedItemId={selectedForPlacement}
                  selectedItemLabel={selectedItemLabel}
                  showPreview={presentation === "full-slide"}
                  showFeedback={showFeedback}
                  submitted={submitted}
                  onPlaceSelected={(animateHandoff) => {
                    if (selectedForPlacement) {
                      commitPlacement(selectedForPlacement, category.id, animateHandoff);
                    }
                  }}
                  onRemovePlacement={(itemId) => problem?.removePlacement(itemId)}
                  onReviewOpenChange={(open) => setOpenReviewCategoryId(open ? category.id : null)}
                />
              );
            })}
          </div>
        </InteractionDragSession>
      </div>
      {presentation === "inline" && (
        <div data-bounded-scroll-hint="" aria-hidden="true">
          Scroll for more ↓
        </div>
      )}
    </>
  );
}

function CategoriseRuntimeDepartingItem({ item }: { item: CategoriseItemProjection }) {
  return (
    <div aria-hidden="true" data-departing-item="" className="sc-course-categorise__source-item">
      <span className="sc-course-categorise__source-item-content">
        {renderStaticHtml(item.html, "Previous item")}
      </span>
    </div>
  );
}

function CategoriseRuntimeCurrentItem({
  interactionLocked,
  item,
  onEscape,
  onSelect,
  selected,
}: {
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
    id: `categorise-runtime-current-item:${item.id}`,
    label: `Categorise ${item.label || "current item"}`,
  });
  const description = describeCategoriseSourceItemAccessibilityState({
    interactionLocked,
    placedCategoryLabel: null,
    selected,
  });
  const itemLabel = item.label || "current item";

  return (
    <InteractionDragActivationArea
      ref={drag.sourceRef}
      type="button"
      safeLocalHeight={55}
      safeLocalWidth={55}
      tabIndex={interactionLocked ? -1 : 0}
      aria-disabled={interactionLocked || undefined}
      aria-pressed={selected}
      aria-label={`Select ${itemLabel} for placement`}
      aria-describedby={descriptionId}
      data-id={item.id}
      data-current-item=""
      data-selectable={!interactionLocked ? "" : undefined}
      data-selected={selected || undefined}
      data-interaction-drag-placeholder={drag.isPlaceholder ? "" : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Escape") onEscape();
      }}
      className="sc-course-categorise__source-item"
    >
      <span className="sc-course-categorise__source-item-content">
        {renderStaticHtml(item.html, "Current item")}
      </span>
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
  onReviewOpenChange,
  reviewOpen,
  reveal,
  selectedItemId,
  selectedItemLabel,
  showPreview,
  showFeedback,
  submitted,
}: {
  answerKeyVisible: boolean;
  category: CategoriseCategoryProjection;
  feedbackResultItems: CategoriseFeedbackResultItems | null;
  hoveredCategoryId: string | null;
  index: number;
  interactionLocked: boolean;
  items: readonly CategoriseItemProjection[];
  onPlaceSelected: (animateHandoff: boolean) => void;
  onRemovePlacement: (itemId: string) => void;
  onReviewOpenChange: (open: boolean) => void;
  reviewOpen: boolean;
  reveal: ReturnType<typeof categoriseRevealFromAnswers>;
  selectedItemId: string | null;
  selectedItemLabel: string | null;
  showPreview: boolean;
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
  const placementUnavailable = interactionLocked || selectedItemId === null;
  const categoryDescription = describeCategoriseCategoryAccessibilityState({
    activeDrop,
    placedCount: items.length,
  });
  const categoryDescriptionId = useId();
  const categoryLabel = category.label || `Category ${index + 1}`;
  const itemCountLabel = `${items.length} ${items.length === 1 ? "item" : "items"}`;
  const placementLabel = selectedItemLabel
    ? `Place ${selectedItemLabel} in ${categoryLabel}`
    : `${categoryLabel}, ${itemCountLabel}`;

  return (
    <div
      role="group"
      aria-label={categoryLabel}
      aria-describedby={categoryDescriptionId}
      data-id={category.id}
      data-drop-active={activeDrop || undefined}
      data-placement-ready={selectedItemId && !interactionLocked ? "" : undefined}
      className="sc-course-categorise__category-target"
    >
      <InteractionDragActivationArea
        ref={drop.targetRef}
        type="button"
        safeLocalHeight={55}
        safeLocalWidth={55}
        disabled={placementUnavailable}
        aria-label={placementLabel}
        aria-describedby={categoryDescriptionId}
        data-drop-active={activeDrop || undefined}
        onClick={(event) => onPlaceSelected(event.detail !== 0)}
        className="sc-course-categorise__category-choice"
      >
        <span className="sc-course-categorise__category-choice-label">
          {renderStaticHtml(category.html, categoryLabel)}
        </span>
        <span className="sc-course-categorise__category-choice-count">{itemCountLabel}</span>
      </InteractionDragActivationArea>
      <Popover.Root open={reviewOpen} onOpenChange={onReviewOpenChange}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`Review ${categoryLabel}, ${itemCountLabel}`}
            className="sc-course-categorise__category-review-action"
          >
            <ListBullets size={iconSm} weight="bold" aria-hidden="true" />
            <span>Review</span>
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            role="dialog"
            aria-label={`Items in ${categoryLabel}`}
            side="bottom"
            align="start"
            sideOffset={8}
            style={{ zIndex: zIndex.popover }}
            className="sc-course-categorise__review-popover"
          >
            <CoursePopoverSurface title={categoryLabel} meta={itemCountLabel} tone="neutral">
              <div className="sc-course-categorise__review-list">
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
                  <span className="sc-course-categorise__review-empty">
                    No items placed here yet.
                  </span>
                )}
              </div>
            </CoursePopoverSurface>
            <Popover.Arrow className="sc-course-popover-surface__arrow" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {showPreview && (
        <div
          aria-hidden="true"
          className="sc-course-categorise__category-preview"
          data-categorise-category-preview=""
          data-empty={items.length === 0 ? "" : undefined}
        >
          {items.slice(0, 2).map((item) => (
            <span key={item.id} className="sc-course-categorise__category-preview-item">
              {renderStaticHtml(item.html, item.label || "Item")}
            </span>
          ))}
          {items.length > 2 && (
            <span className="sc-course-categorise__category-preview-more">
              +{items.length - 2} more
            </span>
          )}
        </div>
      )}
      <span id={categoryDescriptionId} className="sc-sr-only">
        {categoryDescription}
      </span>
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
      aria-label={`Placed ${item.label || "item"}`}
      aria-describedby={placedItemDescriptionId}
      data-placed-item-id={item.id}
      data-course-state={
        showFeedback && correct !== null ? (correct ? "correct" : "incorrect") : undefined
      }
      className="sc-course-categorise__placed-item"
    >
      <div className="sc-course-categorise__placed-item-row">
        <div className="sc-course-categorise__item-content">
          {renderStaticHtml(item.html, "Item")}
        </div>
        {!interactionLocked && (
          <InteractionDragActivationArea
            type="button"
            safeLocalHeight={44}
            safeLocalWidth={44}
            aria-label={`Remove ${item.label || "item"} placement`}
            onClick={(event) => {
              event.stopPropagation();
              onRemovePlacement(item.id);
            }}
            className="sc-course-categorise__remove-action"
          >
            <X size={iconSm} />
          </InteractionDragActivationArea>
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
  return (
    <div className="sc-course-categorise__static-html" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
