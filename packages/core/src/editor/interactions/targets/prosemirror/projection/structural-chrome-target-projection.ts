import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

import { builtInLayoutRegistry } from "@/editor/arrangements/layout/model/built-in-layout-definitions";
import type { RegisteredLayoutDefinition } from "@/editor/arrangements/layout/model/layout-definition";
import {
  AuthoringFrameKind,
  resolveAuthoringFrameElement,
} from "@/editor/interactions/dom/authoring-frame";

import {
  InteractionTargetKind,
  type InteractionOwnerSnapshot,
  type InteractionTargetRef,
} from "../../model/interaction-owner-state";
import type { InteractionChromeSlotName } from "./block-chrome-target-projection";
import {
  projectStructuralTargetRef,
  type StructuralInteractionTargetKind,
} from "./target-ref-projection";
import { findLiveDocumentNodeAtPos, resolveLiveDocumentPosition } from "./live-document-position";

/**
 * A structural target resolved against the live document for arrangement
 * chrome consumers: the canonical target ref plus the node and the parent /
 * definition facts each structural kind's menu content needs without
 * re-walking the document.
 */
interface StructuralChromeTargetDescriptorBase {
  id: string | null;
  kind: StructuralInteractionTargetKind;
  node: ProseMirrorNode;
  nodeType: string;
  pos: number;
  target: InteractionTargetRef;
  targetKey: string;
}

export interface GridChromeTargetDescriptor extends StructuralChromeTargetDescriptorBase {
  kind: typeof InteractionTargetKind.Grid;
}

export interface CellChromeTargetDescriptor extends StructuralChromeTargetDescriptorBase {
  cellId: string | null;
  cellIndex: number;
  gridId: string | null;
  gridNode: ProseMirrorNode;
  gridPos: number;
  kind: typeof InteractionTargetKind.Cell;
}

export interface LayoutChromeTargetDescriptor extends StructuralChromeTargetDescriptorBase {
  kind: typeof InteractionTargetKind.Layout;
  layoutDefinition: RegisteredLayoutDefinition | null;
}

export type LayoutSectionDefinitionFacts = NonNullable<RegisteredLayoutDefinition["section"]>;

export interface SectionChromeTargetDescriptor extends StructuralChromeTargetDescriptorBase {
  kind: typeof InteractionTargetKind.Section;
  layoutDefinition: RegisteredLayoutDefinition | null;
  layoutId: string | null;
  layoutNode: ProseMirrorNode;
  layoutPos: number;
  sectionDefinition: LayoutSectionDefinitionFacts | null;
  sectionId: string | null;
  sectionIndex: number;
}

export interface RegionChromeTargetDescriptor extends StructuralChromeTargetDescriptorBase {
  kind: typeof InteractionTargetKind.Region;
}

export interface SurfaceChromeTargetDescriptor extends StructuralChromeTargetDescriptorBase {
  kind: typeof InteractionTargetKind.Surface;
  variant: string | null;
}

export type StructuralChromeTargetDescriptor =
  | CellChromeTargetDescriptor
  | GridChromeTargetDescriptor
  | LayoutChromeTargetDescriptor
  | RegionChromeTargetDescriptor
  | SectionChromeTargetDescriptor
  | SurfaceChromeTargetDescriptor;

const FRAME_KIND_BY_STRUCTURAL_KIND: Readonly<
  Record<StructuralInteractionTargetKind, AuthoringFrameKind>
> = {
  [InteractionTargetKind.Cell]: AuthoringFrameKind.Cell,
  [InteractionTargetKind.Grid]: AuthoringFrameKind.Grid,
  [InteractionTargetKind.Layout]: AuthoringFrameKind.Layout,
  [InteractionTargetKind.Region]: AuthoringFrameKind.Region,
  [InteractionTargetKind.Section]: AuthoringFrameKind.Section,
  [InteractionTargetKind.Surface]: AuthoringFrameKind.Surface,
};

export function resolveStructuralChromeTargetDescriptor(
  state: EditorState,
  targetRef: InteractionTargetRef | null | undefined,
): StructuralChromeTargetDescriptor | null {
  if (!targetRef || !isStructuralTargetKind(targetRef.kind)) {
    return null;
  }

  const found = findLiveStructuralNode(state, targetRef, targetRef.kind);
  if (!found) return null;

  return descriptorFromLiveNode(state, targetRef.kind, found.node, found.pos);
}

export function resolveStructuralChromeTargetFromSnapshot(
  state: EditorState,
  snapshot: InteractionOwnerSnapshot,
  slotName: InteractionChromeSlotName,
): StructuralChromeTargetDescriptor | null {
  const slot = snapshot.chromeSlots[slotName];
  if (!slot.visible) return null;

  return resolveStructuralChromeTargetDescriptor(state, slot.target);
}

export function structuralChromeTargetKey(
  value:
    | Pick<StructuralChromeTargetDescriptorBase, "id" | "kind" | "nodeType" | "pos">
    | InteractionTargetRef,
): string {
  if ("nodeType" in value) {
    return `${value.kind}:${value.nodeType}:${value.pos}:${value.id ?? ""}`;
  }

  return `${value.kind}::${value.pos ?? ""}:${value.id ?? ""}`;
}

export function resolveStructuralChromeFrameElement(
  root: ParentNode | Element | null | undefined,
  descriptor: Pick<StructuralChromeTargetDescriptorBase, "id" | "kind"> | null | undefined,
): Element | null {
  if (!descriptor?.id) return null;

  return resolveAuthoringFrameElement(root, {
    frameKind: FRAME_KIND_BY_STRUCTURAL_KIND[descriptor.kind],
    id: descriptor.id,
  });
}

function descriptorFromLiveNode(
  state: EditorState,
  kind: StructuralInteractionTargetKind,
  node: ProseMirrorNode,
  pos: number,
): StructuralChromeTargetDescriptor | null {
  const base = descriptorBase(kind, node, pos);

  switch (kind) {
    case InteractionTargetKind.Cell: {
      const parent = resolveStructuralParent(state, pos, "grid");
      if (!parent) return null;
      return {
        ...base,
        cellId: base.id,
        cellIndex: parent.childIndex,
        gridId: readStableStringId(parent.node.attrs["id"]),
        gridNode: parent.node,
        gridPos: parent.pos,
        kind,
      };
    }

    case InteractionTargetKind.Section: {
      const parent = resolveStructuralParent(state, pos, "layout");
      if (!parent) return null;
      const layoutDefinition = builtInLayoutRegistry.getForNode(parent.node) ?? null;
      return {
        ...base,
        kind,
        layoutDefinition,
        layoutId: readStableStringId(parent.node.attrs["id"]),
        layoutNode: parent.node,
        layoutPos: parent.pos,
        sectionDefinition: layoutDefinition?.section ?? null,
        sectionId: base.id,
        sectionIndex: parent.childIndex,
      };
    }

    case InteractionTargetKind.Layout:
      return {
        ...base,
        kind,
        layoutDefinition: builtInLayoutRegistry.getForNode(node) ?? null,
      };

    case InteractionTargetKind.Surface:
      return {
        ...base,
        kind,
        variant: readStableStringId(node.attrs["variant"]),
      };

    case InteractionTargetKind.Grid:
    case InteractionTargetKind.Region:
      return { ...base, kind };
  }
}

function descriptorBase(
  kind: StructuralInteractionTargetKind,
  node: ProseMirrorNode,
  pos: number,
): StructuralChromeTargetDescriptorBase {
  const id = readStableStringId(node.attrs["id"]);

  return {
    id,
    kind,
    node,
    nodeType: node.type.name,
    pos,
    target: projectStructuralTargetRef({ kind, node, pos }),
    targetKey: structuralChromeTargetKey({
      id,
      kind,
      nodeType: node.type.name,
      pos,
    }),
  };
}

function resolveStructuralParent(
  state: EditorState,
  childPos: number,
  parentNodeType: string,
): { childIndex: number; node: ProseMirrorNode; pos: number } | null {
  const $pos = resolveLiveDocumentPosition(state, childPos);
  if (!$pos) return null;
  if ($pos.depth < 1) return null;

  const parent = $pos.parent;
  if (parent.type.name !== parentNodeType) return null;

  return {
    childIndex: $pos.index($pos.depth),
    node: parent,
    pos: $pos.before($pos.depth),
  };
}

function findLiveStructuralNode(
  state: EditorState,
  targetRef: InteractionTargetRef,
  kind: StructuralInteractionTargetKind,
): { node: ProseMirrorNode; pos: number } | null {
  if (Number.isInteger(targetRef.pos)) {
    const found = findLiveDocumentNodeAtPos(state, targetRef.pos as number);
    if (!found || found.node.type.name !== kind) return null;
    const { node, pos } = found;
    if (targetRef.id && node.attrs["id"] !== targetRef.id) return null;
    return { node, pos };
  }

  if (!targetRef.id) return null;

  return findStructuralNodeById(state, kind, targetRef.id);
}

function findStructuralNodeById(
  state: EditorState,
  kind: StructuralInteractionTargetKind,
  id: string,
): { node: ProseMirrorNode; pos: number } | null {
  let found: { node: ProseMirrorNode; pos: number } | null = null;

  state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === kind && node.attrs["id"] === id) {
      found = { node, pos };
      return false;
    }
    return true;
  });

  return found;
}

function isStructuralTargetKind(
  kind: InteractionTargetRef["kind"],
): kind is StructuralInteractionTargetKind {
  return kind !== InteractionTargetKind.Block && kind !== InteractionTargetKind.Field;
}

function readStableStringId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
