import type {
  DocumentSemanticsDefinition,
  PublishedSemanticChild,
  SemanticChildProjectionInput,
} from "@/document/model/semantic-document";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  normalizeSemanticLabel,
  richTextTypeFallback,
} from "@/document/model/semantic-document/semantic-labels";

export interface CreateSurfaceDocumentSemanticsInput {
  /** Publish standard rich text rooted directly beneath the Surface. */
  readonly directRichText?: boolean;
  /** Publish these direct Surface-owned text nodes as semantic rich text. */
  readonly ownedRichTextNodeTypes?: readonly string[];
  /** Publish standard rich text inside these direct Surface-owned wrappers. */
  readonly contentRootNodeTypes?: readonly string[];
}

export function createSurfaceDocumentSemantics({
  directRichText = false,
  ownedRichTextNodeTypes = [],
  contentRootNodeTypes = [],
}: CreateSurfaceDocumentSemanticsInput): DocumentSemanticsDefinition {
  const ownedRichTextTypes = new Set(ownedRichTextNodeTypes);
  const contentRootTypes = new Set(contentRootNodeTypes);

  return Object.freeze({
    projectChildren: ({ owner, helpers }: SemanticChildProjectionInput) => {
      const candidates = new Map<number, PublishedSemanticChild>();
      const directChildren: Array<{
        readonly node: ProseMirrorNode;
        readonly from: number;
        readonly to: number;
      }> = [];
      let offset = 0;
      owner.forEach((node) => {
        directChildren.push({ node, from: offset, to: offset + node.nodeSize });
        offset += node.nodeSize;
      });

      if (directRichText) {
        const standardCandidates = helpers.projectStandardRichText();
        const approvedRanges = directChildren.filter(({ from }) =>
          standardCandidates.some(({ relativePos }) => relativePos === from),
        );
        for (const candidate of standardCandidates) {
          if (
            approvedRanges.some(
              ({ from, to }) => candidate.relativePos >= from && candidate.relativePos < to,
            )
          ) {
            candidates.set(candidate.relativePos, candidate);
          }
        }
      }

      for (const { node, from } of directChildren) {
        if (ownedRichTextTypes.has(node.type.name)) {
          candidates.set(
            from,
            Object.freeze({
              relativePos: from,
              semanticRole: "rich-text" as const,
              label: normalizeSemanticLabel(node.textContent, richTextTypeFallback(node.type.name)),
            }),
          );
        }
        if (contentRootTypes.has(node.type.name)) {
          for (const candidate of helpers.projectStandardRichText(node)) {
            candidates.set(candidate.relativePos, candidate);
          }
        }
      }

      return Object.freeze([...candidates.values()].sort((a, b) => a.relativePos - b.relativePos));
    },
  });
}
