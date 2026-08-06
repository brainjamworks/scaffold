import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import { createEmbeddedNodeId } from "@/document/model/identity/stable-ids";
import { MatchAssessmentSchema } from "@scaffold/contracts";
import type { AssessmentFeedbackContent, AssessmentItemDetail } from "@scaffold/contracts";

export interface MatchingProjectionPair {
  itemId: string;
  targetId: string;
  itemHtml: string;
  targetHtml: string;
  itemLabel: string;
  targetLabel: string;
}

export interface MatchingReveal {
  matches: Record<string, string>;
  feedbackByItemId: Record<string, AssessmentFeedbackContent>;
}

interface MatchingItemAccessibilityState {
  interactionLocked: boolean;
  matched: boolean;
  selected: boolean;
}

interface MatchingTargetAccessibilityState {
  activeDrop: boolean;
  correct: boolean | null;
  hasFeedback: boolean;
  matchedItemLabel: string | null;
  revealed: boolean;
  submitted: boolean;
}

export interface MatchingConnector {
  itemId: string;
  targetId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  state: "default" | "correct" | "incorrect";
}

interface MatchingConnectorContainerRect {
  height: number;
  left: number;
  top: number;
  width: number;
}

interface MatchingConnectorItemRect {
  height: number;
  right: number;
  top: number;
}

interface MatchingConnectorTargetRect {
  height: number;
  left: number;
  top: number;
}

export interface MatchingFieldNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export interface MatchingPairsGroupNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

const MATCHING_TEXT_CONTENT = textContentExpression();

export const EMPTY_MATCHES: Readonly<Record<string, string>> = {};
export const MATCHING_CONNECTOR_PADDING = 5;

export function matchingFieldContent(text = "") {
  return [
    {
      type: "paragraph",
      ...(text ? { content: [{ type: "text", text }] } : {}),
    },
  ];
}

export function matchingPairContent() {
  return [
    {
      type: "matching_item",
      attrs: { id: createEmbeddedNodeId() },
      content: matchingFieldContent(),
    },
    {
      type: "matching_target",
      attrs: { id: createEmbeddedNodeId() },
      content: matchingFieldContent(),
    },
  ];
}

export function deterministicShuffle<T extends { targetId: string }>(
  input: readonly T[],
  seed: string,
): T[] {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }
  const random = () => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return hash / 0x100000000;
  };
  const shuffled = input.slice();
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  if (
    shuffled.length > 1 &&
    shuffled.every((item, index) => item.targetId === input[index]?.targetId)
  ) {
    const first = shuffled.shift();
    if (first) shuffled.push(first);
  }
  return shuffled;
}

export function describeMatchingItemAccessibilityState({
  interactionLocked,
  matched,
  selected,
}: MatchingItemAccessibilityState): string {
  if (selected) return "Selected item";
  if (matched) return "Matched item";
  return interactionLocked ? "Matching locked" : "Available item";
}

export function describeMatchingTargetAccessibilityState({
  activeDrop,
  correct,
  hasFeedback,
  matchedItemLabel,
  revealed,
  submitted,
}: MatchingTargetAccessibilityState): string {
  const parts: string[] = [];

  if (matchedItemLabel !== null) {
    parts.push(`Matched with ‘${matchedItemLabel}’`);
  } else if (activeDrop) {
    parts.push("Ready to match selected item");
  } else {
    parts.push("No item matched");
  }

  if (revealed && matchedItemLabel !== null) {
    parts.push("Revealed correct match");
  } else if (submitted && correct === true) {
    parts.push("Submitted match, correct");
  } else if (submitted && correct === false) {
    parts.push("Submitted match, incorrect");
  }

  if (hasFeedback && (revealed || correct !== null)) {
    parts.push("Feedback available");
  }

  return parts.join(". ");
}

export function matchingRevealFromAnswers(answers: unknown): MatchingReveal | null {
  const parsed = MatchAssessmentSchema.safeParse(answers);
  if (!parsed.success) return null;

  return {
    matches: Object.fromEntries(
      parsed.data.correctPairs.map((pair) => [pair.itemId, pair.targetId]),
    ),
    feedbackByItemId: parsed.data.feedbackByItemId,
  };
}

export function answerMatchesFromReveal(answers: unknown): Record<string, string> {
  return matchingRevealFromAnswers(answers)?.matches ?? {};
}

export function reconcileMatchingMatches(
  matches: Readonly<Record<string, string>>,
  itemIds: readonly string[],
  targetIds: readonly string[],
): Record<string, string> {
  assertCurrentMatchingIds(itemIds, targetIds);
  const targetIdSet = new Set(targetIds);
  const claimedTargets = new Set<string>();
  const reconciled: Record<string, string> = {};
  for (const itemId of itemIds) {
    const targetId = matches[itemId];
    if (!targetId || !targetIdSet.has(targetId) || claimedTargets.has(targetId)) continue;
    claimedTargets.add(targetId);
    reconciled[itemId] = targetId;
  }
  return reconciled;
}

export function resolveAuthorizedMatchingReveal({
  answerKeyVisible,
  answers,
  feedbackItems,
  itemIds,
  targetIds,
}: {
  answerKeyVisible: boolean;
  answers: unknown;
  feedbackItems: Readonly<Record<string, AssessmentItemDetail>> | null;
  itemIds: readonly string[];
  targetIds: readonly string[];
}): MatchingReveal | null {
  if (!answerKeyVisible) return null;
  assertCurrentMatchingIds(itemIds, targetIds);

  const reveal = matchingRevealFromAnswers(answers);
  if (reveal && isCompleteMatchingMapping(reveal.matches, itemIds, targetIds)) {
    return {
      matches: orderedMatchingRecord(reveal.matches, itemIds),
      feedbackByItemId: Object.fromEntries(
        itemIds.flatMap((itemId) => {
          const feedback = reveal.feedbackByItemId[itemId];
          return feedback ? [[itemId, feedback] as const] : [];
        }),
      ),
    };
  }

  if (!feedbackItems) return null;
  const reconstructed: Record<string, string> = {};
  for (const itemId of itemIds) {
    const expected = feedbackItems[itemId]?.expected;
    if (typeof expected !== "string") return null;
    reconstructed[itemId] = expected;
  }
  return isCompleteMatchingMapping(reconstructed, itemIds, targetIds)
    ? { matches: reconstructed, feedbackByItemId: {} }
    : null;
}

function assertCurrentMatchingIds(itemIds: readonly string[], targetIds: readonly string[]): void {
  if (itemIds.some((id) => !id.trim()) || new Set(itemIds).size !== itemIds.length) {
    throw new Error("Matching interaction item ids must be nonblank and unique.");
  }
  if (targetIds.some((id) => !id.trim()) || new Set(targetIds).size !== targetIds.length) {
    throw new Error("Matching interaction target ids must be nonblank and unique.");
  }
  if (itemIds.length === 0 || itemIds.length !== targetIds.length) {
    throw new Error("Matching interaction must contain equally many items and targets.");
  }
}

function isCompleteMatchingMapping(
  matches: Readonly<Record<string, string>>,
  itemIds: readonly string[],
  targetIds: readonly string[],
): boolean {
  const entries = Object.entries(matches);
  const itemIdSet = new Set(itemIds);
  const targetIdSet = new Set(targetIds);
  return (
    entries.length === itemIds.length &&
    new Set(entries.map(([, targetId]) => targetId)).size === entries.length &&
    entries.every(([itemId, targetId]) => itemIdSet.has(itemId) && targetIdSet.has(targetId))
  );
}

function orderedMatchingRecord(
  matches: Readonly<Record<string, string>>,
  itemIds: readonly string[],
): Record<string, string> {
  return Object.fromEntries(itemIds.map((itemId) => [itemId, matches[itemId]!]));
}

export function matchedItemId(
  matches: Readonly<Record<string, string>>,
  targetId: string,
): string | null {
  for (const [itemId, matchedTargetId] of Object.entries(matches)) {
    if (matchedTargetId === targetId) return itemId;
  }
  return null;
}

export function getMatchingConnectorPath({
  startX,
  startY,
  endX,
  endY,
}: Pick<MatchingConnector, "startX" | "startY" | "endX" | "endY">): string {
  const cp1X = startX + (endX - startX) * 0.3;
  const cp2X = startX + (endX - startX) * 0.7;
  return `M ${startX} ${startY} C ${cp1X} ${startY}, ${cp2X} ${endY}, ${endX} ${endY}`;
}

export function getMatchingConnectorCoordinates({
  canvasHeight,
  canvasWidth,
  containerRect,
  itemRect,
  targetRect,
}: {
  canvasHeight: number;
  canvasWidth: number;
  containerRect: MatchingConnectorContainerRect;
  itemRect: MatchingConnectorItemRect;
  targetRect: MatchingConnectorTargetRect;
}): Pick<MatchingConnector, "startX" | "startY" | "endX" | "endY"> {
  const scaleX = matchingConnectorScale(containerRect.width, canvasWidth);
  const scaleY = matchingConnectorScale(containerRect.height, canvasHeight);

  return {
    startX: (itemRect.right - containerRect.left) / scaleX + MATCHING_CONNECTOR_PADDING,
    startY: (itemRect.top - containerRect.top + itemRect.height / 2) / scaleY,
    endX: (targetRect.left - containerRect.left) / scaleX - MATCHING_CONNECTOR_PADDING,
    endY: (targetRect.top - containerRect.top + targetRect.height / 2) / scaleY,
  };
}

function matchingConnectorScale(renderedSize: number, canvasSize: number): number {
  if (!Number.isFinite(renderedSize) || !Number.isFinite(canvasSize)) return 1;
  if (renderedSize <= 0 || canvasSize <= 0) return 1;
  return renderedSize / canvasSize;
}

export function createMatchingItemNode(options: MatchingFieldNodeOptions = {}) {
  return Node.create({
    name: "matching_item",
    ...fieldContainerSpec({ content: MATCHING_TEXT_CONTENT }),

    parseHTML() {
      return [{ tag: 'div[data-slot="matching-item"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "matching-item" }), 0];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export function createMatchingTargetNode(options: MatchingFieldNodeOptions = {}) {
  return Node.create({
    name: "matching_target",
    ...fieldContainerSpec({ content: MATCHING_TEXT_CONTENT }),

    parseHTML() {
      return [{ tag: 'div[data-slot="matching-target"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "matching-target" }), 0];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export function createMatchingPairNode(options: MatchingFieldNodeOptions = {}) {
  return Node.create({
    name: "matching_pair",
    content: "matching_item matching_target",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    parseHTML() {
      return [{ tag: 'div[data-node="matching-pair"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "matching-pair" }), 0];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}

export function createMatchingPairsGroupNode(options: MatchingPairsGroupNodeOptions = {}) {
  return Node.create({
    name: "matching_pairs_group",
    content: "matching_pair+",
    defining: true,
    isolating: true,
    selectable: false,

    parseHTML() {
      return [{ tag: 'div[data-slot="matching-pairs-group"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-bounded-scroll-frame": "",
          "data-slot": "matching-pairs-group",
        }),
        ["div", { "data-bounded-scroll": "", class: "sc-course-matching__scroll" }, 0],
        ["div", { "data-bounded-scroll-hint": "", "aria-hidden": "true" }, "Scroll for more ↓"],
      ];
    },

    ...(options.addNodeView
      ? {
          addNodeView() {
            return options.addNodeView!();
          },
        }
      : {}),
  });
}
