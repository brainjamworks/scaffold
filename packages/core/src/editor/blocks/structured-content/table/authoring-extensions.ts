import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import {
  AUTHORING_FRAME_EDITABLE_ATTR,
  courseBlockAuthoringFrameAttributes,
} from "@/editor/interactions/dom/authoring-frame";

import {
  CourseTableRowNode,
  createCourseTableCellNode,
  createCourseTableHeaderNode,
  createCourseTableNode,
} from "./extensions";

export const CourseTableAuthoringNode = createCourseTableNode({
  tableAttributes: (HTMLAttributes) =>
    courseBlockAuthoringFrameAttributes({
      blockId: HTMLAttributes["data-id"],
      nodeType: "table",
    }),
  proseMirrorPlugins: (tableNodeName) => [
    new Plugin({
      props: {
        decorations: (state) => {
          const decorations: Decoration[] = [];

          state.doc.descendants((node, pos) => {
            if (node.type.name !== tableNodeName) return true;

            decorations.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: "sc-table",
                ...courseBlockAuthoringFrameAttributes({
                  blockId: node.attrs["id"],
                  nodeType: "table",
                }),
              }),
            );

            return false;
          });

          return DecorationSet.create(state.doc, decorations);
        },
      },
    }),
  ],
});

export const CourseTableAuthoringRowNode = CourseTableRowNode;

export const CourseTableAuthoringCellNode = createCourseTableCellNode({
  editableAttribute: AUTHORING_FRAME_EDITABLE_ATTR,
});

export const CourseTableAuthoringHeaderNode = createCourseTableHeaderNode({
  editableAttribute: AUTHORING_FRAME_EDITABLE_ATTR,
});
