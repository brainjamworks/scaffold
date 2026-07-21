import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

import { Hints } from "@/editor/blocks/assessment/shared/chrome/Hints";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { isAssessmentQuestionNode } from "./assessment-meta";

import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";

export const AssessmentHintsGroupRuntimeNode = Node.create({
  name: "assessment_hints_group",
  content: "assessment_hint*",
  defining: true,
  isolating: true,
  selectable: false,

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-hints-group"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-slot": "assessment-hints-group",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentHintsGroupRuntimeNodeView);
  },
});

function AssessmentHintsGroupRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const problemId = findAncestorAssessmentId(props.editor, pos, isAssessmentQuestionNode);
  const problem = useAssessmentRuntimeById(problemId)?.problem ?? null;

  return (
    <NodeViewWrapper data-slot="assessment-hints-group" contentEditable={false}>
      <Hints
        hintsTotal={props.node.childCount}
        isEditable={false}
        hintsShown={problem?.state.hintsShown ?? 0}
        submitted={problem?.state.submitted ?? false}
        onReveal={() => problem?.revealHint()}
        onAddHint={() => undefined}
      >
        <NodeViewContent />
      </Hints>
    </NodeViewWrapper>
  );
}
