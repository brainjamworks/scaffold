/**
 * Tiptap's table family (Table + TableRow + TableCell + TableHeader)
 * wraps the canonical ProseMirror-tables implementation: column
 * resize, header detection, cell merging, navigation. We extend each
 * node minimally to put the parent table into the course-block group
 * and let cells host rich text content (paragraphs, headings, etc.).
 *
 * The table is loaded through the normal authoring/runtime block extension
 * arrays, but keeps Tiptap's own TableView so ProseMirror owns the editable
 * table DOM. Authoring frame decorations are layered by the authoring
 * extension, not by this runtime extension set.
 */

import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import type { Plugin } from "@tiptap/pm/state";

import { stableNodeIdAttribute } from "@/document/model/identity/stable-node-attribute";
import {
  COURSE_BLOCK_CONTENT,
  textContentExpression,
} from "@/document/model/content-model/content-groups";

const CELL_CONTENT = textContentExpression();

interface CourseTableNodeOptions {
  tableAttributes?: (htmlAttributes: Record<string, unknown>) => Record<string, string>;
  proseMirrorPlugins?: (tableNodeName: string) => Plugin[];
}

interface CourseTableCellOptions {
  editableAttribute?: string;
}

export function createCourseTableNode(options: CourseTableNodeOptions = {}) {
  return Table.configure({
    resizable: true,
    HTMLAttributes: {
      class: "sc-table",
    },
    // Default size when inserting a new table from a command.
    cellMinWidth: 80,
  }).extend({
    group: `block ${COURSE_BLOCK_CONTENT}`,

    addAttributes() {
      return {
        ...(this.parent?.() ?? {}),
        id: stableNodeIdAttribute(),
      };
    },

    parseHTML() {
      return [{ tag: 'table[data-node="table"]' }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "table",
        {
          ...HTMLAttributes,
          class: ["sc-table", HTMLAttributes.class].filter(Boolean).join(" "),
          ...(options.tableAttributes?.(HTMLAttributes) ?? {}),
        },
        ["tbody", 0],
      ];
    },

    ...(options.proseMirrorPlugins
      ? {
          addProseMirrorPlugins() {
            return options.proseMirrorPlugins!(this.name);
          },
        }
      : {}),
  });
}

export const CourseTableNode = createCourseTableNode();

export const CourseTableRowNode = TableRow;

export function createCourseTableCellNode(options: CourseTableCellOptions = {}) {
  return TableCell.extend({
    content: CELL_CONTENT,

    renderHTML({ HTMLAttributes }) {
      return [
        "td",
        {
          ...HTMLAttributes,
          ...(options.editableAttribute ? { [options.editableAttribute]: "" } : {}),
        },
        0,
      ];
    },
  });
}

export const CourseTableCellNode = createCourseTableCellNode();

export function createCourseTableHeaderNode(options: CourseTableCellOptions = {}) {
  return TableHeader.extend({
    content: CELL_CONTENT,

    renderHTML({ HTMLAttributes }) {
      return [
        "th",
        {
          ...HTMLAttributes,
          ...(options.editableAttribute ? { [options.editableAttribute]: "" } : {}),
        },
        0,
      ];
    },
  });
}

export const CourseTableHeaderNode = createCourseTableHeaderNode();
