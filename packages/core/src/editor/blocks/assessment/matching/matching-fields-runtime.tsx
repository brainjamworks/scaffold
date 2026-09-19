import { DOMSerializer } from "@tiptap/pm/model";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useMemo } from "react";

import { findAncestorAssessmentBlockId } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { isAssessmentQuestionNode } from "@/editor/blocks/assessment/shared/nodes/assessment-meta";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";

import { matchingCourseContentFromProseMirror } from "@/editor/assessment/matching/matching-course-content";
import { MatchingCourseInteraction } from "@/editor/assessment/matching/matching-course-interaction";
import {
  answerMatchesFromReveal,
  createMatchingItemNode,
  createMatchingPairNode,
  createMatchingPairsGroupNode,
  createMatchingTargetNode,
  describeMatchingItemAccessibilityState,
  describeMatchingTargetAccessibilityState,
  getMatchingConnectorPath,
} from "@/editor/assessment/matching/matching-fields-shared";
import "@/editor/assessment/matching/Matching.css";

export {
  answerMatchesFromReveal,
  describeMatchingItemAccessibilityState,
  describeMatchingTargetAccessibilityState,
  getMatchingConnectorPath,
};

export const MatchingItemRuntimeNode = createMatchingItemNode();
export const MatchingTargetRuntimeNode = createMatchingTargetNode();
export const MatchingPairRuntimeNode = createMatchingPairNode();
export const MatchingPairsGroupRuntimeNode = createMatchingPairsGroupNode({
  addNodeView: () => ReactNodeViewRenderer(MatchingPairsGroupRuntimeNodeView),
});

function MatchingPairsGroupRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const assessmentTargetId = findAncestorAssessmentBlockId(
    props.editor,
    pos ?? undefined,
    isAssessmentQuestionNode,
  );
  const authoredBlockId = findAncestorAssessmentBlockId(props.editor, pos ?? undefined, [
    "matching",
  ]);
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const content = useMemo(
    () => matchingCourseContentFromProseMirror(props.node, serializer),
    [props.node, serializer],
  );

  if (assessmentTargetId && !authoredBlockId) {
    return (
      <NodeViewWrapper
        data-assessment-interaction-content=""
        data-surface-assessment-interaction-content=""
        hidden
      >
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      data-assessment-interaction-content=""
      data-bounded-scroll-frame=""
      data-slot="matching-pairs-group"
      className="sc-course-matching__group"
    >
      <MatchingCourseInteraction
        assessmentTargetId={authoredBlockId}
        content={content}
        presentation="inline"
      />
    </NodeViewWrapper>
  );
}
