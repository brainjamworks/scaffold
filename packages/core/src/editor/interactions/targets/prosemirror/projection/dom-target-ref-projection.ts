import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  AuthoringFrameKind,
  type AuthoringFrameDescriptor,
} from "@/editor/interactions/dom/authoring-frame";
import {
  resolveScaffoldBlockContext,
  type ScaffoldBlockContext,
} from "@/editor/selection/block-context";

import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import {
  projectBlockTargetRef,
  projectStructuralTargetRef,
  type StructuralInteractionTargetKind,
} from "./target-ref-projection";

export function projectInteractionTargetRefFromAuthoringFrame(
  state: EditorState,
  descriptor: AuthoringFrameDescriptor,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetRef | null {
  if (descriptor.frameKind === AuthoringFrameKind.Block) {
    return projectBlockFrameTargetRef(state, descriptor, blockDefinitions);
  }

  const structuralKind = structuralKindForFrameKind(descriptor.frameKind);
  if (!structuralKind) return null;

  const found = findNodeById(state, structuralKind, descriptor.id);
  if (!found) return null;

  return projectStructuralTargetRef({
    kind: structuralKind,
    node: found.node,
    pos: found.pos,
  });
}

export function projectInteractionOwnerTargetRefFromAuthoringFrame(
  state: EditorState,
  descriptor: AuthoringFrameDescriptor,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetRef | null {
  if (descriptor.frameKind !== AuthoringFrameKind.Block) {
    return projectInteractionTargetRefFromAuthoringFrame(state, descriptor, blockDefinitions);
  }

  const blockContext = resolveBlockFrameContext(state, descriptor, blockDefinitions);
  if (!blockContext) return null;

  const owner = resolveDelegatingOwnerBlockContext(state, blockContext, blockDefinitions);
  return projectBlockTargetRef(owner ?? blockContext);
}

export function projectSectionParentLayoutOwnerTargetRef(
  state: EditorState,
  descriptor: AuthoringFrameDescriptor,
): InteractionTargetRef | null {
  if (descriptor.frameKind !== AuthoringFrameKind.Section) return null;

  const found = findNodeById(state, InteractionTargetKind.Section, descriptor.id);
  if (!found) return null;

  const $section = state.doc.resolve(found.pos);
  for (let depth = $section.depth; depth > 0; depth -= 1) {
    const ancestor = $section.node(depth);
    if (ancestor.type.name !== InteractionTargetKind.Layout) continue;

    return projectStructuralTargetRef({
      kind: InteractionTargetKind.Layout,
      node: ancestor,
      pos: $section.before(depth),
    });
  }

  return null;
}

function projectBlockFrameTargetRef(
  state: EditorState,
  descriptor: AuthoringFrameDescriptor,
  blockDefinitions: BlockDefinitionLookup,
): InteractionTargetRef | null {
  const blockContext = resolveBlockFrameContext(state, descriptor, blockDefinitions);
  return blockContext ? projectBlockTargetRef(blockContext) : null;
}

function resolveBlockFrameContext(
  state: EditorState,
  descriptor: AuthoringFrameDescriptor,
  blockDefinitions: BlockDefinitionLookup,
): ScaffoldBlockContext | null {
  if (!descriptor.nodeType) return null;

  const found = findNodeById(state, descriptor.nodeType, descriptor.id);
  if (!found) return null;

  const blockContext = resolveScaffoldBlockContext(found.node, found.pos, blockDefinitions);
  if (!blockContext) return null;

  return blockContext;
}

function resolveDelegatingOwnerBlockContext(
  state: EditorState,
  blockContext: ScaffoldBlockContext,
  blockDefinitions: BlockDefinitionLookup,
): ScaffoldBlockContext | null {
  const $block = state.doc.resolve(blockContext.pos);

  for (let depth = $block.depth; depth > 0; depth -= 1) {
    const ancestor = resolveScaffoldBlockContext(
      $block.node(depth),
      $block.before(depth),
      blockDefinitions,
    );
    if (!ancestor) continue;
    if (ancestor.definition.interaction?.embeddedChildSelection !== "delegate-to-parent") {
      continue;
    }

    return ancestor;
  }

  return null;
}

const STRUCTURAL_FRAME_KINDS = new Set<string>([
  AuthoringFrameKind.Cell,
  AuthoringFrameKind.Grid,
  AuthoringFrameKind.Layout,
  AuthoringFrameKind.Region,
  AuthoringFrameKind.Section,
  AuthoringFrameKind.Surface,
]);

function structuralKindForFrameKind(frameKind: string): StructuralInteractionTargetKind | null {
  return STRUCTURAL_FRAME_KINDS.has(frameKind)
    ? (frameKind as StructuralInteractionTargetKind)
    : null;
}

function findNodeById(
  state: EditorState,
  nodeType: string,
  id: string,
): { node: ProseMirrorNode; pos: number } | null {
  let found: { node: ProseMirrorNode; pos: number } | null = null;

  state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === nodeType && node.attrs["id"] === id) {
      found = { node, pos };
      return false;
    }
    return true;
  });

  return found;
}
