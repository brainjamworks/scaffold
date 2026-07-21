import type { Selection } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";

import {
  resolveEmbeddedChildBlock,
  resolveObjectSelectedBlock,
  resolveSelectionOwnerBlock,
  type ScaffoldBlockContext,
} from "./block-context";
import {
  resolveCourseSelectionFacts,
  type CourseSelectionFacts,
  type CourseSelectionRange,
} from "./selection-facts";

/**
 * PM-only selection facts plus the Scaffold block split derived from them.
 * `objectSelectedBlock` is raw ProseMirror object selection; delegation only
 * ever moves `selectionOwnerBlock`.
 */
export interface CourseSelectionProjection {
  facts: CourseSelectionFacts;
  objectSelectedBlock: ScaffoldBlockContext | null;
  selectionOwnerBlock: ScaffoldBlockContext | null;
  embeddedChildBlock: ScaffoldBlockContext | null;
}

export function resolveCourseSelectionProjection(
  selection: Selection,
  blockDefinitions: BlockDefinitionLookup,
): CourseSelectionProjection {
  return {
    facts: resolveCourseSelectionFacts(selection),
    objectSelectedBlock: resolveObjectSelectedBlock(selection, blockDefinitions),
    selectionOwnerBlock: resolveSelectionOwnerBlock(selection, blockDefinitions),
    embeddedChildBlock: resolveEmbeddedChildBlock(selection, blockDefinitions),
  };
}

export function isObjectSelectedBlockInsideRange(
  selection: Selection,
  blockDefinitions: BlockDefinitionLookup,
  range: CourseSelectionRange,
): boolean {
  const objectSelectedBlock = resolveObjectSelectedBlock(selection, blockDefinitions);
  if (!objectSelectedBlock) return false;

  return objectSelectedBlock.pos > range.from && objectSelectedBlock.pos < range.to;
}

export function isSelectionOwnerBlockInsideRange(
  selection: Selection,
  blockDefinitions: BlockDefinitionLookup,
  range: CourseSelectionRange,
): boolean {
  const selectionOwnerBlock = resolveSelectionOwnerBlock(selection, blockDefinitions);
  if (!selectionOwnerBlock) return false;

  return selectionOwnerBlock.pos > range.from && selectionOwnerBlock.pos < range.to;
}
