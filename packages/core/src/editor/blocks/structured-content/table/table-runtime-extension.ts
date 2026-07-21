import { Extension } from "@tiptap/core";

import {
  CourseTableCellNode,
  CourseTableHeaderNode,
  CourseTableNode,
  CourseTableRowNode,
} from "./extensions";

import "./Table.css";

export const TableRuntimeExtension = Extension.create({
  name: "table_runtime_bundle",

  addExtensions() {
    return [CourseTableRowNode, CourseTableHeaderNode, CourseTableCellNode, CourseTableNode];
  },
});
