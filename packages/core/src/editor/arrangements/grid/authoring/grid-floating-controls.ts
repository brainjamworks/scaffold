import {
  DotsThreeIcon as DotsThree,
  DotsThreeVerticalIcon as DotsThreeVertical,
  PlusIcon as Plus,
} from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";

import { builtInBlockRegistry } from "@/editor/blocks/built-in-block-definitions";
import type { BlockDefinitionLookup } from "@/editor/blocks/block-registry";
import type {
  FloatingControl,
  FloatingTargetState,
} from "@/editor/shell/authoring/floating/floating-control";
import { InteractionTargetKind } from "@/editor/interactions/targets/model/interaction-owner-state";

import { createGridMenuAnchorId } from "./grid-menu-target";
import { resolveActiveGridChromeContext, type ActiveGridChromeContext } from "./grid-chrome-state";
import { addGridCellAtEnd } from "../model/grid-commands";
import { MAX_GRID_COLUMNS } from "../model/grid-model";

const FLOATING_TRIGGER_CLASS = "sc-floating-control-trigger";

export function createGridFloatingAuthoringControls(blockDefinitions: BlockDefinitionLookup) {
  const gridMenuFloatingControl: FloatingControl = {
    alignment: "centered-on-point",
    className: `${FLOATING_TRIGGER_CLASS} sc-floating-grid-menu-trigger`,
    dataAttributes: {
      "data-grid-menu-trigger": "",
    },
    icon: DotsThreeVertical,
    label: "Grid options",
    open: ({ commands, state }) => {
      if (state.target.kind !== InteractionTargetKind.Grid) return false;
      return commands.toggleMenu(state.target);
    },
    placement: "middle-left",
    resolveState: (editor) => {
      const context = resolveActiveGridChromeContext(editor.state, blockDefinitions);
      if (!context) return null;

      const anchorId = createGridMenuAnchorId("grid-menu", context.grid.id);
      return createFloatingTargetState({
        anchorId,
        key: ["grid-menu", context.grid.pos, context.grid.id ?? "", anchorId ?? ""].join(":"),
        pos: context.grid.pos,
        target: context.grid.target,
      });
    },
  };

  const gridAddColumnFloatingControl: FloatingControl = {
    alignment: "centered-on-point",
    className: `${FLOATING_TRIGGER_CLASS} sc-floating-grid-add-column-trigger`,
    dataAttributes: {
      "data-grid-add-cell-end": "",
    },
    icon: Plus,
    label: "Add column",
    open: ({ commands, editor, state }) => {
      if (state.disabled) return false;
      if (state.target.kind !== InteractionTargetKind.Grid) return false;
      if (!Number.isInteger(state.target.pos)) return false;
      if (!addGridCellAtEnd(editor, state.target.pos as number)) return false;

      return commands.openMenu(state.target);
    },
    placement: "middle-right",
    resolveState: (editor) => {
      const context = resolveActiveGridChromeContext(editor.state, blockDefinitions);
      if (!context) return null;

      const anchorId = createGridMenuAnchorId("grid-add-end", context.grid.id);
      return createFloatingTargetState({
        anchorId,
        disabled: context.grid.node.childCount >= MAX_GRID_COLUMNS,
        key: ["grid-add-end", context.grid.pos, context.grid.id ?? "", anchorId ?? ""].join(":"),
        pos: context.grid.pos,
        target: context.grid.target,
      });
    },
  };

  const gridCellMenuFloatingControl: FloatingControl = {
    alignment: "centered-on-point",
    className: `${FLOATING_TRIGGER_CLASS} sc-floating-grid-cell-menu-trigger`,
    dataAttributes: {
      "data-grid-cell-menu-trigger": "",
    },
    icon: DotsThree,
    label: "Cell options",
    open: ({ commands, state }) => {
      if (state.target.kind !== InteractionTargetKind.Cell) return false;
      return commands.toggleMenu(state.target);
    },
    placement: "top-center",
    resolveState: (editor) => {
      const cell = resolveActiveCellDescriptor(editor, blockDefinitions);
      if (!cell) return null;

      const anchorId = createGridMenuAnchorId("cell-menu", cell.id);
      return createFloatingTargetState({
        anchorId,
        key: ["cell-menu", cell.gridPos, cell.pos, cell.id ?? "", anchorId ?? ""].join(":"),
        pos: cell.pos,
        target: cell.target,
      });
    },
  };

  return [
    gridMenuFloatingControl,
    gridAddColumnFloatingControl,
    gridCellMenuFloatingControl,
  ] as const;
}

export const GRID_FLOATING_AUTHORING_CONTROLS =
  createGridFloatingAuthoringControls(builtInBlockRegistry);

function resolveActiveCellDescriptor(
  editor: Editor,
  blockDefinitions: BlockDefinitionLookup,
): ActiveGridChromeContext["cell"] {
  return resolveActiveGridChromeContext(editor.state, blockDefinitions)?.cell ?? null;
}

function createFloatingTargetState(state: FloatingTargetState): FloatingTargetState {
  return state;
}
