import { NodeViewContent } from "@tiptap/react";

import { AssessmentShell } from "@/ui/components/course/AssessmentShell/AssessmentShell";

import "./assessment-node-view.css";

interface AssessmentProblemContentProps {
  blockClass: string;
  editable: boolean;
  surfaceAttributes?: Record<string, string>;
}

export function AssessmentProblemContent({
  blockClass,
  editable,
  surfaceAttributes,
}: AssessmentProblemContentProps) {
  return (
    <AssessmentShell
      editable={editable}
      className={blockClass}
      {...(surfaceAttributes ? { surfaceAttributes } : {})}
    >
      <NodeViewContent />
    </AssessmentShell>
  );
}
