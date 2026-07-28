import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

import { findAncestorAssessmentBlockId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { isAssessmentQuestionNode } from "./assessment-meta";

import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import "./assessment-choices-group.css";

export const AssessmentChoicesGroupRuntimeNode = Node.create({
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
        "data-bounded-scroll-frame": "",
        "data-slot": "assessment-choices-group",
      }),
      ["div", { "data-bounded-scroll": "", class: "sc-assessment-choices-scroll" }, 0],
      ["div", { "data-bounded-scroll-hint": "", "aria-hidden": "true" }, "Scroll for more ↓"],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentChoicesGroupRuntimeNodeView);
  },
});

function AssessmentChoicesGroupRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const authoredBlockId = findAncestorAssessmentBlockId(
    props.editor,
    pos,
    isAssessmentQuestionNode,
  );
  const problem = useAssessmentRuntimeById(authoredBlockId)?.problem ?? null;

  return (
    <NodeViewWrapper data-bounded-scroll-frame="" data-slot="assessment-choices-group">
      <div data-bounded-scroll="" className="sc-assessment-choices-scroll">
        <fieldset className="sc-assessment-choices-fieldset" aria-required="true">
          {problem?.state.legend && (
            <legend className="sc-assessment-choices-legend">{problem.state.legend}</legend>
          )}
          <div className="sc-assessment-choices-list">
            <NodeViewContent />
          </div>
        </fieldset>
      </div>
      <div data-bounded-scroll-hint="" aria-hidden="true">
        Scroll for more ↓
      </div>
    </NodeViewWrapper>
  );
}
