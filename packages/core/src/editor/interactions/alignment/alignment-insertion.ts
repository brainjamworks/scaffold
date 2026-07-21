import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import { normalizeBlockFrame } from "@/editor/frame/model/block-frame";
import { readTextBlockHorizontalAlignment } from "@/editor/rich-text/model/text-alignment";
import type { HorizontalAlignment } from "@/schemas/course-document";

const OWNERSHIP_BOUNDARIES = new Set(["surface", "region", "grid", "cell", "layout", "section"]);

export interface ResolveInsertionHorizontalAlignmentInput {
  blockDefinitions: BlockDefinitionLookup;
  doc: ProseMirrorNode;
  from: number;
  owner?: {
    contentStart: number;
    node: ProseMirrorNode;
  };
  to: number;
}

export interface MaterializeCatalogNodeHorizontalAlignmentInput extends ResolveInsertionHorizontalAlignmentInput {
  node: ProseMirrorNode;
}

interface InsertionParticipant {
  from: number;
  to: number;
  value: HorizontalAlignment | "justify";
}

export function resolveInsertionHorizontalAlignment({
  blockDefinitions,
  doc,
  from,
  owner,
  to,
}: ResolveInsertionHorizontalAlignmentInput): HorizontalAlignment {
  const range = normalizeRange(doc, from, to);
  const scope = owner ?? resolveOwnershipScope(doc, range.from, blockDefinitions);
  const participants = collectParticipants(scope.node, scope.contentStart, blockDefinitions);

  const active = participants.find((participant) => intersectsRange(participant, range));
  if (active && active.value !== "justify") return active.value;

  const preceding = [...participants]
    .reverse()
    .find((participant) => participant.to <= range.from && participant.value !== "justify");
  if (preceding && preceding.value !== "justify") return preceding.value;

  const following = participants.find(
    (participant) => participant.from >= range.to && participant.value !== "justify",
  );
  return following && following.value !== "justify" ? following.value : "left";
}

export function materializeCatalogNodeHorizontalAlignment({
  blockDefinitions,
  doc,
  from,
  to,
  node,
  owner,
}: MaterializeCatalogNodeHorizontalAlignmentInput): ProseMirrorNode {
  const definition = blockDefinitions.getByNodeType(node.type.name);
  if (definition?.frame?.resizable !== true) return node;

  const rawFrame = node.attrs["frame"];
  const frame = normalizeBlockFrame(rawFrame);
  const alignment = resolveInsertionHorizontalAlignment({
    blockDefinitions,
    doc,
    from,
    ...(owner ? { owner } : {}),
    to,
  });
  const align = alignment === "center" ? "center" : alignment === "right" ? "end" : "start";
  if (
    typeof rawFrame === "object" &&
    rawFrame !== null &&
    "align" in rawFrame &&
    rawFrame.align === align
  ) {
    return node;
  }

  return node.type.create(
    {
      ...node.attrs,
      frame: { ...frame, align },
    },
    node.content,
    node.marks,
  );
}

function collectParticipants(
  node: ProseMirrorNode,
  contentStart: number,
  blockDefinitions: BlockDefinitionLookup,
): InsertionParticipant[] {
  const participants: InsertionParticipant[] = [];

  node.descendants((descendant, relativePos) => {
    const pos = contentStart + relativePos;
    const definition = blockDefinitions.getByNodeType(descendant.type.name);
    if (definition) {
      if (definition.frame?.resizable === true) {
        const frame = normalizeBlockFrame(descendant.attrs["frame"]);
        participants.push({
          from: pos,
          to: pos + descendant.nodeSize,
          value: frame.align === "center" ? "center" : frame.align === "end" ? "right" : "left",
        });
      }
      return false;
    }

    if (OWNERSHIP_BOUNDARIES.has(descendant.type.name)) return false;

    const textAlignment = readTextBlockHorizontalAlignment(descendant);
    if (textAlignment) {
      participants.push({
        from: pos + 1,
        to: pos + descendant.nodeSize - 1,
        value: textAlignment,
      });
      return false;
    }

    return true;
  });

  return participants;
}

function resolveOwnershipScope(
  doc: ProseMirrorNode,
  pos: number,
  blockDefinitions: BlockDefinitionLookup,
): { contentStart: number; node: ProseMirrorNode } {
  const $pos = doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (
      OWNERSHIP_BOUNDARIES.has(node.type.name) ||
      blockDefinitions.getByNodeType(node.type.name)
    ) {
      return { contentStart: $pos.start(depth), node };
    }
  }
  return { contentStart: 0, node: doc };
}

function normalizeRange(doc: ProseMirrorNode, from: number, to: number) {
  const lower = clampPosition(doc, Math.min(from, to));
  const upper = clampPosition(doc, Math.max(from, to));
  return { from: lower, to: upper };
}

function clampPosition(doc: ProseMirrorNode, value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.trunc(value), doc.content.size));
}

function intersectsRange(
  participant: InsertionParticipant,
  range: { from: number; to: number },
): boolean {
  if (range.from === range.to) {
    return range.from >= participant.from && range.from <= participant.to;
  }
  return range.from < participant.to && range.to > participant.from;
}
