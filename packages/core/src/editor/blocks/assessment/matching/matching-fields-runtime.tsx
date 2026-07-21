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
import {
  CheckCircleIcon as CheckCircle,
  DotsSixVerticalIcon as DotsSixVertical,
  XIcon as X,
  XCircleIcon as XCircle,
} from "@phosphor-icons/react";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { CHOICE_TRAILING_BTN } from "@/editor/blocks/assessment/shared/chrome/ChoiceAnswerItem";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import type { AssessmentItemDetail } from "@scaffold/contracts";
import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import {
  RUNTIME_DRAG_HANDLE_CLASS,
  RUNTIME_DRAG_SOURCE_PLACEHOLDER_CLASS,
  RuntimeDragOverlay,
  RuntimeDragPreview,
} from "@/editor/blocks/assessment/shared/runtime/runtime-dnd";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import { cn } from "@/lib/cn";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { iconMd, iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import {
  EMPTY_MATCHES,
  MATCHING_CONNECTOR_PADDING,
  createMatchingItemNode,
  createMatchingPairNode,
  createMatchingPairsGroupNode,
  createMatchingTargetNode,
  describeMatchingItemAccessibilityState,
  describeMatchingTargetAccessibilityState,
  deterministicShuffle,
  getMatchingConnectorPath,
  matchedItemId,
  matchingRevealFromAnswers,
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

export const MatchingPairsGroupRuntimeNode = createMatchingPairsGroupNode({
  addNodeView: () => ReactNodeViewRenderer(MatchingPairsGroupRuntimeNodeView),
});

function MatchingPairsGroupRuntimeNodeView(props: NodeViewProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<MatchingConnector[]>([]);
  const matchingCanvasRef = useRef<HTMLDivElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const pos = safeGetPos(props.getPos);
  const problemId = findAncestorAssessmentId(props.editor, pos ?? undefined, ["matching"]);
  const assessment = useAssessmentRuntimeById(problemId, "match");
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

  const orderedTargets = deterministicShuffle(
    pairs.map((pair) => ({
      targetId: pair.targetId,
      targetHtml: pair.targetHtml,
    })),
    `${problemId ?? "matching"}|${pairs.map((pair) => pair.targetId).join("|")}`,
  );
  const pairByItemId = new Map(pairs.map((pair) => [pair.itemId, pair]));
  const draggingPair = draggingItemId ? (pairByItemId.get(draggingItemId) ?? null) : null;
  const responseMatches = problem?.matches ?? EMPTY_MATCHES;
  const answerKeyVisible = runtimeProblem?.answerKeyVisible ?? false;
  const hasRevealPayload = (runtimeProblem?.state.revealedAnswer ?? null) !== null;
  const reveal = matchingRevealFromAnswers(runtimeProblem?.state.revealedAnswer?.answers);
  const revealedMatches = reveal?.matches ?? {};
  const submitted = runtimeProblem?.state.submitted ?? false;
  const feedbackResult = runtimeProblem?.feedbackResult ?? null;
  const feedbackItems = feedbackResult?.items ?? EMPTY_FEEDBACK_ITEMS;
  const showFeedback =
    submitted ||
    answerKeyVisible ||
    (runtimeProblem?.state.feedbackMode === "immediate" && feedbackResult !== null);
  const interactionLocked = submitted || hasRevealPayload || (runtimeProblem?.exhausted ?? false);
  const displayMatches =
    answerKeyVisible && Object.keys(revealedMatches).length > 0 ? revealedMatches : responseMatches;
  const matchSignature = Object.entries(displayMatches)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemId, targetId]) => `${itemId}:${targetId}`)
    .join("|");
  const feedbackSignature = Object.entries(feedbackItems)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([itemId, item]) => `${itemId}:${item.correct}`)
    .join("|");

  useLayoutEffect(() => {
    const updateConnectors = () => {
      const container = matchingCanvasRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const next: MatchingConnector[] = [];

      Object.entries(displayMatches).forEach(([itemId, targetId]) => {
        const itemEl = elementByDataAttr(container, "data-item-id", itemId);
        const targetEl = elementByDataAttr(container, "data-target-id", targetId);
        if (!itemEl || !targetEl) return;

        const itemRect = itemEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const feedbackItem = feedbackItems[itemId] ?? null;
        const state =
          answerKeyVisible || (showFeedback && feedbackItem?.correct === true)
            ? "correct"
            : showFeedback && feedbackItem?.correct === false
              ? "incorrect"
              : "default";

        next.push({
          itemId,
          targetId,
          startX: itemRect.right - containerRect.left + MATCHING_CONNECTOR_PADDING,
          startY: itemRect.top - containerRect.top + itemRect.height / 2,
          endX: targetRect.left - containerRect.left - MATCHING_CONNECTOR_PADDING,
          endY: targetRect.top - containerRect.top + targetRect.height / 2,
          state,
        });
      });

      setConnectors((current) => (sameConnectors(current, next) ? current : next));
    };

    updateConnectors();
    if (typeof window === "undefined") return undefined;
    window.addEventListener("resize", updateConnectors);
    return () => window.removeEventListener("resize", updateConnectors);
  }, [
    answerKeyVisible,
    displayMatches,
    feedbackItems,
    feedbackSignature,
    matchSignature,
    pairs,
    showFeedback,
  ]);

  const commitMatch = (itemId: string, targetId: string) => {
    if (interactionLocked) return;
    problem?.setMatch(itemId, targetId);
    setSelectedItemId(null);
    setDraggingItemId(null);
    setHoverTargetId(null);
  };
  const clearDragState = () => {
    setDraggingItemId(null);
    setHoverTargetId(null);
  };
  const handleDragStart = (event: DragStartEvent) => {
    if (interactionLocked) return;
    const itemId = runtimeMatchingItemId(event.active.data.current);
    if (!itemId || displayMatches[itemId] !== undefined) {
      clearDragState();
      return;
    }
    setDraggingItemId(itemId);
    setSelectedItemId(null);
  };
  const handleDragOver = (event: DragOverEvent) => {
    if (interactionLocked) return;
    setHoverTargetId(runtimeMatchingTargetId(event.over?.data.current) ?? null);
  };
  const handleDragEnd = (event: DragEndEvent) => {
    if (interactionLocked) {
      clearDragState();
      return;
    }
    const itemId = runtimeMatchingItemId(event.active.data.current);
    const targetId = runtimeMatchingTargetId(event.over?.data.current);
    if (itemId && targetId) {
      commitMatch(itemId, targetId);
      return;
    }
    clearDragState();
  };

  return (
    <NodeViewWrapper
      data-assessment-bounded-scroll-frame=""
      data-slot="matching-pairs-group"
      className="sc-matching-pairs-group"
    >
      <div data-assessment-bounded-scroll="" className="sc-matching-pairs-scroll">
        <fieldset className="sc-matching-runtime-fieldset">
          {runtimeProblem?.state.legend && (
            <legend className="sc-matching-runtime-legend">{runtimeProblem.state.legend}</legend>
          )}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragCancel={clearDragState}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart}
          >
            <div ref={matchingCanvasRef} className="sc-matching-runtime-canvas">
              {connectors.length > 0 && (
                <svg aria-hidden data-matching-connectors="" className="sc-matching-connectors">
                  {connectors.map((connector) => {
                    const color =
                      connector.state === "correct"
                        ? "var(--color-accent)"
                        : connector.state === "incorrect"
                          ? "var(--color-secondary)"
                          : "var(--color-primary)";
                    return (
                      <g
                        key={`${connector.itemId}:${connector.targetId}`}
                        data-matching-connector-state={connector.state}
                      >
                        <path
                          d={getMatchingConnectorPath(connector)}
                          fill="none"
                          stroke={color}
                          strokeLinecap="round"
                          strokeWidth={3}
                          opacity={connector.state === "default" ? 0.72 : 0.85}
                        />
                        <circle
                          cx={connector.startX}
                          cy={connector.startY}
                          r={5}
                          fill={color}
                          opacity={connector.state === "default" ? 0.72 : 0.85}
                        />
                        <circle
                          cx={connector.endX}
                          cy={connector.endY}
                          r={5}
                          fill={color}
                          opacity={connector.state === "default" ? 0.72 : 0.85}
                        />
                      </g>
                    );
                  })}
                </svg>
              )}
              <div className="sc-matching-runtime-column sc-matching-runtime-column--items">
                <div className="sc-matching-runtime-heading">Items</div>
                <div className="sc-matching-runtime-list">
                  {pairs.map((pair, idx) => {
                    const selected = selectedItemId === pair.itemId;
                    const matched = displayMatches[pair.itemId] !== undefined;
                    const itemDescription = describeMatchingItemAccessibilityState({
                      interactionLocked,
                      matched,
                      selected,
                    });
                    const itemDescriptionId =
                      problemId !== null
                        ? `${problemId}:${pair.itemId}:matching-item-description`
                        : undefined;
                    return (
                      <MatchingRuntimeItem
                        key={pair.itemId}
                        description={itemDescription}
                        descriptionId={itemDescriptionId}
                        draggingItemId={draggingItemId}
                        index={idx}
                        interactionLocked={interactionLocked}
                        matched={matched}
                        pair={pair}
                        selected={selected}
                        onSelect={() => {
                          if (interactionLocked || matched) return;
                          setSelectedItemId(selected ? null : pair.itemId);
                        }}
                        onEscape={() => setSelectedItemId(null)}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="sc-matching-runtime-column sc-matching-runtime-column--targets">
                <div className="sc-matching-runtime-heading">Matches</div>
                <div className="sc-matching-runtime-list">
                  {orderedTargets.map((target, idx) => {
                    const matched = matchedItemId(displayMatches, target.targetId);
                    const matchedPair = matched ? (pairByItemId.get(matched) ?? null) : null;
                    const feedbackItem = matchedPair
                      ? (feedbackItems[matchedPair.itemId] ?? null)
                      : null;
                    const correct =
                      answerKeyVisible && matchedPair
                        ? true
                        : showFeedback && feedbackItem
                          ? feedbackItem.correct
                          : null;
                    const feedback =
                      answerKeyVisible &&
                      reveal?.feedbackByItemId[matchedPair?.itemId ?? ""] !== undefined
                        ? reveal.feedbackByItemId[matchedPair?.itemId ?? ""]
                        : feedbackItem?.feedback;
                    const matchedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);
                    const activeDrop =
                      hoverTargetId === target.targetId ||
                      (selectedItemId !== null && !interactionLocked);
                    const matchedItemIndex = matchedPair
                      ? pairs.findIndex((pair) => pair.itemId === matchedPair.itemId) + 1
                      : null;
                    const targetDescription = describeMatchingTargetAccessibilityState({
                      activeDrop,
                      correct,
                      hasFeedback: showFeedback && matchedFeedback.success,
                      matchedItemIndex:
                        matchedItemIndex !== null && matchedItemIndex > 0 ? matchedItemIndex : null,
                      revealed: answerKeyVisible,
                      submitted,
                    });
                    const targetDescriptionId =
                      problemId !== null
                        ? `${problemId}:${target.targetId}:matching-target-description`
                        : undefined;

                    return (
                      <MatchingRuntimeTarget
                        key={target.targetId}
                        activeDrop={activeDrop}
                        correct={correct}
                        descriptionId={targetDescriptionId}
                        hasMatchedPair={matchedPair !== null}
                        index={idx}
                        interactionLocked={interactionLocked}
                        selectedItemId={selectedItemId}
                        showFeedback={showFeedback}
                        targetId={target.targetId}
                        onCommitSelected={() => {
                          if (selectedItemId) commitMatch(selectedItemId, target.targetId);
                        }}
                      >
                        <div className="sc-matching-runtime-target__body">
                          {renderStaticHtml(target.targetHtml, `Target ${idx + 1}`)}
                        </div>
                        {matchedPair ? (
                          <div className="sc-matching-runtime-match">
                            <div className="sc-matching-runtime-match__content">
                              {renderStaticHtml(matchedPair.itemHtml, "Matched item")}
                            </div>
                            {!interactionLocked && (
                              <button
                                type="button"
                                aria-label={`Remove match from target ${idx + 1}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  problem?.removeTargetMatch(target.targetId);
                                }}
                                className={cn(
                                  CHOICE_TRAILING_BTN,
                                  "sc-choice-trailing-button--danger",
                                )}
                              >
                                <X size={iconSm} />
                              </button>
                            )}
                            {showFeedback && correct === true && (
                              <CheckCircle
                                size={iconMd}
                                weight="fill"
                                className="sc-matching-runtime-status-icon sc-matching-runtime-status-icon--correct"
                                aria-hidden
                              />
                            )}
                            {showFeedback && correct === false && (
                              <XCircle
                                size={iconMd}
                                weight="fill"
                                className="sc-matching-runtime-status-icon sc-matching-runtime-status-icon--incorrect"
                                aria-hidden
                              />
                            )}
                            {matchedFeedback.success && showFeedback && (
                              <RichFeedbackRuntimePopover feedback={matchedFeedback.data} />
                            )}
                          </div>
                        ) : (
                          <span className="sc-matching-empty">
                            {selectedItemId ? "Click to place selected item" : "Choose an item"}
                          </span>
                        )}
                        {targetDescriptionId && (
                          <span id={targetDescriptionId} className="sc-sr-only">
                            {targetDescription}
                          </span>
                        )}
                      </MatchingRuntimeTarget>
                    );
                  })}
                </div>
              </div>
            </div>
            <RuntimeDragOverlay>
              {draggingPair ? (
                <RuntimeDragPreview className="sc-matching-runtime-preview">
                  <span aria-hidden className="sc-matching-runtime-preview__handle">
                    <DotsSixVertical size={iconXs} weight="bold" />
                  </span>
                  <div className="sc-matching-runtime-preview__content">
                    {renderStaticHtml(draggingPair.itemHtml, "Item")}
                  </div>
                </RuntimeDragPreview>
              ) : null}
            </RuntimeDragOverlay>
          </DndContext>
        </fieldset>
      </div>
      <div data-assessment-bounded-scroll-hint="" aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}

function MatchingRuntimeItem({
  description,
  descriptionId,
  draggingItemId,
  index,
  interactionLocked,
  matched,
  onEscape,
  onSelect,
  pair,
  selected,
}: {
  description: string;
  descriptionId: string | undefined;
  draggingItemId: string | null;
  index: number;
  interactionLocked: boolean;
  matched: boolean;
  onEscape: () => void;
  onSelect: () => void;
  pair: MatchingProjectionPair;
  selected: boolean;
}) {
  const disabled = interactionLocked || matched;
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    id: `matching-runtime-item:${pair.itemId}`,
    disabled,
    data: {
      matchingRuntimeItem: true,
      itemId: pair.itemId,
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
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-pressed={selected}
      aria-label={`Select matching item ${index + 1}`}
      aria-describedby={descriptionId}
      data-matching-draggable-item=""
      data-item-id={pair.itemId}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
        if (e.key === "Escape") onEscape();
      }}
      style={style}
      className={cn(
        "sc-matching-runtime-item",
        selected && "sc-matching-runtime-item--selected",
        !disabled && !selected && "sc-matching-runtime-item--interactive",
        matched && !selected && "sc-matching-runtime-item--dimmed",
        draggingItemId === pair.itemId && "sc-matching-runtime-item--dimmed",
        isDragging && RUNTIME_DRAG_SOURCE_PLACEHOLDER_CLASS,
        disabled && "sc-matching-runtime-item--disabled",
      )}
    >
      <span aria-hidden className={RUNTIME_DRAG_HANDLE_CLASS}>
        <DotsSixVertical size={iconXs} weight="bold" />
      </span>
      <div className="sc-matching-runtime-item__content">
        {renderStaticHtml(pair.itemHtml, `Item ${index + 1}`)}
      </div>
      {descriptionId && (
        <span id={descriptionId} className="sc-sr-only">
          {description}
        </span>
      )}
    </div>
  );
}

function MatchingRuntimeTarget({
  activeDrop,
  children,
  correct,
  descriptionId,
  hasMatchedPair,
  index,
  interactionLocked,
  onCommitSelected,
  selectedItemId,
  showFeedback,
  targetId,
}: {
  activeDrop: boolean;
  children: ReactNode;
  correct: boolean | null;
  descriptionId: string | undefined;
  hasMatchedPair: boolean;
  index: number;
  interactionLocked: boolean;
  onCommitSelected: () => void;
  selectedItemId: string | null;
  showFeedback: boolean;
  targetId: string;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `matching-runtime-target:${targetId}`,
    disabled: interactionLocked,
    data: {
      matchingRuntimeTarget: true,
      targetId,
    },
  });
  const isActiveDrop = isOver || activeDrop;

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={interactionLocked ? -1 : 0}
      aria-label={`Match target ${index + 1}`}
      aria-describedby={descriptionId}
      data-matching-drop-target=""
      data-target-id={targetId}
      onClick={onCommitSelected}
      onKeyDown={(e) => {
        if (interactionLocked) return;
        if ((e.key === "Enter" || e.key === " ") && selectedItemId) {
          e.preventDefault();
          onCommitSelected();
        }
      }}
      className={cn(
        "sc-matching-runtime-target",
        !interactionLocked &&
          !hasMatchedPair &&
          !showFeedback &&
          "sc-matching-runtime-target--interactive",
        isActiveDrop && "sc-matching-runtime-target--active",
        hasMatchedPair && !showFeedback && "sc-matching-runtime-target--matched",
        showFeedback && correct === true && "sc-matching-runtime-target--correct",
        showFeedback && correct === false && "sc-matching-runtime-target--incorrect",
      )}
    >
      {children}
    </div>
  );
}

function runtimeMatchingItemId(data: Record<string, unknown> | undefined) {
  if (data?.["matchingRuntimeItem"] !== true) return null;
  const itemId = data["itemId"];
  return typeof itemId === "string" && itemId.length > 0 ? itemId : null;
}

function runtimeMatchingTargetId(data: Record<string, unknown> | undefined) {
  if (data?.["matchingRuntimeTarget"] !== true) return null;
  const targetId = data["targetId"];
  return typeof targetId === "string" && targetId.length > 0 ? targetId : null;
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

function projectionsFromGroup(node: PMNode, serializer: DOMSerializer): MatchingProjectionPair[] {
  const pairs: MatchingProjectionPair[] = [];
  node.forEach((pair) => {
    if (pair.type.name !== "matching_pair") return;
    const itemId = String(pair.attrs["itemId"] ?? "");
    const targetId = String(pair.attrs["targetId"] ?? "");
    if (!itemId || !targetId) return;

    const item = childByType(pair, "matching_item");
    const target = childByType(pair, "matching_target");
    pairs.push({
      itemId,
      targetId,
      itemHtml: fieldHtml(serializer, item),
      targetHtml: fieldHtml(serializer, target),
    });
  });
  return pairs;
}

function renderStaticHtml(html: string, fallback: string) {
  if (!html) return fallback;
  return <div className="sc-matching-static-html" dangerouslySetInnerHTML={{ __html: html }} />;
}

function elementByDataAttr(
  container: HTMLElement,
  attr: string,
  value: string,
): HTMLElement | null {
  const elements = Array.from(container.querySelectorAll<HTMLElement>(`[${attr}]`));
  return elements.find((element) => element.getAttribute(attr) === value) ?? null;
}

function sameConnectors(a: readonly MatchingConnector[], b: readonly MatchingConnector[]): boolean {
  return (
    a.length === b.length &&
    a.every((connector, index) => {
      const other = b[index];
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
