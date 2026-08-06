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

export function sequencingItemPublicLabel(text: string): string {
  return text.replace(/\s+/g, " ").trim() || "item";
}

export function sequencingReorderLabel(text: string, position: number, total: number): string {
  return `Reorder ‘${sequencingItemPublicLabel(text)}’, position ${position} of ${total}`;
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

export function reconcileSequencingOrder(
  responseOrder: readonly string[],
  projectedOrder: readonly string[],
): string[] {
  if (
    projectedOrder.some((id) => id.trim().length === 0) ||
    new Set(projectedOrder).size !== projectedOrder.length
  ) {
    throw new Error("Projected sequence item ids must be nonblank and unique.");
  }
  if (new Set(responseOrder).size !== responseOrder.length) {
    throw new Error("Sequence response item ids must be unique.");
  }

  const projectedSet = new Set(projectedOrder);
  const surviving = responseOrder.filter((id) => projectedSet.has(id));
  const survivingSet = new Set(surviving);
  return [...surviving, ...projectedOrder.filter((id) => !survivingSet.has(id))];
}

export function resolveAuthorizedSequenceOrder({
  answerKeyVisible,
  currentItemIds,
  revealedOrderIds,
  resultItems,
}: {
  answerKeyVisible: boolean;
  currentItemIds: readonly string[];
  revealedOrderIds: readonly string[];
  resultItems: Readonly<Record<string, { expected?: unknown }>> | null | undefined;
}): string[] {
  if (!answerKeyVisible) return [];
  if (hasSameIds(revealedOrderIds, currentItemIds)) return Array.from(revealedOrderIds);
  if (!resultItems || currentItemIds.length === 0) return [];

  const positioned = currentItemIds.map((id) => ({
    id,
    expected: resultItems[id]?.expected,
  }));
  const expectedPositions = positioned.map(({ expected }) => expected);
  if (
    expectedPositions.some(
      (position) =>
        typeof position !== "number" ||
        !Number.isInteger(position) ||
        position < 0 ||
        position >= currentItemIds.length,
    ) ||
    new Set(expectedPositions).size !== currentItemIds.length
  ) {
    return [];
  }

  return positioned
    .slice()
    .sort((left, right) => Number(left.expected) - Number(right.expected))
    .map(({ id }) => id);
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
      return [{ tag: 'li[data-node="sequencing-item"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["li", mergeAttributes(HTMLAttributes, { "data-node": "sequencing-item" }), 0];
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
    content: "sequencing_item{2,}",
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
          "data-bounded-scroll-frame": "",
          "data-slot": "sequencing-items-group",
        }),
        [
          "div",
          { "data-bounded-scroll": "", class: "sc-course-sequencing__scroll" },
          ["ol", { role: "list", class: "sc-course-sequencing__list" }, 0],
        ],
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

function hasSameIds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  if (new Set(a).size !== a.length || new Set(b).size !== b.length) return false;
  const bSet = new Set(b);
  return a.every((id) => id.trim().length > 0 && bSet.has(id));
}
