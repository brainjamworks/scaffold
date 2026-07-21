import type { EditorState } from "@tiptap/pm/state";

import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import {
  InteractionTargetKind,
  type InteractionOwnerSnapshot,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { publishInteractionOwnerSnapshot } from "@/editor/interactions/targets/prosemirror/facade/interaction-owner-snapshot-publisher";
import {
  resolveStructuralChromeTargetDescriptor,
  type CellChromeTargetDescriptor,
  type GridChromeTargetDescriptor,
  type StructuralChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import { isValidDocPos } from "@/editor/prosemirror/position/document-position";

export interface GridChromeState {
  cellChromeIndex: number | null;
  outlineActive: boolean;
  showGridLevelTriggers: boolean;
}

export interface ResolveGridChromeStateOptions {
  selectionActive?: boolean;
}

/**
 * The grid whose chrome owns the moment plus the active cell inside it,
 * resolved from v2 owners: menu/explicit structural owners win, selection
 * context is the fallback, and a registered block owning the selection
 * keeps grid context without cell-level chrome.
 */
export interface ActiveGridChromeContext {
  cell: CellChromeTargetDescriptor | null;
  grid: GridChromeTargetDescriptor;
}

export function resolveActiveGridChromeContext(
  state: EditorState,
  blockDefinitions: BlockDefinitionLookup,
  snapshot: InteractionOwnerSnapshot = publishInteractionOwnerSnapshot(state, null, {
    blockDefinitions,
  }),
): ActiveGridChromeContext | null {
  const owners = snapshot.owners;
  const ownerRef = owners.menuOwner.target ?? owners.explicitOwner.target;
  const ownerDescriptor = isGridScopedRef(ownerRef)
    ? resolveStructuralChromeTargetDescriptor(state, ownerRef)
    : null;

  const grid = resolveActiveGridDescriptor(state, snapshot, ownerDescriptor);
  if (!grid) return null;

  if (ownerDescriptor?.kind === InteractionTargetKind.Cell) {
    return { cell: ownerDescriptor, grid };
  }

  return {
    cell: resolveSelectionContextCell(state, snapshot, grid),
    grid,
  };
}

function resolveActiveGridDescriptor(
  state: EditorState,
  snapshot: InteractionOwnerSnapshot,
  ownerDescriptor: StructuralChromeTargetDescriptor | null,
): GridChromeTargetDescriptor | null {
  if (ownerDescriptor?.kind === InteractionTargetKind.Grid) {
    return ownerDescriptor;
  }
  if (ownerDescriptor?.kind === InteractionTargetKind.Cell) {
    return resolveGridDescriptorAt(state, ownerDescriptor.gridPos);
  }

  const contextGridRef = snapshot.owners.contextOwners.grid;
  return contextGridRef ? resolveGridDescriptorFromRef(state, contextGridRef) : null;
}

function resolveSelectionContextCell(
  state: EditorState,
  snapshot: InteractionOwnerSnapshot,
  grid: GridChromeTargetDescriptor,
): CellChromeTargetDescriptor | null {
  const owners = snapshot.owners;

  if (owners.selectionOwner.target?.kind === InteractionTargetKind.Block) {
    return null;
  }

  const contextCellRef = owners.contextOwners.cell;
  const cell = contextCellRef
    ? resolveStructuralChromeTargetDescriptor(state, contextCellRef)
    : null;

  return cell?.kind === InteractionTargetKind.Cell && cell.gridPos === grid.pos ? cell : null;
}

export function resolveGridChromeState(
  state: EditorState,
  gridPos: number | null,
  blockDefinitions: BlockDefinitionLookup,
  options: ResolveGridChromeStateOptions = {},
): GridChromeState {
  if (gridPos === null) return inactiveGridChromeState();
  if (!isValidDocPos(state.doc, gridPos)) return inactiveGridChromeState();

  const grid = state.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") {
    return inactiveGridChromeState();
  }

  const context = resolveActiveGridChromeContext(state, blockDefinitions);
  if (!context || context.grid.pos !== gridPos) {
    return inactiveGridChromeState();
  }

  const selectionActive = options.selectionActive ?? true;

  return {
    cellChromeIndex: context.cell?.cellIndex ?? null,
    outlineActive: selectionActive,
    showGridLevelTriggers: true,
  };
}

export function isGridCellChromeActive(
  state: EditorState,
  cellPos: number | null,
  blockDefinitions: BlockDefinitionLookup,
): boolean {
  if (cellPos === null) return false;

  const context = resolveActiveGridChromeContext(state, blockDefinitions);
  return Boolean(context?.cell && context.cell.pos === cellPos);
}

function inactiveGridChromeState(): GridChromeState {
  return {
    cellChromeIndex: null,
    outlineActive: false,
    showGridLevelTriggers: false,
  };
}

function isGridScopedRef(ref: InteractionTargetRef | null): ref is InteractionTargetRef {
  return ref?.kind === InteractionTargetKind.Cell || ref?.kind === InteractionTargetKind.Grid;
}

function resolveGridDescriptorAt(
  state: EditorState,
  gridPos: number,
): GridChromeTargetDescriptor | null {
  const descriptor = resolveStructuralChromeTargetDescriptor(state, {
    kind: InteractionTargetKind.Grid,
    pos: gridPos,
  });
  return descriptor?.kind === InteractionTargetKind.Grid ? descriptor : null;
}

function resolveGridDescriptorFromRef(
  state: EditorState,
  ref: InteractionTargetRef,
): GridChromeTargetDescriptor | null {
  const descriptor = resolveStructuralChromeTargetDescriptor(state, ref);
  return descriptor?.kind === InteractionTargetKind.Grid ? descriptor : null;
}
