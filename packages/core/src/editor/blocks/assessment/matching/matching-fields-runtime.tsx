import {
  CheckCircleIcon as CheckCircle,
  DotsSixVerticalIcon as DotsSixVertical,
  XIcon as X,
  XCircleIcon as XCircle,
} from "@phosphor-icons/react";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { findAncestorAssessmentBlockId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import type { AssessmentItemDetail } from "@scaffold/contracts";
import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionDragEnvironmentResolution } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { useInteractionDragSource } from "@/editor/interactions/drag/react/use-interaction-drag-source";
import { useInteractionDropTarget } from "@/editor/interactions/drag/react/use-interaction-drop-target";
import { observeInteractionGeometry } from "@/editor/interactions/drag/dom/observe-interaction-geometry";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";
import { iconMd, iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import {
  EMPTY_MATCHES,
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
import {
  createMatchingConnectorRevision,
  measureMatchingConnectorGeometry,
  sameMatchingConnectors,
  type MatchingConnectorConnection,
} from "./matching-connector-geometry";
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

interface MatchingDragData {
  readonly itemHtml: string;
  readonly itemId: string;
}

interface MatchingDropData {
  readonly targetId: string;
}

export const MatchingPairsGroupRuntimeNode = createMatchingPairsGroupNode({
  addNodeView: () => ReactNodeViewRenderer(MatchingPairsGroupRuntimeNodeView),
});

function MatchingPairsGroupRuntimeNodeView(props: NodeViewProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<MatchingConnector[]>([]);
  const matchingCanvasRef = useRef<HTMLDivElement | null>(null);
  const connectorSvgRef = useRef<SVGSVGElement | null>(null);
  const dragEnvironment = useInteractionDragEnvironmentResolution();
  const connectorCoordinateSpace =
    dragEnvironment.status === "ready" ? dragEnvironment.environment.coordinateSpace : null;

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

  const orderedTargets = deterministicShuffle(
    pairs.map((pair) => ({
      targetId: pair.targetId,
      targetHtml: pair.targetHtml,
    })),
    `${authoredBlockId ?? "matching"}|${pairs.map((pair) => pair.targetId).join("|")}`,
  );
  const pairByItemId = useMemo(() => new Map(pairs.map((pair) => [pair.itemId, pair])), [pairs]);
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
  const connectorRevision = createMatchingConnectorRevision(displayMatches, feedbackItems);

  useLayoutEffect(() => {
    if (
      selectedItemId !== null &&
      (!pairByItemId.has(selectedItemId) || displayMatches[selectedItemId] !== undefined)
    ) {
      setSelectedItemId(null);
    }
  }, [displayMatches, pairByItemId, selectedItemId]);

  useLayoutEffect(() => {
    const container = matchingCanvasRef.current;
    const svg = connectorSvgRef.current;
    if (!container || !svg) {
      setConnectors([]);
      return undefined;
    }
    const connections: MatchingConnectorConnection[] = Object.entries(displayMatches).map(
      ([itemId, targetId]) => {
        const feedbackItem = feedbackItems[itemId] ?? null;
        const state =
          answerKeyVisible || (showFeedback && feedbackItem?.correct === true)
            ? "correct"
            : showFeedback && feedbackItem?.correct === false
              ? "incorrect"
              : "default";
        return { itemId, targetId, state };
      },
    );
    const updateConnectors = () => {
      const next = measureMatchingConnectorGeometry({ connections, container, svg });
      setConnectors((current) => (sameMatchingConnectors(current, next) ? current : next));
    };
    return observeInteractionGeometry({
      coordinateSpace: connectorCoordinateSpace,
      getElements: () => [
        container,
        svg,
        ...container.querySelectorAll<HTMLElement>("[data-item-id], [data-target-id]"),
      ],
      onMeasure: updateConnectors,
      ownerDocument: container.ownerDocument,
    });
  }, [
    answerKeyVisible,
    connectorCoordinateSpace,
    connectorRevision,
    displayMatches,
    feedbackItems,
    showFeedback,
  ]);

  const commitMatch = (itemId: string, targetId: string) => {
    const itemAvailable = pairByItemId.has(itemId) && displayMatches[itemId] === undefined;
    const targetAvailable = orderedTargets.some((target) => target.targetId === targetId);
    if (interactionLocked || !itemAvailable || !targetAvailable) return false;
    problem?.setMatch(itemId, targetId);
    setSelectedItemId(null);
    setHoverTargetId(null);
    return true;
  };
  const clearDragState = () => {
    setHoverTargetId(null);
  };
  const handleDragStart = () => {
    setSelectedItemId(null);
  };
  const handleDragMove = (event: { over: { data: MatchingDropData } | null }) => {
    setHoverTargetId(interactionLocked ? null : (event.over?.data.targetId ?? null));
  };
  const handleDragEnd = (event: {
    active: { data: MatchingDragData };
    over: { data: MatchingDropData } | null;
  }) => {
    if (interactionLocked) {
      clearDragState();
      return;
    }
    const itemId = event.active.data.itemId;
    const targetId = event.over?.data.targetId ?? null;
    if (targetId && commitMatch(itemId, targetId)) return;
    clearDragState();
  };

  return (
    <NodeViewWrapper
      data-bounded-scroll-frame=""
      data-slot="matching-pairs-group"
      className="sc-course-matching__group"
    >
      <div data-bounded-scroll="" className="sc-course-matching__scroll">
        <fieldset className="sc-matching-runtime-fieldset">
          {runtimeProblem?.state.legend && (
            <legend className="sc-matching-runtime-legend">{runtimeProblem.state.legend}</legend>
          )}
          <InteractionDragSession<MatchingDragData, MatchingDropData>
            accessibilityMode="selection-alternative"
            collisionPolicy="pointer"
            labels={{ draggable: "Matching item" }}
            onCancel={clearDragState}
            onEnd={handleDragEnd}
            onMove={handleDragMove}
            onStart={handleDragStart}
            profile="pointer"
            renderPreview={(active) => (
              <div className="sc-course-matching__drag-preview">
                <div className="sc-course-matching__item-content">
                  {renderStaticHtml(active.itemHtml, "Item")}
                </div>
              </div>
            )}
            sessionId={`matching-${authoredBlockId ?? "runtime"}`}
          >
            <div ref={matchingCanvasRef} className="sc-course-matching__canvas">
              <svg
                ref={connectorSvgRef}
                aria-hidden
                data-matching-connectors=""
                className="sc-course-matching__connectors"
              >
                {connectors.map((connector) => {
                  return (
                    <g
                      key={`${connector.itemId}:${connector.targetId}`}
                      data-matching-connector-item-id={connector.itemId}
                      data-matching-connector-state={connector.state}
                      data-matching-connector-target-id={connector.targetId}
                      data-course-state={
                        connector.state === "default" ? undefined : connector.state
                      }
                      className="sc-course-matching__connector"
                    >
                      <path
                        d={getMatchingConnectorPath(connector)}
                        className="sc-course-matching__connector-path"
                      />
                      <circle
                        data-matching-connector-endpoint="start"
                        cx={connector.startX}
                        cy={connector.startY}
                        r={5}
                        className="sc-course-matching__connector-endpoint"
                      />
                      <circle
                        data-matching-connector-endpoint="end"
                        cx={connector.endX}
                        cy={connector.endY}
                        r={5}
                        className="sc-course-matching__connector-endpoint"
                      />
                    </g>
                  );
                })}
              </svg>
              <div className="sc-course-matching__column sc-course-matching__column--items">
                <div className="sc-course-matching__header">Items</div>
                <div className="sc-course-matching__runtime-list">
                  {pairs.map((pair, idx) => {
                    const selected = selectedItemId === pair.itemId;
                    const matched = displayMatches[pair.itemId] !== undefined;
                    const itemDescription = describeMatchingItemAccessibilityState({
                      interactionLocked,
                      matched,
                      selected,
                    });
                    return (
                      <MatchingRuntimeItem
                        key={pair.itemId}
                        description={itemDescription}
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

              <div className="sc-course-matching__column sc-course-matching__column--targets">
                <div className="sc-course-matching__header">Matches</div>
                <div className="sc-course-matching__runtime-list">
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
                    const targetDescription = describeMatchingTargetAccessibilityState({
                      activeDrop,
                      correct,
                      hasFeedback: showFeedback && matchedFeedback.success,
                      matchedItemLabel: matchedPair?.itemLabel ?? null,
                      revealed: answerKeyVisible,
                      submitted,
                    });
                    return (
                      <MatchingRuntimeTarget
                        key={target.targetId}
                        activeDrop={activeDrop}
                        correct={correct}
                        description={targetDescription}
                        index={idx}
                        interactionLocked={interactionLocked}
                        selectedItemId={selectedItemId}
                        showFeedback={showFeedback}
                        targetId={target.targetId}
                        onCommitSelected={() => {
                          if (selectedItemId) commitMatch(selectedItemId, target.targetId);
                        }}
                      >
                        <div className="sc-course-matching__target-content">
                          {renderStaticHtml(target.targetHtml, `Target ${idx + 1}`)}
                        </div>
                        {matchedPair ? (
                          <div className="sc-course-matching__matched-item">
                            <div className="sc-course-matching__matched-content">
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
                                className="sc-course-matching__remove-action"
                              >
                                <X size={iconSm} />
                              </button>
                            )}
                            {showFeedback && correct === true && (
                              <CheckCircle
                                size={iconMd}
                                weight="fill"
                                className="sc-course-matching__state-cue"
                                data-course-state="correct"
                                aria-hidden
                              />
                            )}
                            {showFeedback && correct === false && (
                              <XCircle
                                size={iconMd}
                                weight="fill"
                                className="sc-course-matching__state-cue"
                                data-course-state="incorrect"
                                aria-hidden
                              />
                            )}
                            {matchedFeedback.success && showFeedback && (
                              <RichFeedbackRuntimePopover feedback={matchedFeedback.data} />
                            )}
                          </div>
                        ) : (
                          <span className="sc-course-matching__empty-target">
                            {selectedItemId ? "Click to place selected item" : "Choose an item"}
                          </span>
                        )}
                      </MatchingRuntimeTarget>
                    );
                  })}
                </div>
              </div>
            </div>
          </InteractionDragSession>
        </fieldset>
      </div>
      <div data-bounded-scroll-hint="" aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}

function MatchingRuntimeItem({
  description,
  index,
  interactionLocked,
  matched,
  onEscape,
  onSelect,
  pair,
  selected,
}: {
  description: string;
  index: number;
  interactionLocked: boolean;
  matched: boolean;
  onEscape: () => void;
  onSelect: () => void;
  pair: MatchingProjectionPair;
  selected: boolean;
}) {
  const descriptionId = useId();
  const disabled = interactionLocked || matched;
  const drag = useInteractionDragSource<MatchingDragData>({
    data: { itemHtml: pair.itemHtml, itemId: pair.itemId },
    disabled,
    id: `matching-runtime-item:${pair.itemId}`,
    label: `Matching item ${index + 1}`,
  });

  return (
    <InteractionDragActivationArea
      ref={drag.sourceRef}
      type="button"
      safeLocalHeight={55}
      safeLocalWidth={55}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-pressed={selected}
      aria-label={`Select matching item ${index + 1}`}
      aria-describedby={descriptionId}
      data-matching-draggable-item=""
      data-interaction-drag-placeholder={drag.isPlaceholder ? "" : undefined}
      data-item-id={pair.itemId}
      data-selected={selected || undefined}
      data-matched={matched || undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
        if (e.key === "Escape") onEscape();
      }}
      className="sc-course-matching__item"
    >
      <span aria-hidden data-runtime-matching-handle="" className="sc-course-matching__item-handle">
        <DotsSixVertical size={iconXs} weight="bold" />
      </span>
      <div className="sc-course-matching__item-content">
        {renderStaticHtml(pair.itemHtml, `Item ${index + 1}`)}
      </div>
      <span id={descriptionId} className="sc-sr-only">
        {description}
      </span>
    </InteractionDragActivationArea>
  );
}

function MatchingRuntimeTarget({
  activeDrop,
  children,
  correct,
  description,
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
  description: string;
  index: number;
  interactionLocked: boolean;
  onCommitSelected: () => void;
  selectedItemId: string | null;
  showFeedback: boolean;
  targetId: string;
}) {
  const descriptionId = useId();
  const drop = useInteractionDropTarget<MatchingDropData>({
    data: { targetId },
    disabled: interactionLocked,
    id: `matching-runtime-target:${targetId}`,
  });
  const isActiveDrop = drop.isDropTarget || activeDrop;

  return (
    <div
      ref={drop.targetRef}
      role="button"
      tabIndex={interactionLocked ? -1 : 0}
      aria-disabled={interactionLocked || undefined}
      aria-label={`Match target ${index + 1}`}
      aria-describedby={descriptionId}
      data-matching-drop-target=""
      data-target-id={targetId}
      data-active={isActiveDrop || undefined}
      data-course-state={
        showFeedback && correct !== null ? (correct ? "correct" : "incorrect") : undefined
      }
      onClick={onCommitSelected}
      onKeyDown={(e) => {
        if (interactionLocked) return;
        if ((e.key === "Enter" || e.key === " ") && selectedItemId) {
          e.preventDefault();
          onCommitSelected();
        }
      }}
      className="sc-course-matching__target"
    >
      {children}
      <span id={descriptionId} className="sc-sr-only">
        {description}
      </span>
    </div>
  );
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
    const item = childByType(pair, "matching_item");
    const target = childByType(pair, "matching_target");
    const itemId = String(item?.attrs["id"] ?? "");
    const targetId = String(target?.attrs["id"] ?? "");
    if (!itemId || !targetId) return;
    pairs.push({
      itemId,
      targetId,
      itemHtml: fieldHtml(serializer, item),
      targetHtml: fieldHtml(serializer, target),
      itemLabel: item?.textContent.replace(/\s+/g, " ").trim() || `Item ${pairs.length + 1}`,
      targetLabel: target?.textContent.replace(/\s+/g, " ").trim() || `Target ${pairs.length + 1}`,
    });
  });
  return pairs;
}

function renderStaticHtml(html: string, fallback: string) {
  if (!html) return fallback;
  return (
    <div className="sc-course-matching__static-html" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
