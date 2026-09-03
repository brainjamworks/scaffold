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

import { sequencingCourseContentFromProseMirror } from "@/editor/assessment/sequencing/sequencing-course-content";
import { SequencingCourseInteraction } from "@/editor/assessment/sequencing/sequencing-course-interaction";
import {
  createSequencingItemNode,
  createSequencingItemsGroupNode,
} from "@/editor/assessment/sequencing/sequencing-fields-shared";

export const SequencingItemRuntimeNode = createSequencingItemNode();

export const SequencingItemsGroupRuntimeNode = createSequencingItemsGroupNode({
  addNodeView: () => ReactNodeViewRenderer(SequencingItemsGroupRuntimeNodeView),
});

function SequencingItemsGroupRuntimeNodeView(props: NodeViewProps) {
  const pos = safeGetPos(props.getPos);
  const assessmentTargetId = findAncestorAssessmentBlockId(
    props.editor,
    pos ?? undefined,
    isAssessmentQuestionNode,
  );
  const authoredBlockId = findAncestorAssessmentBlockId(props.editor, pos ?? undefined, [
    "sequencing",
  ]);
  const serializer = useMemo(
    () => DOMSerializer.fromSchema(props.editor.schema),
    [props.editor.schema],
  );
  const content = useMemo(
    () => sequencingCourseContentFromProseMirror(props.node, serializer),
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
      data-slot="sequencing-items-group"
    >
      <SequencingCourseInteraction
        assessmentTargetId={authoredBlockId}
        content={content}
        presentation="inline"
      />
    </NodeViewWrapper>
  );
}
