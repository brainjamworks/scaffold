import {
  CheckCircleIcon as CheckCircle,
  DotsSixVerticalIcon as DotsSixVertical,
  XIcon as X,
  XCircleIcon as XCircle,
} from "@phosphor-icons/react";
import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { AssessmentItemDetail } from "@scaffold/contracts";
import { AssessmentFeedbackContentSchema } from "@scaffold/contracts";

import { RichFeedbackRuntimePopover } from "@/editor/blocks/assessment/shared/chrome/RichFeedbackRuntimePopover";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { observeInteractionGeometry } from "@/editor/interactions/drag/dom/observe-interaction-geometry";
import { InteractionDragActivationArea } from "@/editor/interactions/drag/react/InteractionDragActivationArea";
import { InteractionDragSession } from "@/editor/interactions/drag/react/InteractionDragSession";
import { useInteractionDragEnvironmentResolution } from "@/editor/interactions/drag/react/interaction-drag-environment";
import { useInteractionDragSource } from "@/editor/interactions/drag/react/use-interaction-drag-source";
import { useInteractionDropTarget } from "@/editor/interactions/drag/react/use-interaction-drop-target";
import { iconMd, iconSm, iconXs } from "@/ui/tokens/icon-sizes";

import {
  EMPTY_MATCHES,
  describeMatchingItemAccessibilityState,
  describeMatchingTargetAccessibilityState,
  deterministicShuffle,
  getMatchingConnectorPath,
  matchedItemId,
  matchingRevealFromAnswers,
  type MatchingConnector,
} from "./matching-fields-shared";
import {
  createMatchingConnectorRevision,
  measureMatchingConnectorGeometry,
  sameMatchingConnectors,
  type MatchingConnectorConnection,
} from "./matching-connector-geometry";
import type { MatchingCourseContent } from "./matching-course-content";

const EMPTY_FEEDBACK_ITEMS: Record<string, AssessmentItemDetail> = {};

type MatchingPresentation = "inline" | "full-slide";

interface MatchingDragData {
  readonly itemHtml: string;
  readonly itemId: string;
}

interface MatchingDropData {
  readonly targetId: string;
}

interface MatchingCourseInteractionProps {
  readonly assessmentTargetId: string | null | undefined;
  readonly content: MatchingCourseContent;
  readonly presentation: MatchingPresentation;
}

export function MatchingCourseInteraction({
  assessmentTargetId,
  content,
  presentation,
}: MatchingCourseInteractionProps) {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [connectors, setConnectors] = useState<MatchingConnector[]>([]);
  const matchingCanvasRef = useRef<HTMLDivElement | null>(null);
  const connectorSvgRef = useRef<SVGSVGElement | null>(null);
  const dragEnvironment = useInteractionDragEnvironmentResolution();
  const connectorCoordinateSpace =
    dragEnvironment.status === "ready" ? dragEnvironment.environment.coordinateSpace : null;
  const assessment = useAssessmentRuntimeById(assessmentTargetId, "match");
  const problem = assessment?.interaction ?? null;
  const runtimeProblem = assessment?.problem ?? null;
  const pairs = content.pairs;
  const orderedTargets = useMemo(
    () =>
      deterministicShuffle(
        pairs.map((pair) => ({
          targetId: pair.targetId,
          targetHtml: pair.targetHtml,
          targetLabel: pair.targetLabel,
        })),
        `${assessmentTargetId ?? "matching"}|${pairs.map((pair) => pair.targetId).join("|")}`,
      ),
    [assessmentTargetId, pairs],
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
  const inline = presentation === "inline";

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

  const runtimeItems = pairs.map((pair, idx) => {
    const selected = selectedItemId === pair.itemId;
    const matched = displayMatches[pair.itemId] !== undefined;
    return (
      <MatchingRuntimeItem
        key={pair.itemId}
        count={pairs.length}
        description={describeMatchingItemAccessibilityState({
          interactionLocked,
          matched,
          selected,
        })}
        index={idx}
        interactionLocked={interactionLocked}
        matched={matched}
        pair={pair}
        selected={selected}
        onEscape={() => setSelectedItemId(null)}
        onSelect={() => {
          if (interactionLocked || matched) return;
          setSelectedItemId(selected ? null : pair.itemId);
        }}
      />
    );
  });
  const runtimeTargets = orderedTargets.map((target, idx) => {
    const matched = matchedItemId(displayMatches, target.targetId);
    const matchedPair = matched ? (pairByItemId.get(matched) ?? null) : null;
    const feedbackItem = matchedPair ? (feedbackItems[matchedPair.itemId] ?? null) : null;
    const correct =
      answerKeyVisible && matchedPair
        ? true
        : showFeedback && feedbackItem
          ? feedbackItem.correct
          : null;
    const feedback =
      answerKeyVisible && reveal?.feedbackByItemId[matchedPair?.itemId ?? ""] !== undefined
        ? reveal.feedbackByItemId[matchedPair?.itemId ?? ""]
        : feedbackItem?.feedback;
    const matchedFeedback = AssessmentFeedbackContentSchema.safeParse(feedback);
    const activeDrop =
      hoverTargetId === target.targetId || (selectedItemId !== null && !interactionLocked);
    return (
      <MatchingRuntimeTarget
        key={target.targetId}
        activeDrop={activeDrop}
        correct={correct}
        count={orderedTargets.length}
        description={describeMatchingTargetAccessibilityState({
          activeDrop,
          correct,
          hasFeedback: showFeedback && matchedFeedback.success,
          matchedItemLabel: matchedPair?.itemLabel ?? null,
          revealed: answerKeyVisible,
          submitted,
        })}
        index={idx}
        interactionLocked={interactionLocked}
        selectedItemId={selectedItemId}
        showFeedback={showFeedback}
        targetId={target.targetId}
        targetLabel={target.targetLabel}
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
                aria-label={`Remove match from ‘${target.targetLabel}’`}
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
  });

  return (
    <div
      {...(inline ? { "data-bounded-scroll-frame": "" } : {})}
      data-matching-presentation={presentation}
      data-slot="matching-pairs-group"
      className="sc-course-matching__group"
    >
      <div
        {...(inline ? { "data-bounded-scroll": "" } : {})}
        className="sc-course-matching__scroll"
      >
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
            sessionId={`matching-${assessmentTargetId ?? "runtime"}`}
          >
            <div ref={matchingCanvasRef} className="sc-course-matching__canvas">
              <svg
                ref={connectorSvgRef}
                aria-hidden
                data-matching-connectors=""
                className="sc-course-matching__connectors"
              >
                {connectors.map((connector) => (
                  <g
                    key={`${connector.itemId}:${connector.targetId}`}
                    data-matching-connector-item-id={connector.itemId}
                    data-matching-connector-state={connector.state}
                    data-matching-connector-target-id={connector.targetId}
                    data-course-state={connector.state === "default" ? undefined : connector.state}
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
                ))}
              </svg>
              {presentation === "full-slide" ? (
                <>
                  <div className="sc-course-matching__runtime-header sc-course-matching__runtime-header--items">
                    Items
                  </div>
                  <div className="sc-course-matching__runtime-header sc-course-matching__runtime-header--targets">
                    Matches
                  </div>
                  <div className="sc-course-matching__runtime-board">
                    {pairs.map((pair, index) => (
                      <div key={pair.itemId} className="sc-course-matching__runtime-row">
                        {runtimeItems[index]}
                        {runtimeTargets[index]}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="sc-course-matching__column sc-course-matching__column--items">
                    <div className="sc-course-matching__header">Items</div>
                    <div className="sc-course-matching__runtime-list">{runtimeItems}</div>
                  </div>
                  <div className="sc-course-matching__column sc-course-matching__column--targets">
                    <div className="sc-course-matching__header">Matches</div>
                    <div className="sc-course-matching__runtime-list">{runtimeTargets}</div>
                  </div>
                </>
              )}
            </div>
          </InteractionDragSession>
        </fieldset>
      </div>
      {inline && (
        <div data-bounded-scroll-hint="" aria-hidden="true">
          Scroll for more ↓
        </div>
      )}
    </div>
  );
}

function MatchingRuntimeItem({
  count,
  description,
  index,
  interactionLocked,
  matched,
  onEscape,
  onSelect,
  pair,
  selected,
}: {
  count: number;
  description: string;
  index: number;
  interactionLocked: boolean;
  matched: boolean;
  onEscape: () => void;
  onSelect: () => void;
  pair: MatchingCourseContent["pairs"][number];
  selected: boolean;
}) {
  const descriptionId = useId();
  const disabled = interactionLocked || matched;
  const drag = useInteractionDragSource<MatchingDragData>({
    data: { itemHtml: pair.itemHtml, itemId: pair.itemId },
    disabled,
    id: `matching-runtime-item:${pair.itemId}`,
    label: `Matching item ${index + 1} of ${count}: ${pair.itemLabel}`,
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
      aria-label={`Select ‘${pair.itemLabel}’ (item ${index + 1} of ${count})`}
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
  count,
  description,
  index,
  interactionLocked,
  onCommitSelected,
  selectedItemId,
  showFeedback,
  targetId,
  targetLabel,
}: {
  activeDrop: boolean;
  children: ReactNode;
  correct: boolean | null;
  count: number;
  description: string;
  index: number;
  interactionLocked: boolean;
  onCommitSelected: () => void;
  selectedItemId: string | null;
  showFeedback: boolean;
  targetId: string;
  targetLabel: string;
}) {
  const descriptionId = useId();
  const drop = useInteractionDropTarget<MatchingDropData>({
    data: { targetId },
    disabled: interactionLocked,
    id: `matching-runtime-target:${targetId}`,
  });
  const isActiveDrop = drop.isDropTarget || activeDrop;
  const placementUnavailable = interactionLocked || selectedItemId === null;

  return (
    <div
      ref={drop.targetRef}
      data-matching-drop-target=""
      data-target-id={targetId}
      data-active={isActiveDrop || undefined}
      data-course-state={
        showFeedback && correct !== null ? (correct ? "correct" : "incorrect") : undefined
      }
      className="sc-course-matching__target"
    >
      <button
        type="button"
        tabIndex={interactionLocked ? -1 : 0}
        aria-disabled={placementUnavailable || undefined}
        aria-label={`Match ‘${targetLabel}’ (target ${index + 1} of ${count})`}
        aria-describedby={descriptionId}
        onClick={() => {
          if (placementUnavailable) return;
          onCommitSelected();
        }}
        onKeyDown={(event) => {
          if (placementUnavailable) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onCommitSelected();
          }
        }}
        className="sc-course-matching__place-action"
      />
      {children}
      <span id={descriptionId} className="sc-sr-only">
        {description}
      </span>
    </div>
  );
}

function renderStaticHtml(html: string, fallback: string) {
  if (!html) return fallback;
  return (
    <div className="sc-course-matching__static-html" dangerouslySetInnerHTML={{ __html: html }} />
  );
}
