import { Node, mergeAttributes, type NodeViewRenderer } from "@tiptap/core";
import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";
import { ClassifyAssessmentSchema } from "@scaffold/contracts";
import type { AssessmentFeedbackContent } from "@scaffold/contracts";

export interface CategoriseBinProjection {
  id: string;
  html: string;
}

export interface CategoriseItemProjection {
  id: string;
  html: string;
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

export function binsFromContent(
  content: PMNode,
  serializer: DOMSerializer,
): CategoriseBinProjection[] {
  const categoriseContent = categoriseContentNode(content);
  const binsGroup = categoriseContent
    ? childByType(categoriseContent, "categorise_bins_group")
    : null;
  const bins: CategoriseBinProjection[] = [];
  binsGroup?.forEach((bin) => {
    if (bin.type.name !== "categorise_bin") return;
    const id = String(bin.attrs["id"] ?? "");
    if (!id) return;
    bins.push({ id, html: fieldHtml(serializer, bin) });
  });
  return bins;
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
    });
  });
  return items;
}

export function deterministicShuffle<T extends { id: string }>(
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
  return arr;
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

export function createCategoriseBinNode(options: CategoriseFieldNodeOptions = {}) {
  return Node.create({
    name: "categorise_bin",
    ...fieldContainerSpec({ content: options.content ?? CATEGORISE_TEXT_CONTENT }),

    addAttributes() {
      return {
        id: {
          default: "",
          parseHTML: (el: HTMLElement) => el.getAttribute("data-bin-id") ?? "",
          renderHTML: (attrs: { id: string }) => (attrs.id ? { "data-bin-id": attrs.id } : {}),
        },
      };
    },

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
          "data-assessment-bounded-scroll-frame": "",
          "data-slot": "categorise-content",
        }),
        ["div", { "data-assessment-bounded-scroll": "", class: "sc-categorise-content-scroll" }, 0],
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
