import { Extension } from "@tiptap/core";

import {
  CourseTableAuthoringCellNode,
  CourseTableAuthoringHeaderNode,
  CourseTableAuthoringNode,
  CourseTableAuthoringRowNode,
} from "./authoring-extensions";

import "./Table.css";

export const TableAuthoringExtension = Extension.create({
  name: "table_authoring_bundle",

  addExtensions() {
    return [
      CourseTableAuthoringRowNode,
      CourseTableAuthoringHeaderNode,
      CourseTableAuthoringCellNode,
      CourseTableAuthoringNode,
    ];
  },
});
