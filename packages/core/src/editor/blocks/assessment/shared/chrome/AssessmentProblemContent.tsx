import { NodeViewContent } from "@tiptap/react";

import { ProblemShell } from "./ProblemShell";
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
    <ProblemShell
      isEditable={editable}
      blockClass={blockClass}
      {...(surfaceAttributes ? { surfaceAttributes } : {})}
    >
      <NodeViewContent />
    </ProblemShell>
  );
}
