import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState, Selection } from "@tiptap/pm/state";

import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";

import {
  EMPTY_INTERACTION_CONTEXT_OWNERS,
  InteractionTargetKind,
  type InteractionContextOwners,
  type InteractionTargetRef,
  type InteractionTargetPolicy,
} from "../../model/interaction-owner-state";
import { projectStructuralTargetPolicy } from "./target-policy-projection";
import {
  projectStructuralTargetRef,
  type StructuralInteractionTargetKind,
} from "./target-ref-projection";

interface StructuralAncestor {
  depth: number;
  kind: StructuralInteractionTargetKind;
  node: ProseMirrorNode;
  pos: number;
}

const STRUCTURAL_TARGET_KIND_BY_NODE_NAME: Readonly<
  Record<string, StructuralInteractionTargetKind>
> = {
  cell: InteractionTargetKind.Cell,
  grid: InteractionTargetKind.Grid,
  layout: InteractionTargetKind.Layout,
  region: InteractionTargetKind.Region,
  section: InteractionTargetKind.Section,
  surface: InteractionTargetKind.Surface,
};

export function projectInteractionContextOwners(selection: Selection): InteractionContextOwners {
  return projectInteractionContextOwnersFromAncestors(
    sharedStructuralAncestors(selection.$from, selection.$to),
  );
}

export function projectInteractionContextOwnersForTarget(
  state: EditorState,
  target: InteractionTargetRef | null | undefined,
): InteractionContextOwners | null {
  const ancestors = structuralAncestorsForTarget(state, target);
  return ancestors ? projectInteractionContextOwnersFromAncestors(ancestors) : null;
}

function projectInteractionContextOwnersFromAncestors(
  ancestors: readonly StructuralAncestor[],
): InteractionContextOwners {
  const owners: InteractionContextOwners = {
    ...EMPTY_INTERACTION_CONTEXT_OWNERS,
  };

  for (const ancestor of ancestors) {
    owners[ancestor.kind] = projectStructuralTargetRef(ancestor);
  }

  return owners;
}

export function projectInteractionContextOwnerPolicies(
  selection: Selection,
): readonly InteractionTargetPolicy[] {
  return projectStructuralAncestorPolicies(
    sharedStructuralAncestors(selection.$from, selection.$to),
  );
}

export function projectInteractionContextOwnerPoliciesForTarget(
  state: EditorState,
  target: InteractionTargetRef | null | undefined,
): readonly InteractionTargetPolicy[] | null {
  const ancestors = structuralAncestorsForTarget(state, target);
  return ancestors ? projectStructuralAncestorPolicies(ancestors) : null;
}

function projectStructuralAncestorPolicies(
  ancestors: readonly StructuralAncestor[],
): readonly InteractionTargetPolicy[] {
  return ancestors.map((ancestor) =>
    projectStructuralTargetPolicy({
      ...ancestor,
      supportsSettings: supportsStructuralSettings(ancestor, ancestors),
    }),
  );
}

function structuralAncestorsForTarget(
  state: EditorState,
  target: InteractionTargetRef | null | undefined,
): StructuralAncestor[] | null {
  if (!target || !Number.isInteger(target.pos)) return null;

  const pos = target.pos as number;
  if (pos < 0 || pos > state.doc.content.size) return null;

  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  if (target.id && node.attrs["id"] !== target.id) return null;
  if (!targetKindMatchesNode(target.kind, node)) return null;

  const resolvePos = targetResolvePos(state, pos, node);
  if (resolvePos === null) return null;

  return collectStructuralAncestors(state.doc.resolve(resolvePos));
}

function targetKindMatchesNode(kind: InteractionTargetKind, node: ProseMirrorNode): boolean {
  if (kind === InteractionTargetKind.Block) return true;
  if (kind === InteractionTargetKind.Field) return true;
  return node.type.name === kind;
}

function targetResolvePos(state: EditorState, pos: number, node: ProseMirrorNode): number | null {
  if (node.nodeSize > 1 && pos + 1 <= state.doc.content.size) {
    return pos + 1;
  }
  return pos <= state.doc.content.size ? pos : null;
}

function sharedStructuralAncestors($from: ResolvedPos, $to: ResolvedPos): StructuralAncestor[] {
  const toAncestors = collectStructuralAncestors($to);

  return collectStructuralAncestors($from).filter((fromAncestor) =>
    toAncestors.some((toAncestor) => isSameStructuralAncestor(fromAncestor, toAncestor)),
  );
}

function collectStructuralAncestors($pos: ResolvedPos): StructuralAncestor[] {
  const ancestors: StructuralAncestor[] = [];

  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    const node = $pos.node(depth);
    const kind = STRUCTURAL_TARGET_KIND_BY_NODE_NAME[node.type.name];
    if (!kind) continue;

    ancestors.push({
      depth,
      kind,
      node,
      pos: $pos.before(depth),
    });
  }

  return ancestors;
}

function isSameStructuralAncestor(left: StructuralAncestor, right: StructuralAncestor): boolean {
  return left.kind === right.kind && left.pos === right.pos;
}

function supportsStructuralSettings(
  ancestor: StructuralAncestor,
  ancestors: readonly StructuralAncestor[],
): boolean {
  if (ancestor.kind === InteractionTargetKind.Layout) {
    return Boolean(builtInLayoutRegistry.getForNode(ancestor.node)?.settingsSheet);
  }

  if (ancestor.kind !== InteractionTargetKind.Section) {
    return false;
  }

  const parentLayout = ancestors.find(
    (candidate) =>
      candidate.kind === InteractionTargetKind.Layout && candidate.depth < ancestor.depth,
  );

  return Boolean(
    parentLayout && builtInLayoutRegistry.getForNode(parentLayout.node)?.section?.settingsSheet,
  );
}
