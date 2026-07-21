import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";

import {
  fieldContainerSpec,
  textContentExpression,
} from "@/document/model/content-model/content-groups";
import { HintItem } from "@/editor/blocks/assessment/shared/chrome/HintItem";
import { useAssessmentRuntimeById } from "@/editor/blocks/assessment/shared/runtime/use-assessment-runtime";
import { isValidEditorDocPos } from "@/editor/prosemirror/position/document-position";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { findAncestorAssessmentId } from "@/editor/blocks/assessment/shared/model/assessment-prosemirror";

import { isAssessmentQuestionNode } from "./assessment-meta";

const ASSESSMENT_HINT_CONTENT = textContentExpression();

export const AssessmentHintRuntimeNode = Node.create({
  name: "assessment_hint",
  ...fieldContainerSpec({ content: ASSESSMENT_HINT_CONTENT }),

  parseHTML() {
    return [{ tag: 'div[data-slot="assessment-hint"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-slot": "assessment-hint" }), 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AssessmentHintRuntimeNodeView);
  },
});

function AssessmentHintRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const problemId = findAncestorAssessmentId(props.editor, pos, isAssessmentQuestionNode);
  const problem = useAssessmentRuntimeById(problemId)?.problem ?? null;

  return (
    <NodeViewWrapper data-slot="assessment-hint">
      <HintItem
        index={getHintIndex(props)}
        isEditable={false}
        hintsShown={problem?.state.hintsShown ?? 0}
        onDelete={() => undefined}
      >
        <NodeViewContent />
      </HintItem>
    </NodeViewWrapper>
  );
}

function getHintIndex(props: NodeViewProps): number {
  const pos = safeGetPos(props.getPos);
  if (!isValidEditorDocPos(props.editor, pos)) return 1;

  const $pos = props.editor.state.doc.resolve(pos);
  const parent = $pos.parent;
  let count = 1;
  let foundSelf = false;

  parent.forEach((child) => {
    if (foundSelf) return;
    if (child === props.node) {
      foundSelf = true;
      return;
    }
    if (child.type.name === "assessment_hint") count += 1;
  });

  return count;
}
