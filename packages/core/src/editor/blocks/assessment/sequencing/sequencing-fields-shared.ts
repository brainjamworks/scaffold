import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import { SequenceAssessmentSchema } from "@scaffold/contracts";
import type { AssessmentFeedbackContent } from "@scaffold/contracts";

export interface RevealedSequenceAssessment {
  correctOrder: string[];
  feedbackByItemId: Record<string, AssessmentFeedbackContent>;
}

export type ReorderPlacement = "before" | "after";

interface SequencingItemAccessibilityState {
  canReorder: boolean;
  correct: boolean | null;
  hasFeedback: boolean;
  position: number;
  revealed: boolean;
  submitted: boolean;
  total: number;
}

const SEQUENCING_ITEM_CONTENT = textContentExpression();

export interface SequencingItemNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export interface SequencingItemsGroupNodeOptions {
  addNodeView?: () => NodeViewRenderer;
}

export function itemContent() {
  return [{ type: "paragraph" }];
}

export function describeSequencingItemAccessibilityState({
  canReorder,
  correct,
  hasFeedback,
  position,
  revealed,
  submitted,
  total,
}: SequencingItemAccessibilityState): string {
  const parts = [`Position ${position} of ${total}`];

  if (revealed) {
    parts.push("Revealed correct position");
  } else if (submitted && correct === true) {
    parts.push("Submitted position, correct");
  } else if (submitted && correct === false) {
    parts.push("Submitted position, incorrect");
  } else {
    parts.push(canReorder ? "Reorderable" : "Reordering locked");
  }

  if (hasFeedback && (revealed || correct !== null)) {
    parts.push("Feedback available");
  }

  return parts.join(". ");
}

export function deterministicShuffle<T>(input: readonly T[], seed: string): T[] {
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
  return arr;
}

export function getSequencingDisplayOrder({
  isEditable,
  answerKeyVisible,
  docOrderIds,
  answerOrderIds,
  responseOrder,
}: {
  isEditable: boolean;
  answerKeyVisible: boolean;
  docOrderIds: readonly string[];
  answerOrderIds?: readonly string[];
  responseOrder: readonly string[];
}): readonly string[] {
  if (isEditable) return docOrderIds;
  if (answerKeyVisible) {
    return answerOrderIds && hasSameIds(answerOrderIds, docOrderIds) ? answerOrderIds : docOrderIds;
  }
  return hasSameIds(responseOrder, docOrderIds) ? responseOrder : docOrderIds;
}

export function getSequencingReorderedOrder({
  order,
  sourceId,
  targetId,
  placement,
}: {
  order: readonly string[];
  sourceId: string;
  targetId: string;
  placement: ReorderPlacement;
}): string[] {
  if (!sourceId || !targetId || sourceId === targetId) return Array.from(order);
  if (!order.includes(sourceId) || !order.includes(targetId)) {
    return Array.from(order);
  }

  const withoutSource = order.filter((id) => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  if (targetIndex < 0) return Array.from(order);
  const insertAt = placement === "after" ? targetIndex + 1 : targetIndex;
  return [...withoutSource.slice(0, insertAt), sourceId, ...withoutSource.slice(insertAt)];
}

export function revealedSequenceOrder(answers: unknown): string[] {
  return revealedSequenceAssessment(answers).correctOrder;
}

export function revealedSequenceAssessment(answers: unknown): RevealedSequenceAssessment {
  const parsed = SequenceAssessmentSchema.safeParse(answers);
  return parsed.success
    ? {
        correctOrder: parsed.data.correctOrder,
        feedbackByItemId: parsed.data.feedbackByItemId,
      }
    : { correctOrder: [], feedbackByItemId: {} };
}

export function createSequencingItemNode(options: SequencingItemNodeOptions = {}) {
  return Node.create({
    name: "sequencing_item",
    ...fieldContainerSpec({ content: SEQUENCING_ITEM_CONTENT }),

    addAttributes() {
      return {
        id: {
          default: "",
          parseHTML: (el: HTMLElement) => el.getAttribute("data-item-id") ?? "",
          renderHTML: (attrs: { id: string }) => (attrs.id ? { "data-item-id": attrs.id } : {}),
        },
      };
    },

    parseHTML() {
      return [{ tag: 'div[data-node="sequencing-item"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "sequencing-item" }), 0];
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

export function createSequencingItemsGroupNode(options: SequencingItemsGroupNodeOptions = {}) {
  return Node.create({
    name: "sequencing_items_group",
    content: "sequencing_item+",
    defining: true,
    isolating: true,
    selectable: false,

    parseHTML() {
      return [{ tag: 'div[data-slot="sequencing-items-group"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-assessment-bounded-scroll-frame": "",
          "data-slot": "sequencing-items-group",
        }),
        ["div", { "data-assessment-bounded-scroll": "", class: "sc-sequencing-items-scroll" }, 0],
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

function hasSameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((id) => bSet.has(id));
}
