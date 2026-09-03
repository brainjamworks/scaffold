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

import { categoriseCourseContentFromProseMirror } from "@/editor/assessment/categorise/categorise-course-content";
import { CategoriseCourseInteraction } from "@/editor/assessment/categorise/categorise-course-interaction";
import {
  categoriseRevealFromAnswers,
  createCategoriseBinNode,
  createCategoriseBinsGroupNode,
  createCategoriseContentNode,
  createCategoriseItemBodyNode,
  createCategoriseItemNode,
  createCategoriseItemsGroupNode,
  describeCategoriseCategoryAccessibilityState,
  describeCategorisePlacedItemAccessibilityState,
  describeCategoriseSourceItemAccessibilityState,
} from "@/editor/assessment/categorise/categorise-fields-shared";

export {
  categoriseRevealFromAnswers,
  describeCategoriseCategoryAccessibilityState,
  describeCategorisePlacedItemAccessibilityState,
  describeCategoriseSourceItemAccessibilityState,
};

export const CategoriseBinRuntimeNode = createCategoriseBinNode();
export const CategoriseBinsGroupRuntimeNode = createCategoriseBinsGroupNode();
export const CategoriseItemBodyRuntimeNode = createCategoriseItemBodyNode();
export const CategoriseItemRuntimeNode = createCategoriseItemNode();
export const CategoriseItemsGroupRuntimeNode = createCategoriseItemsGroupNode({
  content: "categorise_item*",
});

export const CategoriseContentRuntimeNode = createCategoriseContentNode({
  addNodeView: () => ReactNodeViewRenderer(CategoriseContentRuntimeNodeView),
});

function CategoriseContentRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const assessmentTargetId = findAncestorAssessmentBlockId(
    props.editor,
    pos ?? undefined,
    isAssessmentQuestionNode,
  );
  const authoredBlockId = findAncestorAssessmentBlockId(props.editor, pos ?? undefined, [
    "categorise",
  ]);
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const content = useMemo(
    () => categoriseCourseContentFromProseMirror(props.node, serializer),
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
      data-categorise-presentation="inline"
      data-slot="categorise-content"
      className="sc-course-categorise__content sc-course-categorise__content--runtime"
    >
      <CategoriseCourseInteraction
        assessmentTargetId={authoredBlockId}
        content={content}
        presentation="inline"
      />
    </NodeViewWrapper>
  );
}
