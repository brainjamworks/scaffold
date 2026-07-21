import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

import type { BlockDefinition } from "@/editor/blocks/block-definition";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  AuthoringFrameKind,
  resolveAuthoringFrameElement,
} from "@/editor/interactions/dom/authoring-frame";
import {
  resolveScaffoldBlockContext,
  type ScaffoldBlockContext,
} from "@/editor/selection/block-context";

import {
  InteractionTargetKind,
  type InteractionChromeSlots,
  type InteractionOwnerSnapshot,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import { findLiveDocumentNodeAtPos } from "./live-document-position";
import { projectBlockTargetRef } from "./target-ref-projection";

/** Definition-derived facts block chrome consumers branch on. */
export interface BlockChromeTargetCapabilities {
  supportsResize: boolean;
  supportsSettings: boolean;
}

/**
 * A block target resolved against the live document for chrome consumers:
 * the canonical target ref plus the node, registry definition, and derived
 * capability facts chrome needs without re-walking the document.
 */
export interface BlockChromeTargetDescriptor {
  blockId: string | null;
  capabilities: BlockChromeTargetCapabilities;
  definition: BlockDefinition;
  node: ProseMirrorNode;
  nodeType: string;
  pos: number;
  target: InteractionTargetRef;
  targetKey: string;
}

export type InteractionChromeSlotName = keyof InteractionChromeSlots;

export function resolveBlockChromeTargetDescriptor(
  state: EditorState,
  targetRef: InteractionTargetRef | null | undefined,
  blockDefinitions: BlockDefinitionLookup,
): BlockChromeTargetDescriptor | null {
  if (!targetRef || targetRef.kind !== InteractionTargetKind.Block) {
    return null;
  }

  const found = findLiveBlockNode(state, targetRef);
  if (!found) return null;

  const blockContext = resolveScaffoldBlockContext(found.node, found.pos, blockDefinitions);
  if (!blockContext) return null;

  return descriptorFromBlockContext(blockContext);
}

export function resolveBlockChromeTargetFromSnapshot(
  state: EditorState,
  snapshot: InteractionOwnerSnapshot,
  slotName: InteractionChromeSlotName,
  blockDefinitions: BlockDefinitionLookup,
): BlockChromeTargetDescriptor | null {
  const slot = snapshot.chromeSlots[slotName];
  if (!slot.visible) return null;

  return resolveBlockChromeTargetDescriptor(state, slot.target, blockDefinitions);
}

export function blockChromeTargetKey(
  value: Pick<BlockChromeTargetDescriptor, "blockId" | "nodeType" | "pos"> | InteractionTargetRef,
): string {
  if ("nodeType" in value) {
    return `block:${value.nodeType}:${value.pos}:${value.blockId ?? ""}`;
  }

  return `block::${value.pos ?? ""}:${value.id ?? ""}`;
}

export function resolveBlockChromeFrameElement(
  root: ParentNode | Element | null | undefined,
  descriptor: Pick<BlockChromeTargetDescriptor, "blockId"> | null | undefined,
): Element | null {
  if (!descriptor?.blockId) return null;

  return resolveAuthoringFrameElement(root, {
    frameKind: AuthoringFrameKind.Block,
    id: descriptor.blockId,
  });
}

function descriptorFromBlockContext(
  blockContext: ScaffoldBlockContext,
): BlockChromeTargetDescriptor {
  const blockId = readStableStringId(blockContext.node.attrs?.["id"]);
  const descriptorFacts = {
    blockId,
    nodeType: blockContext.nodeType,
    pos: blockContext.pos,
  };

  return {
    ...descriptorFacts,
    capabilities: {
      supportsResize: blockContext.definition.frame?.resizable === true,
      supportsSettings: Boolean(blockContext.definition.settingsSheet),
    },
    definition: blockContext.definition,
    node: blockContext.node,
    target: projectBlockTargetRef(blockContext),
    targetKey: blockChromeTargetKey(descriptorFacts),
  };
}

function findLiveBlockNode(
  state: EditorState,
  targetRef: InteractionTargetRef,
): { node: ProseMirrorNode; pos: number } | null {
  if (Number.isInteger(targetRef.pos)) {
    const found = findLiveDocumentNodeAtPos(state, targetRef.pos as number);
    if (!found) return null;
    const { node, pos } = found;
    if (targetRef.id && node.attrs["id"] !== targetRef.id) return null;
    return { node, pos };
  }

  if (!targetRef.id) return null;

  return findNodeById(state, targetRef.id);
}

function findNodeById(
  state: EditorState,
  id: string,
): { node: ProseMirrorNode; pos: number } | null {
  let found: { node: ProseMirrorNode; pos: number } | null = null;

  state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.attrs["id"] === id) {
      found = { node, pos };
      return false;
    }
    return true;
  });

  return found;
}

function readStableStringId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
