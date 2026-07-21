import {
  ArrowsMergeIcon as Merge,
  ArrowsSplitIcon as Split,
  ColumnsIcon as Columns,
  ColumnsPlusRightIcon as AddColumn,
  RowsIcon as Rows,
  RowsPlusBottomIcon as AddRow,
  TableIcon as TableIconNode,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";

import { createStableId } from "@/document/model/identity/stable-ids";
import {
  defineBlock,
  type BlockAuthoringControlsInput,
  type BlockAuthoringMenuControlDescriptor,
} from "@/editor/blocks/block-definition";

export const TABLE_BLOCK_ID = "table";

const HEADER_LABELS = ["Column 1", "Column 2", "Column 3"];
const BODY_ROWS = 2;
const COLS = 3;

function paragraph(text?: string) {
  return {
    type: "paragraph",
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}

function headerCell(text: string) {
  return {
    type: "tableHeader",
    content: [paragraph(text)],
  };
}

function bodyCell() {
  return {
    type: "tableCell",
    content: [paragraph()],
  };
}

function defaultTable() {
  const headerRow = {
    type: "tableRow",
    content: HEADER_LABELS.map((label) => headerCell(label)),
  };
  const bodyRows = Array.from({ length: BODY_ROWS }, () => ({
    type: "tableRow",
    content: Array.from({ length: COLS }, () => bodyCell()),
  }));
  return {
    type: "table",
    attrs: { id: createStableId() },
    content: [headerRow, ...bodyRows],
  };
}

function tableAuthoringControls({
  editor,
}: BlockAuthoringControlsInput): readonly BlockAuthoringMenuControlDescriptor[] {
  const inTable = isSelectionInsideTable(editor);

  return [
    tableAction({
      editor,
      disabled: !inTable,
      icon: AddRow,
      id: "add-row-after",
      label: "Add row",
      run: () => editor.chain().focus().addRowAfter().run(),
    }),
    tableAction({
      editor,
      disabled: !inTable,
      icon: AddColumn,
      id: "add-column-after",
      label: "Add column",
      run: () => editor.chain().focus().addColumnAfter().run(),
    }),
    tableAction({
      destructive: true,
      editor,
      disabled: !inTable,
      icon: Rows,
      id: "delete-row",
      label: "Delete row",
      run: () => editor.chain().focus().deleteRow().run(),
    }),
    tableAction({
      destructive: true,
      editor,
      disabled: !inTable,
      icon: Columns,
      id: "delete-column",
      label: "Delete column",
      run: () => editor.chain().focus().deleteColumn().run(),
    }),
    tableAction({
      editor,
      disabled: !inTable,
      icon: Rows,
      id: "toggle-header-row",
      label: "Toggle header row",
      run: () => editor.chain().focus().toggleHeaderRow().run(),
    }),
    tableAction({
      editor,
      disabled: !inTable || !editor.can().mergeCells(),
      icon: Merge,
      id: "merge-cells",
      label: "Merge cells",
      run: () => editor.chain().focus().mergeCells().run(),
    }),
    tableAction({
      editor,
      disabled: !inTable || !editor.can().splitCell(),
      icon: Split,
      id: "split-cell",
      label: "Split cell",
      run: () => editor.chain().focus().splitCell().run(),
    }),
  ];
}

function tableAction({
  destructive = false,
  disabled,
  editor,
  icon,
  id,
  label,
  run,
}: {
  destructive?: boolean;
  disabled: boolean;
  editor: BlockAuthoringControlsInput["editor"];
  icon: Icon;
  id: string;
  label: string;
  run: () => boolean;
}): BlockAuthoringMenuControlDescriptor {
  return {
    kind: "action",
    id: `table:${id}`,
    label,
    icon,
    presentation: "icon-only",
    ...(destructive ? { destructive: true } : {}),
    disabled,
    run: () => {
      if (disabled || editor.isDestroyed) return;
      run();
    },
  };
}

function isSelectionInsideTable(editor: BlockAuthoringControlsInput["editor"]): boolean {
  const { $from, $to } = editor.state.selection;
  return positionIsInsideTable($from) && positionIsInsideTable($to);
}

function positionIsInsideTable(
  $pos: BlockAuthoringControlsInput["editor"]["state"]["selection"]["$from"],
): boolean {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === "table") return true;
  }

  return false;
}

export const tableBlockDefinition = defineBlock({
  nodeType: "table",
  authoringControls: {
    controls: tableAuthoringControls,
  },
  frame: {
    resizable: true,
    resizeMode: "responsive",
  },
  placeholders: {
    tableCell: "",
    tableHeader: "",
  },
  insert: {
    id: TABLE_BLOCK_ID,
    category: "data",
    title: "Table",
    description: "Insert a data table with resizable columns",
    icon: TableIconNode,
    keywords: ["table", "grid", "data", "tabular", "spreadsheet"],
    content: defaultTable,
  },
});
