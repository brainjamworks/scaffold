import type {
  DocumentTreeDefinition,
  ExposedDocumentChild,
  DocumentTreeChildrenInput,
} from "@/document/model/document-tree";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PRESENTATION_VISUAL_ACTION_IDS } from "@/document/model/document-tree/definition";
import {
  normalizeSemanticLabel,
  richTextTypeFallback,
} from "@/document/model/document-tree/semantic-labels";

export interface CreateSurfaceDocumentTreeInput {
  /** Publish standard rich text rooted directly beneath the Surface. */
  readonly directRichText?: boolean;
  /** Publish these direct Surface-owned text nodes as semantic rich text. */
  readonly ownedRichTextNodeTypes?: readonly string[];
  /** Publish standard rich text inside these direct Surface-owned wrappers. */
  readonly contentRootNodeTypes?: readonly string[];
}

export function createSurfaceDocumentTree({
  directRichText = false,
  ownedRichTextNodeTypes = [],
  contentRootNodeTypes = [],
}: CreateSurfaceDocumentTreeInput): DocumentTreeDefinition {
  const ownedRichTextTypes = new Set(ownedRichTextNodeTypes);
  const contentRootTypes = new Set(contentRootNodeTypes);

  return Object.freeze({
    presentation: Object.freeze({ actionIds: PRESENTATION_VISUAL_ACTION_IDS }),
    projectChildren: ({ owner, helpers }: DocumentTreeChildrenInput) => {
      const candidates = new Map<number, ExposedDocumentChild>();
      const directChildren: Array<{
        readonly node: ProseMirrorNode;
        readonly from: number;
      }> = [];
      let offset = 0;
      owner.forEach((node) => {
        directChildren.push({ node, from: offset });
        offset += node.nodeSize;
      });

      if (directRichText) {
        for (const candidate of helpers.projectStandardRichText()) {
          candidates.set(candidate.relativePos, candidate);
        }
      }

      for (const { node, from } of directChildren) {
        if (ownedRichTextTypes.has(node.type.name)) {
          candidates.set(
            from,
            Object.freeze({
              relativePos: from,
              treeRole: "rich-text" as const,
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
