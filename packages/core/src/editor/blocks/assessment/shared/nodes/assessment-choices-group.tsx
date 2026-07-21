import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditorState,
  type NodeViewProps,
} from "@tiptap/react";

import { BlockAddGhost } from "@/editor/suggestions/insert/BlockAddGhost";
import { createStableId } from "@/document/model/identity/stable-ids";

import { currentNodeViewPos } from "@/editor/prosemirror/position/node-view-position";
import "./assessment-choices-group.css";

/**
 * Container for an assessment block's selectable_choice children.
 *
 * Author: a transparent flex stack of choices + an "+ Add choice"
 * ghost row at the bottom matching the dimensions of a real choice
 * row.
 * Runtime uses `AssessmentChoicesGroupRuntimeNode`.
 *
 * Groupless — only valid where another node's content expression
 * names it.
 */
export const AssessmentChoicesGroupNode = Node.create({
  name: "assessment_choices_group",
  content: "selectable_choice+",
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-choices-group"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-assessment-bounded-scroll-frame": "",
        "data-slot": "assessment-choices-group",
      }),
      ["div", { "data-assessment-bounded-scroll": "", class: "sc-assessment-choices-scroll" }, 0],
      [
        "div",
        { "data-assessment-bounded-scroll-hint": "", "aria-hidden": "true" },
        "Scroll for more ↓",
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentChoicesGroupNodeView);
  },
});

function AssessmentChoicesGroupNodeView(props: NodeViewProps) {
  const isEditable = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => editor.isEditable,
  });

  const addChoice = () => {
    const currentPos = currentNodeViewPos(props.editor, props.getPos, "assessment_choices_group");
    if (currentPos === null) return;
    const currentNode = props.editor.state.doc.nodeAt(currentPos);
    if (!currentNode || currentNode.type.name !== "assessment_choices_group") return;
    const insertAt = currentPos + currentNode.nodeSize - 1;
    props.editor
      .chain()
      .focus()
      .insertContentAt(insertAt, {
        type: "selectable_choice",
        attrs: { id: createStableId() },
        content: [
          {
            type: "selectable_choice_body",
            content: [{ type: "paragraph" }],
          },
        ],
      })
      .run();
  };

  return (
    <NodeViewWrapper
      data-assessment-bounded-scroll-frame=""
      data-slot="assessment-choices-group"
      className="sc-assessment-choices-group"
    >
      <div data-assessment-bounded-scroll="" className="sc-assessment-choices-scroll">
        <NodeViewContent />
        {isEditable ? (
          <BlockAddGhost
            label="Add choice"
            presentation="pill"
            contentEditable={false}
            onClick={addChoice}
            className="sc-assessment-choices-add"
          />
        ) : null}
      </div>
      <BoundedScrollHint />
    </NodeViewWrapper>
  );
}

function BoundedScrollHint() {
  return (
    <div data-assessment-bounded-scroll-hint="" contentEditable={false} aria-hidden="true">
      Scroll for more ↓
    </div>
  );
}
