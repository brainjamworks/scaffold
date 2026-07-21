import type { NodeViewProps } from "@tiptap/react";

import type { BlockDefinition } from "@/editor/blocks/block-definition";
import { AssessmentProblemContent } from "@/editor/blocks/assessment/shared/chrome/AssessmentProblemContent";

import { useAssessmentRuntime } from "./use-assessment-runtime";

interface AssessmentRuntimeProblemContentProps {
  blockClass: string;
  definition: BlockDefinition;
  props: NodeViewProps;
}

export function AssessmentRuntimeProblemContent({
  blockClass,
  definition,
  props,
}: AssessmentRuntimeProblemContentProps) {
  useAssessmentRuntime({
    definition,
    editor: props.editor,
    getPos: props.getPos,
    node: props.node,
  });

  return <AssessmentProblemContent editable={false} blockClass={blockClass} />;
}
