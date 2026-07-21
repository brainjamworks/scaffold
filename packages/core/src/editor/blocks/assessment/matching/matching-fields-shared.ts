import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import { MatchAssessmentSchema } from "@scaffold/contracts";
import type { AssessmentFeedbackContent } from "@scaffold/contracts";

export interface MatchingProjectionPair {
  itemId: string;
  targetId: string;
  itemHtml: string;
  targetHtml: string;
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
  matchedItemIndex: number | null;
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
    { type: "matching_item", content: matchingFieldContent() },
    { type: "matching_target", content: matchingFieldContent() },
  ];
}

export function deterministicShuffle<T extends { targetId: string }>(
  input: readonly T[],
  seed: string,
): T[] {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 0x100000000;
  };
  const arr = input.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }

  if (arr.length > 1 && arr.every((item, idx) => item.targetId === input[idx]?.targetId)) {
    const first = arr.shift();
    if (first) arr.push(first);
  }

  return arr;
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
  matchedItemIndex,
  revealed,
  submitted,
}: MatchingTargetAccessibilityState): string {
  const parts: string[] = [];

  if (matchedItemIndex !== null) {
    parts.push(`Matched with item ${matchedItemIndex}`);
  } else if (activeDrop) {
    parts.push("Ready to match selected item");
  } else {
    parts.push("No item matched");
  }

  if (revealed && matchedItemIndex !== null) {
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

    addAttributes() {
      return {
        itemId: {
          default: "",
          parseHTML: (el: HTMLElement) => el.getAttribute("data-item-id") ?? "",
          renderHTML: (attrs: { itemId: string }) =>
            attrs.itemId ? { "data-item-id": attrs.itemId } : {},
        },
        targetId: {
          default: "",
          parseHTML: (el: HTMLElement) => el.getAttribute("data-target-id") ?? "",
          renderHTML: (attrs: { targetId: string }) =>
            attrs.targetId ? { "data-target-id": attrs.targetId } : {},
        },
      };
    },

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
          "data-assessment-bounded-scroll-frame": "",
          "data-slot": "matching-pairs-group",
        }),
        ["div", { "data-assessment-bounded-scroll": "", class: "sc-matching-pairs-scroll" }, 0],
        [
          "div",
          { "data-assessment-bounded-scroll-hint": "", "aria-hidden": "true" },
          "Scroll for more ↓",
        ],
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
