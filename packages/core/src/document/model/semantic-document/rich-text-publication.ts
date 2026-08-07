import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { PublishedSemanticChild } from "./definition";
import { normalizeSemanticLabel, richTextTypeFallback } from "./semantic-labels";

const SUPPORTED_NODE_TYPES = new Set([
  "heading",
  "paragraph",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
]);

export interface ProjectStandardRichTextInput {
  readonly owner: ProseMirrorNode;
  readonly contentRoot?: ProseMirrorNode;
}

export function projectStandardRichText({
  owner,
  contentRoot = owner,
}: ProjectStandardRichTextInput): readonly PublishedSemanticChild[] {
  const contentStart = resolveContentStart(owner, contentRoot);
  if (contentStart === null) return Object.freeze([]);

  const candidates: PublishedSemanticChild[] = [];
  const visitChildren = (parent: ProseMirrorNode, parentContentStart: number): void => {
    let offset = 0;
    parent.forEach((node, _childOffset, index) => {
      const relativePos = parentContentStart + offset;
      if (SUPPORTED_NODE_TYPES.has(node.type.name)) {
        if (!(parent.type.name === "listItem" && index === 0 && node.type.name === "paragraph")) {
          candidates.push(
            Object.freeze({
              relativePos,
              semanticRole: "rich-text" as const,
              label: labelForRichTextNode(node),
            }),
          );
        }
        if (
          node.type.name === "bulletList" ||
          node.type.name === "orderedList" ||
          node.type.name === "listItem" ||
          node.type.name === "blockquote"
        ) {
          visitChildren(node, relativePos + 1);
        }
      }
      offset += node.nodeSize;
    });
  };

  visitChildren(contentRoot, contentStart);
  return Object.freeze(candidates);
}

function resolveContentStart(owner: ProseMirrorNode, contentRoot: ProseMirrorNode): number | null {
  if (contentRoot === owner) return 0;
  let contentStart: number | null = null;
  owner.descendants((node, pos) => {
    if (node === contentRoot) {
      contentStart = pos + 1;
      return false;
    }
    return contentStart === null;
  });
  return contentStart;
}

function labelForRichTextNode(node: ProseMirrorNode): string {
  const text =
    node.type.name === "listItem" && node.firstChild?.type.name === "paragraph"
      ? node.firstChild.textContent
      : node.textContent;
  return normalizeSemanticLabel(text, richTextTypeFallback(node.type.name));
}
