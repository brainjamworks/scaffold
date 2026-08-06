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
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AssessmentFeedbackContentSchema, type AssessmentItemDetail } from "@scaffold/contracts";

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
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import { iconSm } from "@/ui/tokens/icon-sizes";

import {
  EMPTY_MATCHES,
  createMatchingItemNode,
  createMatchingPairNode,
  createMatchingPairsGroupNode,
  createMatchingTargetNode,
  getMatchingConnectorCoordinates,
  getMatchingConnectorPath,
  matchedItemId,
  reconcileMatchingMatches,
  resolveAuthorizedMatchingReveal,
  type MatchingConnector,
  type MatchingProjectionPair,
} from "./matching-fields-shared";
import "./Matching.css";

export {
  answerMatchesFromReveal,
  describeMatchingItemAccessibilityState,
  describeMatchingTargetAccessibilityState,
  getMatchingConnectorPath,
} from "./matching-fields-shared";

export const MatchingItemRuntimeNode = createMatchingItemNode();
export const MatchingTargetRuntimeNode = createMatchingTargetNode();
export const MatchingPairRuntimeNode = createMatchingPairNode();

const EMPTY_FEEDBACK_ITEMS: Record<string, AssessmentItemDetail> = {};

const matchingScreenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    "To pick up an unmatched item, press Space or Enter. Use an Arrow key to move over a match target. Press Space or Enter again to match it, or Escape to cancel. You can also select the item and use a named Match button in a target.",
};

export const MatchingPairsGroupRuntimeNode = createMatchingPairsGroupNode({
  addNodeView: () => ReactNodeViewRenderer(MatchingPairsGroupRuntimeNodeView),
});

function MatchingPairsGroupRuntimeNodeView(props: NodeViewProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [transitionAnnouncement, setTransitionAnnouncement] = useState("");
  const [connectors, setConnectors] = useState<MatchingConnector[]>([]);
  const reducedMotion = useAssessmentDndReducedMotion();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 9 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: matchingTargetKeyboardCoordinates,
      scrollBehavior: reducedMotion ? "auto" : "smooth",
    }),
  );
  const pos = safeGetPos(props.getPos);
  const authoredBlockId = findAncestorAssessmentBlockId(props.editor, pos ?? undefined, [
    "matching",
  ]);
  const assessment = useAssessmentRuntimeById(authoredBlockId, "match");
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const pairs = useMemo(
    () => projectionsFromGroup(props.node, serializer),
    [props.node, serializer],
  );
  const targets = useMemo(
    () =>
      pairs.map((pair) => ({
        id: pair.targetId,
        html: pair.targetHtml,
        label: pair.targetLabel,
      })),
    [pairs],
  );
  const itemIds = useMemo(() => pairs.map((pair) => pair.itemId), [pairs]);
  const targetIds = useMemo(() => targets.map((target) => target.id), [targets]);
  const itemIdsKey = itemIds.join("|");
  const targetIdsKey = targetIds.join("|");
  const itemById = useMemo(() => new Map(pairs.map((pair) => [pair.itemId, pair])), [pairs]);
  const targetById = useMemo(
    () => new Map(targets.map((target) => [target.id, target])),
    [targets],
  );
  const responseMatches = problem?.matches ?? EMPTY_MATCHES;
  const responseMatchesKey = JSON.stringify(responseMatches);
  const submitted = runtimeProblem?.state.submitted ?? false;
  const feedbackResult = runtimeProblem?.feedbackResult ?? null;
  const feedbackItems = feedbackResult?.items ?? EMPTY_FEEDBACK_ITEMS;
  const answerKeyVisible = runtimeProblem?.answerKeyVisible ?? false;
  const authorizedReveal = resolveAuthorizedMatchingReveal({
    answerKeyVisible,
    answers: runtimeProblem?.state.revealedAnswer?.answers ?? null,
    feedbackItems: feedbackResult?.items ?? null,
    itemIds,
    targetIds,
  });
  const revealed = authorizedReveal !== null;
  const displayMatches = authorizedReveal?.matches ?? responseMatches;
  const showFeedback =
    submitted ||
    revealed ||
    (runtimeProblem?.state.feedbackMode === "immediate" && feedbackResult !== null);
  const interactionLocked = runtimeProblem?.interactionLocked ?? true;
  const canMatch = Boolean(problem && runtimeProblem && !interactionLocked);
  const matchedCount = itemIds.filter((itemId) => displayMatches[itemId] !== undefined).length;
  const selectedItem = selectedItemId ? (itemById.get(selectedItemId) ?? null) : null;
  const draggingItem = draggingItemId ? (itemById.get(draggingItemId) ?? null) : null;
  const durableResponse = assessment?.response.durable ?? null;
  const durableResponseKey = JSON.stringify(durableResponse);
  const projectedResponseKey = JSON.stringify(assessment?.response.projected ?? null);
  const setMatches = problem?.setMatches;
  const legend = (runtimeProblem?.state.legend ?? assessment?.problemConfig.legend ?? "").trim();
  const announcements = useMemo(() => matchingAnnouncements(pairs, targets), [pairs, targets]);
  const matchSignature = Object.entries(displayMatches)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, targetId]) => `${itemId}:${targetId}`)
    .join("|");
  const feedbackSignature = Object.entries(feedbackItems)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([itemId, detail]) => `${itemId}:${detail.correct}`)
    .join("|");

  useEffect(() => {
    if (!setMatches || interactionLocked || submitted || answerKeyVisible) return;
    const reconciled = reconcileMatchingMatches(responseMatches, itemIds, targetIds);
    const durableNeedsCanonicalization =
      durableResponse !== null && durableResponseKey !== projectedResponseKey;
    if (sameRecord(reconciled, responseMatches) && !durableNeedsCanonicalization) return;
    setMatches(reconciled);
  }, [
    answerKeyVisible,
    durableResponse,
    durableResponseKey,
    interactionLocked,
    itemIds,
    itemIdsKey,
    projectedResponseKey,
    responseMatches,
    responseMatchesKey,
    setMatches,
    submitted,
    targetIds,
    targetIdsKey,
  ]);

  useEffect(() => {
    if (!selectedItemId || draggingItemId) return;
    const ownerDocument = rootRef.current?.ownerDocument;
    if (!ownerDocument) return;
    const cancelSelection = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      const item = itemById.get(selectedItemId);
      setSelectedItemId(null);
      if (item) setTransitionAnnouncement(`Cancelled selecting ‘${item.itemLabel}’.`);
      queueFocus(() => focusItemHandle(rootRef.current, selectedItemId));
    };
    ownerDocument.addEventListener("keydown", cancelSelection);
    return () => ownerDocument.removeEventListener("keydown", cancelSelection);
  }, [draggingItemId, itemById, selectedItemId]);

  useLayoutEffect(() => {
    const updateConnectors = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const containerRect = canvas.getBoundingClientRect();
      const next: MatchingConnector[] = [];
      for (const [itemId, targetId] of Object.entries(displayMatches)) {
        const itemElement = elementByDataAttr(canvas, "data-item-id", itemId);
        const targetElement = elementByDataAttr(canvas, "data-target-id", targetId);
        if (!itemElement || !targetElement) continue;
        const feedbackItem = feedbackItems[itemId];
        const state =
          revealed || (showFeedback && feedbackItem?.correct === true)
            ? "correct"
            : showFeedback && feedbackItem?.correct === false
              ? "incorrect"
              : "default";
        next.push({
          itemId,
          targetId,
          ...getMatchingConnectorCoordinates({
            canvasHeight: canvas.clientHeight,
            canvasWidth: canvas.clientWidth,
            containerRect,
            itemRect: itemElement.getBoundingClientRect(),
            targetRect: targetElement.getBoundingClientRect(),
          }),
          state,
        });
      }
      setConnectors((current) => (sameConnectors(current, next) ? current : next));
    };

    updateConnectors();
    const canvas = canvasRef.current;
    const ResizeObserverCtor = canvas?.ownerDocument.defaultView?.ResizeObserver;
    const resizeObserver = ResizeObserverCtor ? new ResizeObserverCtor(updateConnectors) : null;
    if (canvas && resizeObserver) {
      resizeObserver.observe(canvas);
      canvas
        .querySelectorAll<HTMLElement>(
          "[data-matching-draggable-item], [data-matching-drop-target]",
        )
        .forEach((element) => resizeObserver.observe(element));
    }
    const ownerWindow = canvas?.ownerDocument.defaultView;
    ownerWindow?.addEventListener("resize", updateConnectors);
    return () => {
      resizeObserver?.disconnect();
      ownerWindow?.removeEventListener("resize", updateConnectors);
    };
  }, [
    displayMatches,
    feedbackItems,
    feedbackSignature,
    matchSignature,
    pairs,
    revealed,
    showFeedback,
  ]);

  const clearDragState = () => {
    setDraggingItemId(null);
    setHoverTargetId(null);
  };
  const focusAfterMatch = (itemId: string, nextMatches: Record<string, string>) => {
    const itemIndex = pairs.findIndex((pair) => pair.itemId === itemId);
    const cyclingOrder = [...pairs.slice(itemIndex + 1), ...pairs.slice(0, itemIndex)];
    const nextItem = cyclingOrder.find((pair) => nextMatches[pair.itemId] === undefined);
    queueFocus(() => {
      if (nextItem && focusItemHandle(rootRef.current, nextItem.itemId)) return;
      if (Object.keys(nextMatches).length === pairs.length) {
        const submit = rootRef.current
          ?.closest("[data-assessment-shell]")
          ?.querySelector<HTMLElement>('[data-assessment-submission-action="submit"]');
        if (submit) {
          submit.focus();
          return;
        }
      }
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-matched-item-id="${safeSelectorValue(itemId)}"] button`)
        ?.focus();
    });
  };
  const commitMatch = (
    itemId: string,
    targetId: string,
    { announce = true }: { announce?: boolean } = {},
  ) => {
    if (!canMatch || !problem) return;
    const item = itemById.get(itemId);
    const target = targetById.get(targetId);
    if (!item || !target) return;
    const nextMatches = Object.fromEntries(
      Object.entries(responseMatches).filter(
        ([currentItemId, currentTargetId]) =>
          currentItemId !== itemId && currentTargetId !== targetId,
      ),
    );
    nextMatches[itemId] = targetId;
    problem.setMatch(itemId, targetId);
    if (announce) setTransitionAnnouncement(`Matched ‘${item.itemLabel}’ with ‘${target.label}’.`);
    setSelectedItemId(null);
    clearDragState();
    focusAfterMatch(itemId, nextMatches);
  };
  const removeMatch = (item: MatchingProjectionPair, targetId: string) => {
    if (!canMatch || !problem) return;
    const target = targetById.get(targetId);
    problem.removeTargetMatch(targetId);
    setTransitionAnnouncement(`Removed ‘${item.itemLabel}’ from ‘${target?.label ?? "target"}’.`);
    queueFocus(() => focusItemHandle(rootRef.current, item.itemId));
  };
  const handleDragStart = (event: DragStartEvent) => {
    if (!canMatch) return;
    const itemId = runtimeMatchingItemId(event.active.data.current);
    if (!itemId || responseMatches[itemId] !== undefined) return;
    setDraggingItemId(itemId);
    setSelectedItemId(null);
  };
  const handleDragOver = (event: DragOverEvent) => {
    if (!canMatch) return;
    setHoverTargetId(runtimeMatchingTargetId(event.over?.data.current));
  };
  const handleDragEnd = (event: DragEndEvent) => {
    if (!canMatch) {
      clearDragState();
      return;
    }
    const itemId = runtimeMatchingItemId(event.active.data.current);
    const targetId = runtimeMatchingTargetId(event.over?.data.current);
    if (itemId && targetId) {
      commitMatch(itemId, targetId, { announce: false });
      return;
    }
    clearDragState();
  };
  const handleDragCancel = () => {
    const cancelledItemId = draggingItemId;
    clearDragState();
    if (cancelledItemId) queueFocus(() => focusItemHandle(rootRef.current, cancelledItemId));
  };

  return (
    <NodeViewWrapper
      ref={rootRef}
      role="group"
      aria-label={legend || undefined}
      aria-labelledby={legend ? undefined : assessmentPromptDomId(authoredBlockId)}
      data-bounded-scroll-frame=""
      data-slot="matching-pairs-group"
      className="sc-course-matching__group sc-course-matching__group--runtime"
    >
      <div data-bounded-scroll="" className="sc-course-matching__scroll">
        <DndContext
          accessibility={{
            announcements,
            screenReaderInstructions: matchingScreenReaderInstructions,
          }}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragCancel={handleDragCancel}
          onDragEnd={handleDragEnd}
          onDragOver={handleDragOver}
          onDragStart={handleDragStart}
        >
          <div className="sc-course-matching__completeness" role="status" aria-live="polite">
            {matchedCount} of {pairs.length} pairs matched
          </div>
          <div ref={canvasRef} className="sc-course-matching__canvas">
            {connectors.length > 0 ? (
              <svg
                aria-hidden
                data-matching-connectors=""
                className="sc-course-matching__connectors"
              >
                {connectors.map((connector) => (
                  <g
                    key={`${connector.itemId}:${connector.targetId}`}
                    data-course-state={connector.state}
                    data-matching-connector-state={connector.state}
                    className="sc-course-matching__connector"
                  >
                    <path
                      d={getMatchingConnectorPath(connector)}
                      className="sc-course-matching__connector-path"
                    />
                    <circle
                      cx={connector.startX}
                      cy={connector.startY}
                      r={5}
                      className="sc-course-matching__connector-endpoint"
                    />
                    <circle
                      cx={connector.endX}
                      cy={connector.endY}
                      r={5}
                      className="sc-course-matching__connector-endpoint"
                    />
                  </g>
                ))}
              </svg>
            ) : null}
            <section
              className="sc-course-matching__column sc-course-matching__column--items"
              aria-labelledby={`${authoredBlockId ?? "matching"}-items-label`}
            >
              <h3
                id={`${authoredBlockId ?? "matching"}-items-label`}
                className="sc-course-matching__heading"
              >
                Items
              </h3>
              <div className="sc-course-matching__runtime-list">
                {pairs.map((pair, index) => (
                  <MatchingRuntimeItem
                    key={pair.itemId}
                    canMatch={canMatch}
                    dragging={draggingItemId === pair.itemId}
                    index={index}
                    matched={displayMatches[pair.itemId] !== undefined}
                    pair={pair}
                    selected={selectedItemId === pair.itemId}
                    total={pairs.length}
                    onSelect={() => {
                      if (!canMatch || displayMatches[pair.itemId] !== undefined) return;
                      setSelectedItemId((current) =>
                        current === pair.itemId ? null : pair.itemId,
                      );
                    }}
                  />
                ))}
              </div>
            </section>
            <section
              className="sc-course-matching__column sc-course-matching__column--targets"
              aria-labelledby={`${authoredBlockId ?? "matching"}-targets-label`}
            >
              <h3
                id={`${authoredBlockId ?? "matching"}-targets-label`}
                className="sc-course-matching__heading"
              >
                Matches
              </h3>
              <div className="sc-course-matching__runtime-list">
                {targets.map((target) => {
                  const matchedId = matchedItemId(displayMatches, target.id);
                  const matchedPair = matchedId ? (itemById.get(matchedId) ?? null) : null;
                  const feedbackItem = matchedPair ? feedbackItems[matchedPair.itemId] : undefined;
                  const correct =
                    matchedPair && revealed
                      ? true
                      : matchedPair && showFeedback && feedbackItem
                        ? feedbackItem.correct
                        : null;
                  const feedback =
                    matchedPair && authorizedReveal?.feedbackByItemId[matchedPair.itemId]
                      ? authorizedReveal.feedbackByItemId[matchedPair.itemId]
                      : feedbackItem?.feedback;
                  const parsedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);
                  return (
                    <MatchingRuntimeTarget
                      key={target.id}
                      active={hoverTargetId === target.id || selectedItem !== null}
                      canMatch={canMatch}
                      correct={correct}
                      matchedPair={matchedPair}
                      parsedFeedback={parsedFeedback.success ? parsedFeedback.data : null}
                      revealed={revealed}
                      selectedItem={selectedItem}
                      showFeedback={showFeedback}
                      submitted={submitted}
                      target={target}
                      onCommit={() => {
                        if (selectedItem) commitMatch(selectedItem.itemId, target.id);
                      }}
                      onRemove={() => {
                        if (matchedPair) removeMatch(matchedPair, target.id);
                      }}
                    />
                  );
                })}
              </div>
            </section>
          </div>
          <DragOverlay dropAnimation={assessmentDndDropAnimationFor(reducedMotion)}>
            {draggingItem ? (
              <div className="sc-course-matching__drag-preview">
                <span aria-hidden className="sc-course-matching__drag-preview-handle">
                  <DotsSixVertical size={iconSm} weight="bold" />
                </span>
                <div className="sc-course-matching__static-html">
                  {renderStaticHtml(draggingItem.itemHtml, draggingItem.itemLabel)}
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
        <div className="sc-sr-only" aria-live="polite" aria-atomic="true">
          {transitionAnnouncement}
        </div>
      </div>
      <div data-bounded-scroll-hint="" aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}

function MatchingRuntimeItem({
  canMatch,
  dragging,
  index,
  matched,
  onSelect,
  pair,
  selected,
  total,
}: {
  canMatch: boolean;
  dragging: boolean;
  index: number;
  matched: boolean;
  onSelect: () => void;
  pair: MatchingProjectionPair;
  selected: boolean;
  total: number;
}) {
  const descriptionId = useId();
  const disabled = !canMatch || matched;
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform } =
    useDraggable({
      id: pair.itemId,
      disabled,
      data: { matchingRuntimeItem: true, itemId: pair.itemId },
    });
  const style =
    transform && !isDragging ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`Item ‘${pair.itemLabel}’`}
      aria-describedby={descriptionId}
      data-matching-draggable-item=""
      data-item-id={pair.itemId}
      data-selected={selected || undefined}
      data-matched={matched || undefined}
      onClick={disabled ? undefined : onSelect}
      style={style}
      className="sc-course-matching__item"
    >
      <button
        {...attributes}
        {...listeners}
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Select ‘${pair.itemLabel}’, item ${index + 1} of ${total}`}
        aria-pressed={selected}
        disabled={disabled}
        data-runtime-matching-handle=""
        data-item-id={pair.itemId}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        className="sc-course-matching__item-handle"
      >
        <DotsSixVertical size={iconSm} weight="bold" aria-hidden />
      </button>
      <div className="sc-course-matching__item-content">
        {renderStaticHtml(pair.itemHtml, pair.itemLabel)}
      </div>
      <span id={descriptionId} className="sc-sr-only">
        {selected
          ? "Selected item"
          : matched
            ? "Matched item"
            : canMatch
              ? "Available item"
              : "Matching locked"}
      </span>
      {(dragging || isDragging) && <span className="sc-sr-only">Dragging</span>}
    </div>
  );
}

function MatchingRuntimeTarget({
  active,
  canMatch,
  correct,
  matchedPair,
  onCommit,
  onRemove,
  parsedFeedback,
  revealed,
  selectedItem,
  showFeedback,
  submitted,
  target,
}: {
  active: boolean;
  canMatch: boolean;
  correct: boolean | null;
  matchedPair: MatchingProjectionPair | null;
  onCommit: () => void;
  onRemove: () => void;
  parsedFeedback: ReturnType<typeof AssessmentFeedbackContentSchema.parse> | null;
  revealed: boolean;
  selectedItem: MatchingProjectionPair | null;
  showFeedback: boolean;
  submitted: boolean;
  target: { id: string; html: string; label: string };
}) {
  const descriptionId = useId();
  const { isOver, setNodeRef } = useDroppable({
    id: `target:${target.id}`,
    disabled: !canMatch,
    data: { matchingRuntimeTarget: true, targetId: target.id },
  });
  const courseState = showFeedback && correct !== null ? (correct ? "correct" : "incorrect") : null;
  const activeTarget = isOver || active;

  return (
    <section
      ref={setNodeRef}
      role="group"
      aria-label={`Target ‘${target.label}’`}
      aria-describedby={descriptionId}
      data-matching-drop-target=""
      data-target-id={target.id}
      data-active={activeTarget || undefined}
      data-course-state={courseState ?? undefined}
      onClick={selectedItem && canMatch ? onCommit : undefined}
      className="sc-course-matching__target"
    >
      <div className="sc-course-matching__target-content">
        {renderStaticHtml(target.html, target.label)}
      </div>
      {selectedItem && canMatch ? (
        <button
          type="button"
          aria-label={`Match ‘${selectedItem.itemLabel}’ with ‘${target.label}’`}
          onClick={(event) => {
            event.stopPropagation();
            onCommit();
          }}
          className="sc-course-matching__place-action"
        />
      ) : null}
      {matchedPair ? (
        <div
          role="group"
          aria-label={`Matched ‘${matchedPair.itemLabel}’ with ‘${target.label}’`}
          data-matched-item-id={matchedPair.itemId}
          data-course-state={courseState ?? undefined}
          className="sc-course-matching__matched-item"
        >
          <div className="sc-course-matching__matched-content">
            {renderStaticHtml(matchedPair.itemHtml, matchedPair.itemLabel)}
          </div>
          {canMatch ? (
            <button
              type="button"
              aria-label={`Remove ‘${matchedPair.itemLabel}’ from ‘${target.label}’`}
              onClick={(event) => {
                event.stopPropagation();
                onRemove();
              }}
              className="sc-course-matching__remove-action"
            >
              <X size={iconSm} aria-hidden />
            </button>
          ) : null}
          {courseState || (showFeedback && parsedFeedback) ? (
            <div className="sc-course-matching__matched-status">
              {courseState ? (
                <span className="sc-course-matching__state-cue">
                  {courseState === "correct" ? (
                    <CheckCircle size={iconSm} weight="fill" aria-hidden />
                  ) : (
                    <XCircle size={iconSm} weight="fill" aria-hidden />
                  )}
                  <span>{courseState === "correct" ? "Correct match" : "Incorrect match"}</span>
                </span>
              ) : null}
              {showFeedback && parsedFeedback ? (
                <RichFeedbackRuntimePopover feedback={parsedFeedback} />
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="sc-course-matching__empty-target">Drop an item here</p>
      )}
      <span id={descriptionId} className="sc-sr-only">
        {matchedPair
          ? `Matched with ‘${matchedPair.itemLabel}’${
              revealed
                ? ". Revealed correct match"
                : submitted && correct === true
                  ? ". Submitted match, correct"
                  : submitted && correct === false
                    ? ". Submitted match, incorrect"
                    : ""
            }${showFeedback && parsedFeedback ? ". Feedback available" : ""}`
          : activeTarget
            ? "Ready to match selected item"
            : "No item matched"}
      </span>
    </section>
  );
}

const matchingTargetKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  if (!["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(event.code)) {
    return undefined;
  }
  const targets = context.droppableContainers
    .getEnabled()
    .filter((container) => container.data.current?.["matchingRuntimeTarget"] === true);
  if (targets.length === 0) return undefined;
  const currentIndex = context.over
    ? targets.findIndex((container) => container.id === context.over?.id)
    : -1;
  const forward = event.code === "ArrowDown" || event.code === "ArrowRight";
  const targetIndex =
    currentIndex < 0
      ? forward
        ? 0
        : targets.length - 1
      : (currentIndex + (forward ? 1 : -1) + targets.length) % targets.length;
  const target = targets[targetIndex];
  const rect = target ? context.droppableRects.get(target.id) : undefined;
  const collisionRect = context.collisionRect;
  if (!rect || !collisionRect) return undefined;
  event.preventDefault();
  return {
    x: rect.left + (rect.width - collisionRect.width) / 2,
    y: rect.top + (rect.height - collisionRect.height) / 2,
  };
};

function matchingAnnouncements(
  items: readonly MatchingProjectionPair[],
  targets: readonly { id: string; label: string }[],
): Announcements {
  const itemLabels = new Map(items.map((item) => [item.itemId, item.itemLabel]));
  const targetLabels = new Map(targets.map((target) => [`target:${target.id}`, target.label]));
  const itemLabel = (id: string | number) => itemLabels.get(String(id)) ?? "item";
  const targetLabel = (id: string | number) => targetLabels.get(String(id)) ?? "target";
  return {
    onDragStart({ active }) {
      return `Lifted ‘${itemLabel(active.id)}’. Move to a target and drop to match it.`;
    },
    onDragOver({ active, over }) {
      if (!over) return `‘${itemLabel(active.id)}’ is outside a match target.`;
      return `‘${itemLabel(active.id)}’ is over ‘${targetLabel(over.id)}’.`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `‘${itemLabel(active.id)}’ was not matched.`;
      return `Matched ‘${itemLabel(active.id)}’ with ‘${targetLabel(over.id)}’.`;
    },
    onDragCancel({ active }) {
      return `Cancelled matching ‘${itemLabel(active.id)}’.`;
    },
  };
}

function runtimeMatchingItemId(data: Record<string, unknown> | undefined): string | null {
  if (data?.["matchingRuntimeItem"] !== true) return null;
  const itemId = data["itemId"];
  return typeof itemId === "string" && itemId.trim() ? itemId : null;
}

function runtimeMatchingTargetId(data: Record<string, unknown> | undefined): string | null {
  if (data?.["matchingRuntimeTarget"] !== true) return null;
  const targetId = data["targetId"];
  return typeof targetId === "string" && targetId.trim() ? targetId : null;
}

function projectionsFromGroup(node: PMNode, serializer: DOMSerializer): MatchingProjectionPair[] {
  const pairs: MatchingProjectionPair[] = [];
  node.forEach((pair) => {
    if (pair.type.name !== "matching_pair") return;
    const itemId = String(pair.attrs["itemId"] ?? "");
    const targetId = String(pair.attrs["targetId"] ?? "");
    if (!itemId || !targetId) return;
    const item = childByType(pair, "matching_item");
    const target = childByType(pair, "matching_target");
    const index = pairs.length + 1;
    pairs.push({
      itemId,
      targetId,
      itemHtml: fieldHtml(serializer, item),
      targetHtml: fieldHtml(serializer, target),
      itemLabel: item?.textContent.trim() || `Item ${index}`,
      targetLabel: target?.textContent.trim() || `Target ${index}`,
    });
  });
  return pairs;
}

function childByType(node: PMNode, typeName: string): PMNode | null {
  let found: PMNode | null = null;
  node.forEach((child) => {
    if (!found && child.type.name === typeName) found = child;
  });
  return found;
}

function fieldHtml(serializer: DOMSerializer, node: PMNode | null): string {
  return node ? serializeStaticRichTextHtml(serializer, node.content) : "";
}

function renderStaticHtml(html: string, fallback: string) {
  if (!html) return fallback;
  return (
    <div className="sc-course-matching__static-html" dangerouslySetInnerHTML={{ __html: html }} />
  );
}

function elementByDataAttr(
  container: HTMLElement,
  attr: string,
  value: string,
): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>(`[${attr}]`)).find(
      (element) => element.getAttribute(attr) === value,
    ) ?? null
  );
}

function sameConnectors(left: readonly MatchingConnector[], right: readonly MatchingConnector[]) {
  return (
    left.length === right.length &&
    left.every((connector, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        connector.itemId === other.itemId &&
        connector.targetId === other.targetId &&
        connector.startX === other.startX &&
        connector.startY === other.startY &&
        connector.endX === other.endX &&
        connector.endY === other.endY &&
        connector.state === other.state
      );
    })
  );
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

function focusItemHandle(root: HTMLElement | null, itemId: string): boolean {
  const handle = Array.from(
    root?.querySelectorAll<HTMLElement>("[data-runtime-matching-handle]") ?? [],
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
