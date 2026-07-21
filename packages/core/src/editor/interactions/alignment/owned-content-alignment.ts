import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  normalizeBlockFrame,
  setBlockFrameHorizontalAlignmentInTransaction,
} from "@/editor/frame/model/block-frame";
import {
  readTextBlockHorizontalAlignment,
  setTextBlockHorizontalAlignmentInTransaction,
  type ScaffoldTextAlignment,
} from "@/editor/rich-text/model/text-alignment";
import type { HorizontalAlignment } from "@/schemas/course-document";

export type OwnedHorizontalParticipant =
  | { kind: "frame"; pos: number; value: HorizontalAlignment }
  | { kind: "textblock"; pos: number; value: ScaffoldTextAlignment };

export type OwnedHorizontalAggregate =
  | { kind: "value"; value: HorizontalAlignment }
  | { kind: "indeterminate"; reason: "mixed" | "outside-command-set" }
  | { kind: "unavailable" };

const HORIZONTAL_SCOPE_ROOTS = new Set(["surface", "region", "cell", "section"]);
const HORIZONTAL_OWNERSHIP_BOUNDARIES = new Set([
  "surface",
  "region",
  "grid",
  "cell",
  "layout",
  "section",
]);

export function collectOwnedHorizontalParticipants(
  doc: ProseMirrorNode,
  scopePos: number,
  blockDefinitions: BlockDefinitionLookup,
): OwnedHorizontalParticipant[] {
  if (!Number.isInteger(scopePos) || scopePos < 0) return [];
  const scope = doc.nodeAt(scopePos);
  if (!scope || !HORIZONTAL_SCOPE_ROOTS.has(scope.type.name)) return [];

  const participants: OwnedHorizontalParticipant[] = [];
  scope.descendants((node, relativePos) => {
    const pos = scopePos + 1 + relativePos;
    const definition = blockDefinitions.getByNodeType(node.type.name);
    if (definition) {
      if (definition.frame?.resizable === true) {
        participants.push({
          kind: "frame",
          pos,
          value: blockFrameHorizontalAlignment(node),
        });
      }
      return false;
    }

    if (HORIZONTAL_OWNERSHIP_BOUNDARIES.has(node.type.name)) return false;

    const textAlignment = readTextBlockHorizontalAlignment(node);
    if (textAlignment) {
      participants.push({ kind: "textblock", pos, value: textAlignment });
      return false;
    }

    return true;
  });

  return participants;
}

export function aggregateHorizontalParticipants(
  participants: readonly OwnedHorizontalParticipant[],
): OwnedHorizontalAggregate {
  const first = participants[0];
  if (!first) return { kind: "unavailable" };
  if (participants.every((participant) => participant.value === first.value)) {
    return first.value === "justify"
      ? { kind: "indeterminate", reason: "outside-command-set" }
      : { kind: "value", value: first.value };
  }
  return { kind: "indeterminate", reason: "mixed" };
}

export function setOwnedHorizontalAlignmentInTransaction(
  tr: Transaction,
  participants: readonly OwnedHorizontalParticipant[],
  value: HorizontalAlignment,
  blockDefinitions: BlockDefinitionLookup,
): Transaction | null {
  if (!isHorizontalAlignment(value) || participants.length === 0) return null;

  const resolved = participants.map((participant) => {
    const mapped = tr.mapping.mapResult(participant.pos, 1);
    if (mapped.deleted) return null;
    if (mapped.pos < 0 || mapped.pos > tr.doc.content.size) return null;
    const node = tr.doc.nodeAt(mapped.pos);
    if (!node || !matchesParticipant(node, participant.kind, blockDefinitions)) return null;
    return { kind: participant.kind, node, pos: mapped.pos };
  });
  if (resolved.some((participant) => participant === null)) return null;

  let changed = false;
  for (const participant of resolved) {
    if (!participant) return null;
    const current =
      participant.kind === "textblock"
        ? readTextBlockHorizontalAlignment(participant.node)
        : blockFrameHorizontalAlignment(participant.node);
    if (current === value) continue;

    const result =
      participant.kind === "textblock"
        ? setTextBlockHorizontalAlignmentInTransaction(tr, participant.pos, value)
        : setBlockFrameHorizontalAlignmentInTransaction(tr, participant.pos, value);
    if (!result) return null;
    changed = true;
  }
  if (!changed) return null;

  try {
    tr.doc.check();
    return tr;
  } catch {
    return null;
  }
}

function blockFrameHorizontalAlignment(node: ProseMirrorNode): HorizontalAlignment {
  const align = normalizeBlockFrame(node.attrs["frame"]).align;
  if (align === "center") return "center";
  if (align === "end") return "right";
  return "left";
}

function matchesParticipant(
  node: ProseMirrorNode,
  kind: OwnedHorizontalParticipant["kind"],
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  if (kind === "textblock") return readTextBlockHorizontalAlignment(node) !== null;
  return blockDefinitions.getByNodeType(node.type.name)?.frame?.resizable === true;
}

function isHorizontalAlignment(value: unknown): value is HorizontalAlignment {
  return value === "left" || value === "center" || value === "right";
}
