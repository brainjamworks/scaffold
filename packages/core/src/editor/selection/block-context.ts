import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { Selection } from "@tiptap/pm/state";

import type { BlockDefinition } from "@/editor/blocks/block-definition";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import { isNodeSelection } from "./selection-facts";

/**
 * Registered Scaffold block facts for a document node. `depth` is present
 * when the context was resolved from an ancestor walk over a ResolvedPos.
 */
export interface ScaffoldBlockContext {
  node: ProseMirrorNode;
  pos: number;
  nodeType: string;
  definition: BlockDefinition;
  depth?: number;
}

export function resolveScaffoldBlockContext(
  node: ProseMirrorNode,
  pos: number,
  blockDefinitions: BlockDefinitionLookup,
): ScaffoldBlockContext | null {
  const definition = blockDefinitions.getByNodeType(node.type.name);
  if (!definition) return null;

  return {
    node,
    pos,
    nodeType: node.type.name,
    definition,
  };
}

function resolveBlockContextAtDepth(
  $pos: ResolvedPos,
  depth: number,
  blockDefinitions: BlockDefinitionLookup,
): ScaffoldBlockContext | null {
  const node = $pos.node(depth);
  const pos = $pos.before(depth);
  const context = resolveScaffoldBlockContext(node, pos, blockDefinitions);
  if (!context) return null;

  return { ...context, depth };
}

export function resolveClosestScaffoldBlockContext(
  $pos: ResolvedPos,
  blockDefinitions: BlockDefinitionLookup,
): ScaffoldBlockContext | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const context = resolveBlockContextAtDepth($pos, depth, blockDefinitions);
    if (context) return context;
  }

  return null;
}

function delegatesEmbeddedChildSelection(context: ScaffoldBlockContext): boolean {
  return context.definition.interaction?.embeddedChildSelection === "delegate-to-parent";
}

function isSameBlockContext(left: ScaffoldBlockContext, right: ScaffoldBlockContext): boolean {
  return left.nodeType === right.nodeType && left.pos === right.pos;
}

function resolveDelegatingOwner(
  $pos: ResolvedPos,
  context: ScaffoldBlockContext,
  blockDefinitions: BlockDefinitionLookup,
): ScaffoldBlockContext {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const ancestor = resolveBlockContextAtDepth($pos, depth, blockDefinitions);
    if (!ancestor) continue;
    if (isSameBlockContext(ancestor, context)) continue;
    if (!delegatesEmbeddedChildSelection(ancestor)) continue;

    return ancestor;
  }

  return context;
}

/**
 * The Scaffold block directly selected by a ProseMirror NodeSelection.
 * Raw PM object selection: embedded-child delegation never rewrites this.
 */
export function resolveObjectSelectedBlock(
  selection: Selection,
  blockDefinitions: BlockDefinitionLookup,
): ScaffoldBlockContext | null {
  if (!isNodeSelection(selection)) return null;
  return resolveScaffoldBlockContext(selection.node, selection.from, blockDefinitions);
}

/**
 * The Scaffold block that owns chrome for the current PM selection,
 * after embedded-child delegation.
 */
export function resolveSelectionOwnerBlock(
  selection: Selection,
  blockDefinitions: BlockDefinitionLookup,
): ScaffoldBlockContext | null {
  const objectSelectedBlock = resolveObjectSelectedBlock(selection, blockDefinitions);
  if (objectSelectedBlock) {
    return resolveDelegatingOwner(selection.$from, objectSelectedBlock, blockDefinitions);
  }

  const closestFromContext = resolveClosestScaffoldBlockContext(selection.$from, blockDefinitions);
  const closestToContext = resolveClosestScaffoldBlockContext(selection.$to, blockDefinitions);

  if (!closestFromContext || !closestToContext) return null;

  const fromOwner = resolveDelegatingOwner(selection.$from, closestFromContext, blockDefinitions);
  const toOwner = resolveDelegatingOwner(selection.$to, closestToContext, blockDefinitions);

  if (!isSameBlockContext(fromOwner, toOwner)) return null;

  return fromOwner;
}

/**
 * The original selected/active child when a delegating parent became the
 * selection owner. Null when no delegation happened.
 */
export function resolveEmbeddedChildBlock(
  selection: Selection,
  blockDefinitions: BlockDefinitionLookup,
): ScaffoldBlockContext | null {
  const owner = resolveSelectionOwnerBlock(selection, blockDefinitions);
  if (!owner) return null;

  const child =
    resolveObjectSelectedBlock(selection, blockDefinitions) ??
    resolveClosestSharedBlockContext(selection, blockDefinitions);
  if (!child) return null;

  return isSameBlockContext(child, owner) ? null : child;
}

function resolveClosestSharedBlockContext(
  selection: Selection,
  blockDefinitions: BlockDefinitionLookup,
): ScaffoldBlockContext | null {
  const fromContext = resolveClosestScaffoldBlockContext(selection.$from, blockDefinitions);
  const toContext = resolveClosestScaffoldBlockContext(selection.$to, blockDefinitions);

  if (!fromContext || !toContext) return null;
  if (!isSameBlockContext(fromContext, toContext)) return null;

  return fromContext;
}
