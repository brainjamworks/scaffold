import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  AuthoringFrameKind,
  resolveAuthoringFrameElement,
  type AuthoringFrameLocator,
} from "@/editor/interactions/dom/authoring-frame";
import { setObjectSelectionInTransaction } from "@/editor/selection/selection-transactions";
import {
  resolveScaffoldBlockContext,
  type ScaffoldBlockContext,
} from "@/editor/selection/block-context";

import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import { resolveBlockChromeFrameElement } from "../projection/block-chrome-target-projection";
import { findLiveDocumentNodeAtPos } from "../projection/live-document-position";
import { resolveStructuralChromeFrameElement } from "../projection/structural-chrome-target-projection";
import {
  projectBlockTargetRef,
  projectStructuralTargetRef,
  type StructuralInteractionTargetKind,
} from "../projection/target-ref-projection";
import { createInteractionTargetActivationTransaction } from "./interaction-activation-dispatch";

export interface AuthoringInteractionNavigationLocation {
  readonly id: string;
  readonly nodeType: string;
  readonly pos: number;
}

export interface AuthoringInteractionNavigationTarget {
  readonly activation: "compatibility-object" | "object" | "structural";
  readonly frame: AuthoringFrameLocator;
  readonly nodeSize: number;
  readonly pos: number;
  readonly target: InteractionTargetRef | null;
}

/**
 * Projects a semantic/document location onto the same Block and structural
 * owner vocabulary used by pointer activation and editor chrome.
 */
export function resolveAuthoringInteractionNavigationTarget(
  state: EditorState,
  location: AuthoringInteractionNavigationLocation,
  blockDefinitions: BlockDefinitionLookup,
): AuthoringInteractionNavigationTarget | null {
  const found = findLiveDocumentNodeAtPos(state, location.pos);
  if (
    !found ||
    found.node.type.name !== location.nodeType ||
    found.node.attrs["id"] !== location.id
  ) {
    return null;
  }

  const compatibilityFrame = compatibilityFrameForNode(found.node);
  if (compatibilityFrame) {
    return {
      activation: "compatibility-object",
      frame: compatibilityFrame,
      nodeSize: found.node.nodeSize,
      pos: found.pos,
      target: null,
    };
  }

  const directBlock = resolveScaffoldBlockContext(found.node, found.pos, blockDefinitions);
  if (directBlock) return blockNavigationTarget(directBlock);

  const directStructural = directStructuralNavigationTarget(state, found.node, found.pos);
  if (directStructural) return directStructural;

  const $pos = state.doc.resolve(found.pos);
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    const pos = $pos.before(depth);
    const block = resolveScaffoldBlockContext(node, pos, blockDefinitions);
    if (block) return blockNavigationTarget(block);

    const kind = navigableStructuralOwnerKind(node.type.name);
    if (kind) return structuralNavigationTarget(kind, node, pos);
  }

  return null;
}

export function createAuthoringInteractionNavigationTransaction(
  state: EditorState,
  navigationTarget: AuthoringInteractionNavigationTarget,
): Transaction | null {
  const tr = state.tr;

  if (navigationTarget.activation === "compatibility-object") {
    return setObjectSelectionInTransaction(tr, navigationTarget.pos) ? tr : null;
  }

  const target = navigationTarget.target;
  if (!target) return null;
  return createInteractionTargetActivationTransaction(state, target, navigationTarget.activation);
}

export function resolveAuthoringInteractionNavigationFrame(
  root: ParentNode | Element | null | undefined,
  navigationTarget: AuthoringInteractionNavigationTarget,
): Element | null {
  const target = navigationTarget.target;
  if (!target) return resolveAuthoringFrameElement(root, navigationTarget.frame);

  if (target.kind === InteractionTargetKind.Block) {
    return resolveBlockChromeFrameElement(root, { blockId: target.id ?? null });
  }

  if (target.kind === InteractionTargetKind.Field) return null;
  return resolveStructuralChromeFrameElement(root, {
    id: target.id ?? null,
    kind: target.kind,
  });
}

function directStructuralNavigationTarget(
  state: EditorState,
  node: ProseMirrorNode,
  pos: number,
): AuthoringInteractionNavigationTarget | null {
  if (node.type.name === InteractionTargetKind.Section) {
    return parentStructuralNavigationTarget(state.doc.resolve(pos), InteractionTargetKind.Layout);
  }
  if (node.type.name === InteractionTargetKind.Cell) {
    return parentStructuralNavigationTarget(state.doc.resolve(pos), InteractionTargetKind.Grid);
  }

  const kind = navigableStructuralOwnerKind(node.type.name);
  return kind ? structuralNavigationTarget(kind, node, pos) : null;
}

function parentStructuralNavigationTarget(
  $pos: ResolvedPos,
  kind: StructuralInteractionTargetKind,
): AuthoringInteractionNavigationTarget | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);
    if (node.type.name !== kind) continue;
    return structuralNavigationTarget(kind, node, $pos.before(depth));
  }
  return null;
}

function blockNavigationTarget(block: ScaffoldBlockContext): AuthoringInteractionNavigationTarget {
  const target = projectBlockTargetRef(block);
  return {
    activation: "object",
    frame: { frameKind: AuthoringFrameKind.Block, id: target.id ?? "" },
    nodeSize: block.node.nodeSize,
    pos: block.pos,
    target,
  };
}

function structuralNavigationTarget(
  kind: StructuralInteractionTargetKind,
  node: ProseMirrorNode,
  pos: number,
): AuthoringInteractionNavigationTarget {
  const target = projectStructuralTargetRef({ kind, node, pos });
  return {
    activation: "structural",
    frame: { frameKind: kind, id: target.id ?? "" },
    nodeSize: node.nodeSize,
    pos,
    target,
  };
}

function navigableStructuralOwnerKind(nodeType: string): StructuralInteractionTargetKind | null {
  switch (nodeType) {
    case InteractionTargetKind.Grid:
    case InteractionTargetKind.Layout:
    case InteractionTargetKind.Region:
    case InteractionTargetKind.Surface:
      return nodeType;
    default:
      return null;
  }
}

function compatibilityFrameForNode(node: ProseMirrorNode): AuthoringFrameLocator | null {
  const id = node.attrs["id"];
  if (typeof id !== "string" || !id.trim()) return null;

  switch (node.type.name) {
    case "unavailable_block":
      return { frameKind: AuthoringFrameKind.Block, id };
    case "unavailable_layout":
      return { frameKind: AuthoringFrameKind.Layout, id };
    case "unavailable_surface":
      return { frameKind: AuthoringFrameKind.Surface, id };
    default:
      return null;
  }
}
