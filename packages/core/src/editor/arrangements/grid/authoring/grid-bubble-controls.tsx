import {
  ColumnsPlusLeftIcon as ColumnsPlusLeft,
  ColumnsPlusRightIcon as ColumnsPlusRight,
  TrashIcon as Trash,
} from "@phosphor-icons/react";
import type { Editor } from "@tiptap/react";

import {
  MenuControls,
  MenuSeparator,
} from "@/editor/shell/bubbles/interaction/menu-controls/MenuControls";
import {
  InteractionTargetKind,
  type InteractionTargetRef,
} from "@/editor/interactions/targets/model/interaction-owner-state";
import { useInteractionCommands } from "@/editor/interactions/targets/facade/interaction-provider";
import type { InteractionCommands } from "@/editor/interactions/targets/facade/interaction-store";
import type {
  CellChromeTargetDescriptor,
  GridChromeTargetDescriptor,
  StructuralChromeTargetDescriptor,
} from "@/editor/interactions/targets/prosemirror/projection/structural-chrome-target-projection";
import type {
  StructuralInteractionBubbleRenderer,
  StructuralInteractionBubbleRendererBinding,
} from "@/editor/interactions/interaction-bubble";

import {
  addGridCellAt,
  deleteGridAt,
  deleteGridCellAt,
  setGridCellCountAt,
} from "../model/grid-commands";
import {
  MAX_GRID_COLUMNS,
  MIN_AUTHORED_GRID_COLUMNS,
  type GridCellSide,
} from "../model/grid-model";
import { gridCellPositionAt } from "./grid-menu-target";

export type GridMenuSnapshot =
  | {
      kind: "grid";
      gridId: string | null;
      gridPos: number;
      cellCount: number;
      cellCountOptions: ReturnType<typeof createCellCountOptions>;
    }
  | {
      kind: "cell";
      gridId: string | null;
      gridPos: number;
      cellIndex: number;
      cellCount: number;
    };

export function resolveGridMenuSnapshot(
  descriptor: StructuralChromeTargetDescriptor | null | undefined,
): GridMenuSnapshot | null {
  if (descriptor?.kind === InteractionTargetKind.Grid) {
    return gridMenuSnapshotFromGrid(descriptor);
  }
  if (descriptor?.kind === InteractionTargetKind.Cell) {
    return cellMenuSnapshotFromCell(descriptor);
  }
  return null;
}

export function GridMenuBubbleContent({
  editor,
  snapshot,
}: {
  editor: Editor;
  snapshot: GridMenuSnapshot | null;
}) {
  if (!snapshot) return null;

  return (
    <>
      {snapshot.kind === "cell" ? (
        <CellMenuControls editor={editor} snapshot={snapshot} />
      ) : (
        <GridMenuControls editor={editor} snapshot={snapshot} />
      )}
    </>
  );
}

function CellMenuControls({
  editor,
  snapshot,
}: {
  editor: Editor;
  snapshot: Extract<GridMenuSnapshot, { kind: "cell" }>;
}) {
  const commands = useInteractionCommands();

  const addCell = (side: GridCellSide) => {
    const added = addGridCellAt(editor, snapshot.gridPos, snapshot.cellIndex, side);
    if (!added) return;

    openCellMenu(
      editor,
      commands,
      snapshot.gridPos,
      side === "left" ? snapshot.cellIndex : snapshot.cellIndex + 1,
    );
  };

  const deleteCell = () => {
    const previousCellCount = snapshot.cellCount;
    const deleted = deleteGridCellAt(editor, snapshot.gridPos, snapshot.cellIndex);
    if (!deleted) return;

    if (previousCellCount === MIN_AUTHORED_GRID_COLUMNS) {
      commands.dismissInteraction();
      return;
    }

    openGridMenu(editor, commands, snapshot.gridPos);
  };

  return (
    <>
      <MenuControls
        controls={[
          {
            kind: "action",
            id: "addCellLeft",
            label: "Add column left",
            icon: ColumnsPlusLeft,
            presentation: "icon-only",
            run: () => addCell("left"),
          },
          {
            kind: "action",
            id: "addCellRight",
            label: "Add column right",
            icon: ColumnsPlusRight,
            presentation: "icon-only",
            run: () => addCell("right"),
          },
        ]}
      />
      <MenuSeparator />
      <MenuControls
        controls={[
          {
            kind: "action",
            id: "deleteCell",
            label: "Delete cell",
            icon: Trash,
            presentation: "icon-only",
            destructive: true,
            title: "Delete cell and contents",
            run: deleteCell,
          },
        ]}
      />
    </>
  );
}

function GridMenuControls({
  editor,
  snapshot,
}: {
  editor: Editor;
  snapshot: Extract<GridMenuSnapshot, { kind: "grid" }>;
}) {
  const commands = useInteractionCommands();

  const deleteGrid = () => {
    if (!deleteGridAt(editor, snapshot.gridPos)) return;
    commands.dismissInteraction();
  };

  const updateValue = (name: string, next: unknown) => {
    if (name === "cellCount" && typeof next === "string") {
      const nextCount = Number.parseInt(next, 10);
      if (!Number.isInteger(nextCount)) return false;
      if (!setGridCellCountAt(editor, snapshot.gridPos, nextCount)) {
        return false;
      }

      openGridMenu(editor, commands, snapshot.gridPos);
      return true;
    }

    return false;
  };

  return (
    <>
      <MenuControls
        controls={[
          {
            kind: "select",
            name: "cellCount",
            label: "Grid cells",
            options: snapshot.cellCountOptions,
          },
        ]}
        value={{ cellCount: String(snapshot.cellCount) }}
        onValueChange={updateValue}
      />
      <MenuSeparator />
      <MenuControls
        controls={[
          {
            kind: "action",
            id: "deleteGrid",
            label: "Delete grid",
            icon: Trash,
            presentation: "icon-only",
            destructive: true,
            title: "Delete grid and contents",
            run: deleteGrid,
          },
        ]}
      />
    </>
  );
}

function gridMenuSnapshotFromGrid(descriptor: GridChromeTargetDescriptor): GridMenuSnapshot {
  return {
    kind: "grid",
    gridId: descriptor.id,
    gridPos: descriptor.pos,
    cellCount: descriptor.node.childCount,
    cellCountOptions: createCellCountOptions(),
  };
}

function cellMenuSnapshotFromCell(descriptor: CellChromeTargetDescriptor): GridMenuSnapshot {
  return {
    kind: "cell",
    gridId: descriptor.gridId,
    gridPos: descriptor.gridPos,
    cellIndex: descriptor.cellIndex,
    cellCount: descriptor.gridNode.childCount,
  };
}

function openGridMenu(editor: Editor, commands: InteractionCommands, gridPos: number): boolean {
  const target = liveGridTargetRef(editor, gridPos);
  return target ? commands.openMenu(target) : false;
}

function openCellMenu(
  editor: Editor,
  commands: InteractionCommands,
  gridPos: number,
  cellIndex: number,
): boolean {
  const cellPos = gridCellPositionAt(editor.state.doc, gridPos, cellIndex);
  if (cellPos === null) return false;

  const cell = editor.state.doc.nodeAt(cellPos);
  if (!cell || cell.type.name !== "cell") return false;
  const cellId = readStableStringId(cell.attrs["id"]);

  return commands.openMenu({
    ...(cellId ? { id: cellId } : {}),
    kind: InteractionTargetKind.Cell,
    pos: cellPos,
  });
}

function liveGridTargetRef(editor: Editor, gridPos: number): InteractionTargetRef | null {
  const grid = editor.state.doc.nodeAt(gridPos);
  if (!grid || grid.type.name !== "grid") return null;
  const gridId = readStableStringId(grid.attrs["id"]);

  return {
    ...(gridId ? { id: gridId } : {}),
    kind: InteractionTargetKind.Grid,
    pos: gridPos,
  };
}

function createCellCountOptions() {
  return Array.from({ length: MAX_GRID_COLUMNS - MIN_AUTHORED_GRID_COLUMNS + 1 }, (_, index) => {
    const cellCount = MIN_AUTHORED_GRID_COLUMNS + index;
    return {
      value: String(cellCount),
      label: `${cellCount} cells`,
      disabled: !canSetGridCellCount(cellCount),
    };
  });
}

function canSetGridCellCount(cellCount: number): boolean {
  return cellCount >= MIN_AUTHORED_GRID_COLUMNS && cellCount <= MAX_GRID_COLUMNS;
}

function readStableStringId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const gridMenuRenderer: StructuralInteractionBubbleRenderer = ({ descriptor, editor }) => {
  const snapshot = resolveGridMenuSnapshot(descriptor);
  if (!snapshot) return null;
  return <GridMenuBubbleContent editor={editor} snapshot={snapshot} />;
};

export const gridStructuralInteractionBubbleRendererBindings = Object.freeze([
  Object.freeze({
    kind: InteractionTargetKind.Grid,
    renderer: gridMenuRenderer,
  }),
  Object.freeze({
    kind: InteractionTargetKind.Cell,
    renderer: gridMenuRenderer,
  }),
] satisfies readonly StructuralInteractionBubbleRendererBinding[]);
