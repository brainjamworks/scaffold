import { DotsSixVerticalIcon as DotsSixVertical, XIcon as X } from "@phosphor-icons/react";
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
  const [selectedPlacedItemId, setSelectedPlacedItemId] = useState<string | null>(null);
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
      (!itemById.has(selectedItemId) ||
        displayPlacements[selectedItemId] !== undefined ||
        interactionLocked)
    ) {
      setSelectedItemId(null);
    }
  }, [displayPlacements, interactionLocked, itemById, selectedItemId]);
  useLayoutEffect(() => {
    if (
      selectedPlacedItemId !== null &&
      (!itemById.has(selectedPlacedItemId) ||
        displayPlacements[selectedPlacedItemId] === undefined ||
        interactionLocked)
    ) {
      setSelectedPlacedItemId(null);
    }
  }, [displayPlacements, interactionLocked, itemById, selectedPlacedItemId]);

  const commitPlacement = (itemId: string, categoryId: string) => {
    const itemAvailable = itemById.has(itemId) && displayPlacements[itemId] !== categoryId;
    const categoryAvailable = categories.some((category) => category.id === categoryId);
    if (interactionLocked || !itemAvailable || !categoryAvailable) return false;
    problem?.setPlacement(itemId, categoryId);
    setSelectedItemId(null);
    setSelectedPlacedItemId(null);
    setHoveredCategoryId(null);
    return true;
  };
  const clearDragState = () => {
    setHoveredCategoryId(null);
  };
  const handleDragStart = () => {
    setSelectedItemId(null);
    setSelectedPlacedItemId(null);
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
      className="sc-course-categorise__content sc-course-categorise__content--runtime"
    >
      <div data-bounded-scroll="" className="sc-course-categorise__scroll">
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
          sessionId={`categorise-${authoredBlockId ?? "runtime"}`}
        >
          {sourceItems.length > 0 && (
            <div className="sc-course-categorise__source">
              <div className="sc-course-categorise__source-label">Items</div>
              <div className="sc-course-categorise__source-grid">
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
                        setSelectedPlacedItemId(null);
                        setSelectedItemId(selected ? null : item.id);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <div className="sc-course-categorise__bin-grid">
            {categories.map((category, idx) => {
              const placed = items.filter((item) => displayPlacements[item.id] === category.id);
              const selectedForPlacement = selectedItemId ?? selectedPlacedItemId;
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
                  selectedItemId={selectedForPlacement}
                  showFeedback={showFeedback}
                  submitted={submitted}
                  onPlaceSelected={() => {
                    if (selectedForPlacement) commitPlacement(selectedForPlacement, category.id);
                  }}
                  onRemovePlacement={(itemId) => problem?.removePlacement(itemId)}
                  onSelectPlacedItem={(itemId) => {
                    if (interactionLocked) return;
                    setSelectedItemId(null);
                    setSelectedPlacedItemId(selectedPlacedItemId === itemId ? null : itemId);
                  }}
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
      data-selected={selected || undefined}
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
      className="sc-course-categorise__source-item"
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
  onSelectPlacedItem,
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
  onSelectPlacedItem: (itemId: string) => void;
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
  const placementUnavailable = interactionLocked || selectedItemId === null;
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
      aria-disabled={placementUnavailable || undefined}
      aria-label={`Category ${index + 1}`}
      aria-describedby={categoryDescriptionId}
      data-id={category.id}
      data-drop-active={activeDrop || undefined}
      data-placement-ready={selectedItemId && !interactionLocked ? "" : undefined}
      onClick={onPlaceSelected}
      onKeyDown={(event) => {
        if (interactionLocked || !selectedItemId) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPlaceSelected();
        }
      }}
      className="sc-course-categorise__runtime-bin"
    >
      <span id={categoryDescriptionId} className="sc-sr-only">
        {categoryDescription}
      </span>
      <div className="sc-course-categorise__runtime-bin-title">
        {renderStaticHtml(category.html, `Category ${index + 1}`)}
      </div>
      <div className="sc-course-categorise__placed-items">
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
            selected={selectedItemId === item.id}
            onRemovePlacement={onRemovePlacement}
            onSelect={() => onSelectPlacedItem(item.id)}
          />
        ))}
        {items.length === 0 && (
          <span className="sc-course-categorise__empty-bin">
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
  onSelect,
  reveal,
  selected,
  showFeedback,
  submitted,
}: {
  answerKeyVisible: boolean;
  categoryId: string;
  feedbackResultItems: CategoriseFeedbackResultItems | null;
  interactionLocked: boolean;
  item: CategoriseItemProjection;
  onRemovePlacement: (itemId: string) => void;
  onSelect: () => void;
  reveal: ReturnType<typeof categoriseRevealFromAnswers>;
  showFeedback: boolean;
  selected: boolean;
  submitted: boolean;
}) {
  const drag = useInteractionDragSource<CategoriseDragData>({
    data: { html: item.html, itemId: item.id },
    disabled: interactionLocked,
    id: `categorise-runtime-placed-item:${item.id}`,
    label: "Placed Categorise item",
  });
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
      ref={drag.sourceRef}
      role="group"
      aria-label="Placed item"
      aria-describedby={placedItemDescriptionId}
      data-placed-item-id={item.id}
      data-interaction-drag-placeholder={drag.isPlaceholder ? "" : undefined}
      data-course-state={
        showFeedback && correct !== null ? (correct ? "correct" : "incorrect") : undefined
      }
      className="sc-course-categorise__placed-item"
    >
      <div className="sc-course-categorise__placed-item-row">
        {!interactionLocked && (
          <InteractionDragActivationArea
            ref={drag.handleRef}
            type="button"
            aria-label="Move placed item"
            aria-pressed={selected}
            data-categorise-placed-item-drag-handle=""
            data-id={item.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            safeLocalHeight={44}
            safeLocalWidth={44}
            className="sc-course-categorise__item-handle"
          >
            <DotsSixVertical size={iconSm} weight="bold" />
          </InteractionDragActivationArea>
        )}
        <div className="sc-course-categorise__item-content">
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
            className="sc-course-categorise__remove-action"
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
  return (
    <div className="sc-course-categorise__static-html" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
