import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckCircleIcon as CheckCircle,
  DotsSixVerticalIcon as DotsSixVertical,
  XCircleIcon as XCircle,
  XIcon as X,
} from "@phosphor-icons/react";
import { DOMSerializer } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";

import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import {
  assessmentPromptDomId,
  findAncestorAssessmentBlockId,
} from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import {
  assessmentDndDropAnimationFor,
  useAssessmentDndReducedMotion,
} from "@/editor/blocks/assessment/shared/runtime/runtime-dnd";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
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
  itemsFromContent,
  reconcileCategorisePlacements,
  resolveAuthorizedCategoriseReveal,
  type CategoriseCategoryProjection,
  type CategoriseItemProjection,
  type CategoriseReveal,
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

const categoriseScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "To pick up an unplaced item, press Space or Enter. Use an Arrow key to move over a category. Press Space or Enter again to place it, or Escape to cancel. You can also select the item and use a named Place button in a category.",
};

function CategoriseContentRuntimeNodeView(props: NodeViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  const [placementAnnouncement, setPlacementAnnouncement] = useState("");
  const [immediateReviewDismissed, setImmediateReviewDismissed] = useState(false);
  const previousFeedbackResult = useRef<unknown>(null);
  const reducedMotion = useAssessmentDndReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 9 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: categoriseCategoryKeyboardCoordinates,
      scrollBehavior: reducedMotion ? "auto" : "smooth",
    }),
  );
  const pos = safeGetPos(props.getPos);
  const authoredBlockId = findAncestorAssessmentBlockId(props.editor, pos ?? undefined, [
    "categorise",
  ]);
  const assessment = useAssessmentRuntimeById(authoredBlockId, "classify");
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
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const categoryIds = useMemo(() => categories.map((category) => category.id), [categories]);
  const itemIdsKey = itemIds.join("|");
  const categoryIdsKey = categoryIds.join("|");
  const placements = problem?.placements ?? EMPTY_PLACEMENTS;
  const placementsKey = JSON.stringify(placements);
  const durableResponse = assessment?.response.durable ?? null;
  const durableResponseKey = JSON.stringify(durableResponse);
  const projectedResponseKey = JSON.stringify(assessment?.response.projected ?? null);
  const setPlacements = problem?.setPlacements;
  const interactionLocked = runtimeProblem?.interactionLocked ?? true;
  const submitted = runtimeProblem?.state.submitted ?? false;
  const answerKeyVisible = runtimeProblem?.answerKeyVisible ?? false;

  useEffect(() => {
    if (!setPlacements || interactionLocked || submitted || answerKeyVisible) return;
    const reconciled = reconcileCategorisePlacements(placements, itemIds, categoryIds);
    const durableNeedsCanonicalization =
      durableResponse !== null && durableResponseKey !== projectedResponseKey;
    if (sameRecord(reconciled, placements) && !durableNeedsCanonicalization) return;
    setPlacements(reconciled);
  }, [
    answerKeyVisible,
    categoryIds,
    categoryIdsKey,
    durableResponse,
    durableResponseKey,
    interactionLocked,
    itemIds,
    itemIdsKey,
    placements,
    placementsKey,
    projectedResponseKey,
    setPlacements,
    submitted,
  ]);

  const feedbackResult = runtimeProblem?.feedbackResult ?? null;
  useEffect(() => {
    if (feedbackResult !== previousFeedbackResult.current) {
      previousFeedbackResult.current = feedbackResult;
      setImmediateReviewDismissed(false);
    }
  }, [feedbackResult]);
  const hasFeedback =
    submitted || (runtimeProblem?.state.feedbackMode === "immediate" && feedbackResult !== null);
  const resolvedAuthorizedReveal = resolveAuthorizedCategoriseReveal({
    answerKeyVisible,
    categoryIds,
    itemIds,
    reveal: categoriseRevealFromAnswers(runtimeProblem?.state.revealedAnswer?.answers),
    resultItems: feedbackResult?.items ?? null,
  });
  const authorizedReveal = immediateReviewDismissed ? null : resolvedAuthorizedReveal;
  const correctPlacementsShown = authorizedReveal !== null;
  const displayPlacements = authorizedReveal?.placements ?? placements;
  const showFeedback = hasFeedback || correctPlacementsShown;
  const sourceItems = items.filter((item) => displayPlacements[item.id] === undefined);
  const itemById = new Map(items.map((item) => [item.id, item]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const draggingItem = draggingItemId ? (itemById.get(draggingItemId) ?? null) : null;
  const selectedItem = selectedItemId ? (itemById.get(selectedItemId) ?? null) : null;
  const placedCount = items.filter((item) => displayPlacements[item.id] !== undefined).length;
  const canPlace = Boolean(problem && runtimeProblem && !interactionLocked);
  const legend = (runtimeProblem?.state.legend ?? assessment?.problemConfig.legend ?? "").trim();
  const announcements = useMemo(
    () => categoriseAnnouncements(items, categories),
    [categories, items],
  );

  useEffect(() => {
    if (!selectedItemId || draggingItemId) return;
    const ownerDocument = rootRef.current?.ownerDocument;
    if (!ownerDocument) return;
    const selectedLabel = items.find((item) => item.id === selectedItemId)?.label;
    const cancelSelection = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setSelectedItemId(null);
      if (selectedLabel) setPlacementAnnouncement(`Cancelled selecting ‘${selectedLabel}’.`);
      queueFocus(() => focusSourceHandle(rootRef.current, selectedItemId));
    };
    ownerDocument.addEventListener("keydown", cancelSelection);
    return () => ownerDocument.removeEventListener("keydown", cancelSelection);
  }, [draggingItemId, items, selectedItemId]);

  const clearDragState = () => {
    setDraggingItemId(null);
    setHoveredCategoryId(null);
  };
  const focusAfterPlacement = (itemId: string, nextPlacements: Record<string, string>) => {
    const itemIndex = items.findIndex((item) => item.id === itemId);
    const cyclingOrder = [...items.slice(itemIndex + 1), ...items.slice(0, itemIndex)];
    const nextSource = cyclingOrder.find((item) => nextPlacements[item.id] === undefined);
    queueFocus(() => {
      if (nextSource && focusSourceHandle(rootRef.current, nextSource.id)) return;
      if (Object.keys(nextPlacements).length === items.length) {
        const submit = rootRef.current
          ?.closest("[data-assessment-shell]")
          ?.querySelector<HTMLElement>('[data-assessment-submission-action="submit"]');
        if (submit) {
          submit.focus();
          return;
        }
      }
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-placed-item-id="${safeSelectorValue(itemId)}"] button`)
        ?.focus();
    });
  };
  const commitPlacement = (
    itemId: string,
    categoryId: string,
    { announce = true }: { announce?: boolean } = {},
  ) => {
    if (!canPlace || !problem) return;
    const item = itemById.get(itemId);
    const category = categoryById.get(categoryId);
    if (!item || !category) return;
    const nextPlacements = { ...placements, [itemId]: categoryId };
    problem.setPlacement(itemId, categoryId);
    setImmediateReviewDismissed(true);
    if (announce) {
      setPlacementAnnouncement(`Placed ‘${item.label}’ in ‘${category.label}’.`);
    }
    setSelectedItemId(null);
    clearDragState();
    focusAfterPlacement(itemId, nextPlacements);
  };
  const removePlacement = (
    item: CategoriseItemProjection,
    category: CategoriseCategoryProjection,
  ) => {
    if (!canPlace || !problem) return;
    problem.removePlacement(item.id);
    setImmediateReviewDismissed(true);
    setPlacementAnnouncement(
      `Returned ‘${item.label}’ from ‘${category.label}’ to unplaced items.`,
    );
    queueFocus(() => focusSourceHandle(rootRef.current, item.id));
  };
  const handleDragStart = (event: DragStartEvent) => {
    if (!canPlace) return;
    const itemId = runtimeCategoriseItemId(event.active.data.current);
    if (!itemId) return;
    setDraggingItemId(itemId);
    setSelectedItemId(null);
  };
  const handleDragOver = (event: DragOverEvent) => {
    if (!canPlace) return;
    setHoveredCategoryId(runtimeCategoriseCategoryId(event.over?.data.current));
  };
  const handleDragEnd = (event: DragEndEvent) => {
    if (!canPlace) {
      clearDragState();
      return;
    }
    const itemId = runtimeCategoriseItemId(event.active.data.current);
    const categoryId = runtimeCategoriseCategoryId(event.over?.data.current);
    if (itemId && categoryId) {
      commitPlacement(itemId, categoryId, { announce: false });
      return;
    }
    clearDragState();
  };

  return (
    <NodeViewWrapper
      ref={rootRef}
      role="group"
      aria-label={legend || undefined}
      aria-labelledby={legend ? undefined : assessmentPromptDomId(authoredBlockId)}
      data-bounded-scroll-frame=""
      data-slot="categorise-content"
      className="sc-course-categorise__content sc-course-categorise__content--runtime"
    >
      <div data-bounded-scroll="" className="sc-course-categorise__scroll">
        <DndContext
          accessibility={{
            announcements,
            screenReaderInstructions: categoriseScreenReaderInstructions,
          }}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragCancel={clearDragState}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragStart={handleDragStart}
        >
          <div className="sc-course-categorise__flow">
            <div className="sc-course-categorise__completeness" role="status" aria-live="polite">
              {placedCount} of {items.length} items placed
            </div>
            <section
              className="sc-course-categorise__source"
              aria-labelledby={`${authoredBlockId ?? "categorise"}-source-label`}
            >
              <h3
                id={`${authoredBlockId ?? "categorise"}-source-label`}
                className="sc-course-categorise__source-label"
              >
                Unplaced items
              </h3>
              <div className="sc-course-categorise__source-grid">
                {sourceItems.map((item) => {
                  const sourcePosition =
                    items.findIndex((candidate) => candidate.id === item.id) + 1;
                  const selected = selectedItemId === item.id;
                  return (
                    <CategoriseRuntimeSourceItem
                      key={item.id}
                      canPlace={canPlace}
                      description={describeCategoriseSourceItemAccessibilityState({
                        interactionLocked: !canPlace,
                        selected,
                      })}
                      item={item}
                      position={sourcePosition}
                      selected={selected}
                      total={items.length}
                      onSelect={() => {
                        if (!canPlace) return;
                        setSelectedItemId(selected ? null : item.id);
                      }}
                    />
                  );
                })}
                {sourceItems.length === 0 ? (
                  <p className="sc-course-categorise__source-empty">All items are placed.</p>
                ) : null}
              </div>
            </section>

            <div className="sc-course-categorise__bin-grid">
              {categories.map((category) => {
                const placed = items.filter((item) => displayPlacements[item.id] === category.id);
                return (
                  <CategoriseRuntimeCategory
                    key={category.id}
                    active={hoveredCategoryId === category.id}
                    authorizedReveal={authorizedReveal}
                    canPlace={canPlace}
                    category={category}
                    feedbackResultItems={feedbackResult?.items ?? null}
                    items={placed}
                    selectedItem={selectedItem}
                    showFeedback={showFeedback}
                    submitted={submitted || hasFeedback}
                    onPlaceSelected={() => {
                      if (selectedItem) commitPlacement(selectedItem.id, category.id);
                    }}
                    onRemovePlacement={(item) => removePlacement(item, category)}
                  />
                );
              })}
            </div>
          </div>
          <DragOverlay dropAnimation={assessmentDndDropAnimationFor(reducedMotion)}>
            {draggingItem ? (
              <div className="sc-course-categorise__drag-preview">
                <span className="sc-course-categorise__preview-handle" aria-hidden>
                  <DotsSixVertical size={iconSm} weight="bold" />
                </span>
                <div className="sc-course-categorise__item-content">
                  {renderStaticHtml(draggingItem.html, draggingItem.label)}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      <div data-bounded-scroll-hint="" aria-hidden="true">
        Scroll for more ↓
      </div>
      <span className="sc-sr-only" role="status" aria-live="polite" aria-atomic="true">
        {placementAnnouncement}
      </span>
    </NodeViewWrapper>
  );
}

function CategoriseRuntimeSourceItem({
  canPlace,
  description,
  item,
  onSelect,
  position,
  selected,
  total,
}: {
  canPlace: boolean;
  description: string;
  item: CategoriseItemProjection;
  onSelect: () => void;
  position: number;
  selected: boolean;
  total: number;
}) {
  const descriptionId = useId();
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform } =
    useDraggable({
      id: item.id,
      disabled: !canPlace,
      data: { categoriseRuntimeItem: true, itemId: item.id },
    });
  const style: CSSProperties = {
    transform: isDragging ? undefined : CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      aria-describedby={descriptionId}
      data-selectable={canPlace || undefined}
      data-drag-source={isDragging || undefined}
      data-item-id={item.id}
      data-selected={selected || undefined}
      style={style}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a")) return;
        onSelect();
      }}
      className="sc-course-categorise__source-item"
    >
      <button
        {...attributes}
        {...listeners}
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Select ‘${item.label}’, item ${position} of ${total}`}
        aria-pressed={selected}
        data-item-id={item.id}
        data-runtime-categorise-handle=""
        disabled={!canPlace}
        className="sc-course-categorise__item-handle"
      >
        <DotsSixVertical size={iconSm} weight="bold" aria-hidden />
      </button>
      <div className="sc-course-categorise__item-content">
        {renderStaticHtml(item.html, item.label)}
      </div>
      <span id={descriptionId} className="sc-sr-only">
        {description}
      </span>
    </div>
  );
}

function CategoriseRuntimeCategory({
  active,
  authorizedReveal,
  canPlace,
  category,
  feedbackResultItems,
  items,
  onPlaceSelected,
  onRemovePlacement,
  selectedItem,
  showFeedback,
  submitted,
}: {
  active: boolean;
  authorizedReveal: CategoriseReveal | null;
  canPlace: boolean;
  category: CategoriseCategoryProjection;
  feedbackResultItems: CategoriseFeedbackResultItems | null;
  items: CategoriseItemProjection[];
  onPlaceSelected: () => void;
  onRemovePlacement: (item: CategoriseItemProjection) => void;
  selectedItem: CategoriseItemProjection | null;
  showFeedback: boolean;
  submitted: boolean;
}) {
  const descriptionId = useId();
  const { isOver, setNodeRef } = useDroppable({
    id: `category:${category.id}`,
    disabled: !canPlace,
    data: { categoriseRuntimeCategory: true, categoryId: category.id },
  });
  const activeDrop = isOver || active;

  return (
    <section
      ref={setNodeRef}
      role="group"
      aria-label={`Category ‘${category.label}’`}
      aria-describedby={descriptionId}
      data-bin-id={category.id}
      data-drop-active={activeDrop || undefined}
      data-placement-ready={selectedItem && canPlace ? "" : undefined}
      className="sc-course-categorise__runtime-bin"
    >
      <span id={descriptionId} className="sc-sr-only">
        {describeCategoriseCategoryAccessibilityState({
          activeDrop: activeDrop || Boolean(selectedItem && canPlace),
          placedCount: items.length,
        })}
      </span>
      {selectedItem && canPlace ? (
        <button
          type="button"
          aria-label={`Place ‘${selectedItem.label}’ in ‘${category.label}’`}
          onClick={onPlaceSelected}
          className="sc-course-categorise__placement-target"
        />
      ) : null}
      <div className="sc-course-categorise__runtime-bin-header">
        <div className="sc-course-categorise__runtime-bin-title">
          {renderStaticHtml(category.html, category.label)}
        </div>
      </div>
      <div className="sc-course-categorise__placed-items">
        {items.map((item) => (
          <CategoriseRuntimePlacedItem
            key={item.id}
            authorizedReveal={authorizedReveal}
            canPlace={canPlace}
            category={category}
            feedbackResultItems={feedbackResultItems}
            item={item}
            showFeedback={showFeedback}
            submitted={submitted}
            onRemovePlacement={() => onRemovePlacement(item)}
          />
        ))}
        {items.length === 0 ? (
          <span className="sc-course-categorise__empty-bin">Drop items here.</span>
        ) : null}
      </div>
    </section>
  );
}

function CategoriseRuntimePlacedItem({
  authorizedReveal,
  canPlace,
  category,
  feedbackResultItems,
  item,
  onRemovePlacement,
  showFeedback,
  submitted,
}: {
  authorizedReveal: CategoriseReveal | null;
  canPlace: boolean;
  category: CategoriseCategoryProjection;
  feedbackResultItems: CategoriseFeedbackResultItems | null;
  item: CategoriseItemProjection;
  onRemovePlacement: () => void;
  showFeedback: boolean;
  submitted: boolean;
}) {
  const detail = feedbackResultItems?.[item.id] ?? null;
  const revealed = authorizedReveal !== null;
  const correct = revealed ? true : showFeedback && detail ? detail.correct : null;
  const feedback =
    revealed && authorizedReveal.feedbackByItemId[item.id] !== undefined
      ? authorizedReveal.feedbackByItemId[item.id]
      : detail?.feedback;
  const parsedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);
  const descriptionId = useId();
  const courseState =
    showFeedback && correct !== null ? (correct ? "correct" : "incorrect") : undefined;

  return (
    <div
      role="group"
      aria-label={`Placed ‘${item.label}’ in ‘${category.label}’`}
      aria-describedby={descriptionId}
      data-course-state={courseState}
      data-placed-item-id={item.id}
      className="sc-course-categorise__placed-item"
    >
      <div className="sc-course-categorise__placed-item-row">
        <div className="sc-course-categorise__item-content">
          {renderStaticHtml(item.html, item.label)}
        </div>
        {canPlace ? (
          <button
            type="button"
            aria-label={`Return ‘${item.label}’ to unplaced items`}
            onClick={onRemovePlacement}
            className="sc-course-categorise__remove-action"
          >
            <X size={iconSm} aria-hidden />
          </button>
        ) : null}
      </div>
      {courseState || (showFeedback && parsedFeedback.success) ? (
        <div className="sc-course-categorise__placed-item-status">
          {courseState ? (
            <span className="sc-course-categorise__state-cue">
              {courseState === "correct" ? (
                <CheckCircle size={iconSm} weight="fill" aria-hidden />
              ) : (
                <XCircle size={iconSm} weight="fill" aria-hidden />
              )}
              <span>
                {courseState === "correct" ? "Correct placement" : "Incorrect placement"}
              </span>
            </span>
          ) : null}
          {showFeedback && parsedFeedback.success ? (
            <RichFeedbackRuntimePopover feedback={parsedFeedback.data} />
          ) : null}
        </div>
      ) : null}
      <span id={descriptionId} className="sc-sr-only">
        {describeCategorisePlacedItemAccessibilityState({
          correct,
          hasFeedback: showFeedback && parsedFeedback.success,
          revealed,
          submitted,
        })}
      </span>
    </div>
  );
}

const categoriseCategoryKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.code)) {
    return undefined;
  }
  const categories = context.droppableContainers
    .getEnabled()
    .filter((container) => container.data.current?.["categoriseRuntimeCategory"] === true);
  if (categories.length === 0) return undefined;
  const currentIndex = context.over
    ? categories.findIndex((container) => container.id === context.over?.id)
    : -1;
  const forward = event.code === "ArrowDown" || event.code === "ArrowRight";
  const targetIndex =
    currentIndex < 0
      ? forward
        ? 0
        : categories.length - 1
      : (currentIndex + (forward ? 1 : -1) + categories.length) % categories.length;
  const target = categories[targetIndex];
  const rect = target ? context.droppableRects.get(target.id) : undefined;
  const collisionRect = context.collisionRect;
  if (!rect || !collisionRect) return undefined;
  event.preventDefault();
  return {
    x: rect.left + (rect.width - collisionRect.width) / 2,
    y: rect.top + (rect.height - collisionRect.height) / 2,
  };
};

function categoriseAnnouncements(
  items: readonly CategoriseItemProjection[],
  categories: readonly CategoriseCategoryProjection[],
): Announcements {
  const itemLabelById = new Map(items.map((item) => [item.id, item.label]));
  const categoryLabelById = new Map(
    categories.map((category) => [`category:${category.id}`, category.label]),
  );
  const itemLabel = (id: string | number) => itemLabelById.get(String(id)) ?? "item";
  const categoryLabel = (id: string | number) => categoryLabelById.get(String(id)) ?? "category";
  return {
    onDragStart({ active }) {
      return `Lifted ‘${itemLabel(active.id)}’. Move to a category and drop to place it.`;
    },
    onDragOver({ active, over }) {
      if (!over) return `‘${itemLabel(active.id)}’ is outside a category.`;
      return `‘${itemLabel(active.id)}’ is over ‘${categoryLabel(over.id)}’.`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `‘${itemLabel(active.id)}’ was not placed.`;
      return `Placed ‘${itemLabel(active.id)}’ in ‘${categoryLabel(over.id)}’.`;
    },
    onDragCancel({ active }) {
      return `Cancelled placing ‘${itemLabel(active.id)}’.`;
    },
  };
}

function runtimeCategoriseItemId(data: Record<string, unknown> | undefined): string | null {
  if (data?.["categoriseRuntimeItem"] !== true) return null;
  const itemId = data["itemId"];
  return typeof itemId === "string" && itemId.trim() ? itemId : null;
}

function runtimeCategoriseCategoryId(data: Record<string, unknown> | undefined): string | null {
  if (data?.["categoriseRuntimeCategory"] !== true) return null;
  const categoryId = data["categoryId"];
  return typeof categoryId === "string" && categoryId.trim() ? categoryId : null;
}

function sameRecord(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const leftEntries = Object.entries(left);
  return (
    leftEntries.length === Object.keys(right).length &&
    leftEntries.every(([key, value]) => right[key] === value)
  );
}

function focusSourceHandle(root: HTMLElement | null, itemId: string): boolean {
  const handle = Array.from(
    root?.querySelectorAll<HTMLElement>("[data-runtime-categorise-handle]") ?? [],
  ).find((element) => element.dataset["itemId"] === itemId);
  handle?.focus();
  return Boolean(handle);
}

function queueFocus(focus: () => void): void {
  window.setTimeout(() => window.setTimeout(focus, 0), 0);
}

function safeSelectorValue(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function renderStaticHtml(html: string, fallback: string) {
  if (!html) return fallback;
  return (
    <div className="sc-course-categorise__static-html" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
