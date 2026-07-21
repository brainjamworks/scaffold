import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

import type { ScaffoldBlockContext } from "@/editor/selection/block-context";

import {
  InteractionTargetKind,
  createInteractionTargetRef,
  type InteractionTargetRef,
  type InteractionTargetKind as InteractionTargetKindValue,
} from "../../model/interaction-owner-state";

export type StructuralInteractionTargetKind = Exclude<
  InteractionTargetKindValue,
  typeof InteractionTargetKind.Block | typeof InteractionTargetKind.Field
>;

export interface StructuralTargetRefInput {
  kind: StructuralInteractionTargetKind;
  node: ProseMirrorNode;
  pos: number;
}

export function projectBlockTargetRef(blockContext: ScaffoldBlockContext): InteractionTargetRef {
  const id = readStableStringId(blockContext.node.attrs?.["id"]);

  return createInteractionTargetRef({
    ...(id ? { id } : {}),
    kind: InteractionTargetKind.Block,
    pos: blockContext.pos,
  });
}

export function projectStructuralTargetRef({
  kind,
  node,
  pos,
}: StructuralTargetRefInput): InteractionTargetRef {
  const id = readStableStringId(node.attrs?.["id"]);

  return createInteractionTargetRef({
    ...(id ? { id } : {}),
    kind,
    pos,
  });
}

function readStableStringId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
