import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import { ClassifyAssessmentSchema } from "@scaffold/contracts";
import type { AssessmentFeedbackContent } from "@scaffold/contracts";

export interface CategoriseCategoryProjection {
  id: string;
  html: string;
  label: string;
}

export interface CategoriseItemProjection {
  id: string;
  html: string;
  label: string;
}

export interface CategoriseReveal {
  placements: Record<string, string>;
  feedbackByItemId: Record<string, AssessmentFeedbackContent>;
}

interface CategoriseSourceItemAccessibilityState {
  interactionLocked: boolean;
  selected: boolean;
}

interface CategoriseCategoryAccessibilityState {
  activeDrop: boolean;
  placedCount: number;
}

interface CategorisePlacedItemAccessibilityState {
  correct: boolean | null;
  hasFeedback: boolean;
  revealed: boolean;
  submitted: boolean;
}

export interface CategoriseFieldNodeOptions {
  addNodeView?: () => NodeViewRenderer;
  content?: string;
}

export const EMPTY_PLACEMENTS: Readonly<Record<string, string>> = {};

const CATEGORISE_TEXT_CONTENT = textContentExpression();

export function fieldContent() {
  return [{ type: "paragraph" }];
}

export function childByType(node: PMNode, typeName: string): PMNode | null {
  let found: PMNode | null = null;
  node.forEach((child) => {
    if (!found && child.type.name === typeName) found = child;
  });
  return found;
}

export function categoriseContentNode(node: PMNode): PMNode | null {
  return node.type.name === "categorise_content" ? node : childByType(node, "categorise_content");
}

export function fieldHtml(serializer: DOMSerializer, node: PMNode | null): string {
  return node ? serializeStaticRichTextHtml(serializer, node.content) : "";
}

export function categoriesFromContent(
  content: PMNode,
  serializer: DOMSerializer,
): CategoriseCategoryProjection[] {
  const categoriseContent = categoriseContentNode(content);
  // `categorise_bin` is the persisted node type; runtime and assessment
  // contracts refer to these nodes as categories.
  const binsGroup = categoriseContent
    ? childByType(categoriseContent, "categorise_bins_group")
    : null;
  const categories: CategoriseCategoryProjection[] = [];
  binsGroup?.forEach((bin) => {
    if (bin.type.name !== "categorise_bin") return;
    const id = String(bin.attrs["id"] ?? "");
    if (!id) return;
    categories.push({
      id,
      html: fieldHtml(serializer, bin),
      label: categoriseCategoryPublicLabel(bin.textContent, categories.length + 1),
    });
  });
  return categories;
}

export function itemsFromContent(
  content: PMNode,
  serializer: DOMSerializer,
): CategoriseItemProjection[] {
  const categoriseContent = categoriseContentNode(content);
  const itemsGroup = categoriseContent
    ? childByType(categoriseContent, "categorise_items_group")
    : null;
  const items: CategoriseItemProjection[] = [];
  itemsGroup?.forEach((item) => {
    if (item.type.name !== "categorise_item") return;
    const id = String(item.attrs["id"] ?? "");
    if (!id) return;
    items.push({
      id,
      html: fieldHtml(serializer, childByType(item, "categorise_item_body")),
      label: categoriseItemPublicLabel(item.textContent, items.length + 1),
    });
  });
  return items;
}

export function categoriseItemPublicLabel(content: string, position: number): string {
  return publicLabel(content) || `item ${position}`;
}

export function categoriseCategoryPublicLabel(content: string, position: number): string {
  return publicLabel(content) || `category ${position}`;
}

export function deterministicShuffle<T extends { id: string }>(
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
  return shuffled;
}

export function categoriseRevealFromAnswers(answers: unknown): CategoriseReveal | null {
  const parsed = ClassifyAssessmentSchema.safeParse(answers);
  if (!parsed.success) return null;

  const placements: Record<string, string> = {};
  for (const placement of parsed.data.correctPlacements) {
    placements[placement.itemId] = placement.categoryId;
  }

  return { placements, feedbackByItemId: parsed.data.feedbackByItemId };
}

export function reconcileCategorisePlacements(
  placements: Readonly<Record<string, string>>,
  itemIds: readonly string[],
  categoryIds: readonly string[],
): Record<string, string> {
  const identity = projectedCategoriseIdentity(itemIds, categoryIds);
  const next: Record<string, string> = {};
  for (const itemId of identity.itemIds) {
    const categoryId = placements[itemId];
    if (categoryId && identity.categoryIdSet.has(categoryId)) next[itemId] = categoryId;
  }
  return next;
}

export function resolveAuthorizedCategoriseReveal({
  answerKeyVisible,
  categoryIds,
  itemIds,
  reveal,
  resultItems,
}: {
  answerKeyVisible: boolean;
  categoryIds: readonly string[];
  itemIds: readonly string[];
  reveal: CategoriseReveal | null;
  resultItems: Readonly<Record<string, { expected?: unknown }>> | null;
}): CategoriseReveal | null {
  if (!answerKeyVisible) return null;
  const identity = projectedCategoriseIdentity(itemIds, categoryIds);
  if (reveal && hasCompleteExactPlacements(reveal.placements, identity)) {
    return {
      placements: Object.fromEntries(
        identity.itemIds.map((itemId) => [itemId, reveal.placements[itemId]!] as const),
      ),
      feedbackByItemId: Object.fromEntries(
        identity.itemIds.flatMap((itemId) => {
          const feedback = reveal.feedbackByItemId[itemId];
          return feedback ? ([[itemId, feedback]] as const) : [];
        }),
      ),
    };
  }

  if (!resultItems) return null;
  const placements: Record<string, string> = {};
  for (const itemId of identity.itemIds) {
    const expected = resultItems[itemId]?.expected;
    if (typeof expected !== "string" || !identity.categoryIdSet.has(expected)) return null;
    placements[itemId] = expected;
  }
  return { placements, feedbackByItemId: {} };
}

export function describeCategoriseSourceItemAccessibilityState({
  interactionLocked,
  selected,
}: CategoriseSourceItemAccessibilityState): string {
  if (selected) return "Selected item";
  return interactionLocked ? "Placement locked" : "Unplaced item";
}

export function describeCategoriseCategoryAccessibilityState({
  activeDrop,
  placedCount,
}: CategoriseCategoryAccessibilityState): string {
  if (activeDrop) return "Ready to place selected item";
  if (placedCount === 0) return "No items placed";
  return placedCount === 1 ? "Contains 1 item" : `Contains ${placedCount} items`;
}

export function describeCategorisePlacedItemAccessibilityState({
  correct,
  hasFeedback,
  revealed,
  submitted,
}: CategorisePlacedItemAccessibilityState): string {
  const parts = ["Placed item"];

  if (revealed) {
    parts.push("Revealed correct placement");
  } else if (submitted && correct === true) {
    parts.push("Submitted placement, correct");
  } else if (submitted && correct === false) {
    parts.push("Submitted placement, incorrect");
  }

  if (hasFeedback && (revealed || correct !== null)) {
    parts.push("Feedback available");
  }

  return parts.join(". ");
}

export function categorisePlacementsRecord(
  placements: Array<{ itemId: string; categoryId: string }>,
): Record<string, string> {
  const record: Record<string, string> = {};
  for (const placement of placements) {
    record[placement.itemId] = placement.categoryId;
  }
  return record;
}

interface ProjectedCategoriseIdentity {
  readonly itemIds: readonly string[];
  readonly categoryIdSet: ReadonlySet<string>;
}

function projectedCategoriseIdentity(
  itemIds: readonly string[],
  categoryIds: readonly string[],
): ProjectedCategoriseIdentity {
  if (itemIds.some((id) => !id.trim()) || new Set(itemIds).size !== itemIds.length) {
    throw new Error("Projected Categorise item ids must be nonblank and unique");
  }
  if (categoryIds.some((id) => !id.trim()) || new Set(categoryIds).size !== categoryIds.length) {
    throw new Error("Projected Categorise category ids must be nonblank and unique");
  }
  return { itemIds, categoryIdSet: new Set(categoryIds) };
}

function hasCompleteExactPlacements(
  placements: Readonly<Record<string, string>>,
  identity: ProjectedCategoriseIdentity,
): boolean {
  const entries = Object.entries(placements);
  return (
    entries.length === identity.itemIds.length &&
    entries.every(
      ([itemId, categoryId]) =>
        identity.itemIds.includes(itemId) && identity.categoryIdSet.has(categoryId),
    )
  );
}

function publicLabel(content: string): string {
  return content.replace(/\s+/g, " ").trim();
}

export function createCategoriseBinNode(options: CategoriseFieldNodeOptions = {}) {
  return Node.create({
    name: "categorise_bin",
    ...fieldContainerSpec({ content: options.content ?? CATEGORISE_TEXT_CONTENT }),

    parseHTML() {
      return [{ tag: 'div[data-node="categorise-bin"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "categorise-bin" }), 0];
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

export function createCategoriseBinTitleNode(options: CategoriseFieldNodeOptions = {}) {
  return Node.create({
    name: "categorise_bin_title",
    ...fieldContainerSpec({ content: CATEGORISE_TEXT_CONTENT }),

    parseHTML() {
      return [{ tag: 'div[data-slot="categorise-bin-title"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-slot": "categorise-bin-title",
        }),
        0,
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

export function createCategoriseBinsGroupNode(options: CategoriseFieldNodeOptions = {}) {
  return Node.create({
    name: "categorise_bins_group",
    content: "categorise_bin+",
    defining: true,
    isolating: true,
    selectable: false,

    parseHTML() {
      return [{ tag: 'div[data-slot="categorise-bins-group"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-slot": "categorise-bins-group",
        }),
        0,
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

export function createCategoriseItemBodyNode(options: CategoriseFieldNodeOptions = {}) {
  return Node.create({
    name: "categorise_item_body",
    ...fieldContainerSpec({ content: CATEGORISE_TEXT_CONTENT }),

    parseHTML() {
      return [{ tag: 'div[data-slot="categorise-item-body"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-slot": "categorise-item-body",
        }),
        0,
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

export function createCategoriseItemNode(options: CategoriseFieldNodeOptions = {}) {
  return Node.create({
    name: "categorise_item",
    content: "categorise_item_body",
    defining: true,
    isolating: true,
    selectable: false,
    draggable: false,

    parseHTML() {
      return [{ tag: 'div[data-node="categorise-item"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return ["div", mergeAttributes(HTMLAttributes, { "data-node": "categorise-item" }), 0];
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

export function createCategoriseItemsGroupNode(options: CategoriseFieldNodeOptions = {}) {
  return Node.create({
    name: "categorise_items_group",
    content: options.content ?? "categorise_item+",
    defining: true,
    isolating: true,
    selectable: false,

    parseHTML() {
      return [{ tag: 'div[data-slot="categorise-items-group"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-slot": "categorise-items-group",
        }),
        0,
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

export function createCategoriseContentNode(options: CategoriseFieldNodeOptions = {}) {
  return Node.create({
    name: "categorise_content",
    content: options.content ?? "categorise_bins_group categorise_items_group",
    defining: true,
    isolating: true,
    selectable: false,

    parseHTML() {
      return [{ tag: 'div[data-slot="categorise-content"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(HTMLAttributes, {
          "data-bounded-scroll-frame": "",
          "data-slot": "categorise-content",
        }),
        ["div", { "data-bounded-scroll": "", class: "sc-course-categorise__scroll" }, 0],
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
