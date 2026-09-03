import { NodeViewContent, type NodeViewProps } from "@tiptap/react";

import { isInsideAssessmentContainer } from "@/editor/assessment/shared/model/assessment-prosemirror";
import { safeGetPos } from "@/editor/prosemirror/position/node-view-position";
import { AssessmentShell } from "@/ui/components/course/AssessmentShell/AssessmentShell";

import "./assessment-node-view.css";

interface AssessmentProblemContentProps {
  blockClass: string;
  editable: boolean;
  nodeViewProps?: NodeViewProps;
  surfaceAttributes?: Record<string, string>;
}

export function AssessmentProblemContent({
  blockClass,
  editable,
  nodeViewProps,
  surfaceAttributes,
}: AssessmentProblemContentProps) {
  const insideQuiz = nodeViewProps
    ? isInsideAssessmentContainer(nodeViewProps.editor, safeGetPos(nodeViewProps.getPos), "quiz")
    : false;
  const resolvedSurfaceAttributes = {
    ...surfaceAttributes,
    ...(insideQuiz ? { "data-assessment-container": "quiz" } : {}),
  };

  return (
    <AssessmentShell
      editable={editable}
      className={blockClass}
      surfaceAttributes={resolvedSurfaceAttributes}
    >
      <NodeViewContent />
    </AssessmentShell>
  );
}
