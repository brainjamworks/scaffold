import { DOMSerializer, type Node as PMNode } from "@tiptap/pm/model";

import { serializeStaticRichTextHtml } from "@/editor/rich-text/static/render-rich-text";

import type { MatchingProjectionPair } from "./matching-fields-shared";

export interface MatchingCourseContent {
  readonly pairs: readonly MatchingProjectionPair[];
}

export function matchingCourseContentFromProseMirror(
  group: PMNode,
  serializer: DOMSerializer,
): MatchingCourseContent {
  return {
    pairs: projectionsFromGroup(group, serializer),
  };
}

function childByType(node: PMNode, typeName: string): PMNode | null {
  let found: PMNode | null = null;
  node.forEach((child) => {
    if (!found && child.type.name === typeName) found = child;
  });
  return found;
}

function fieldHtml(serializer: DOMSerializer, node: PMNode | null): string {
  return node?.textContent.trim() ? serializeStaticRichTextHtml(serializer, node.content) : "";
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
