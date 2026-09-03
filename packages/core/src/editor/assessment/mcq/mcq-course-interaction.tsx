import { SelectableChoiceCourseInteraction } from "@/editor/blocks/assessment/shared/runtime/SelectableChoiceCourseInteraction";

import type { McqCourseContent } from "./mcq-course-content";

export interface McqCourseInteractionProps {
  readonly assessmentTargetId: string | null | undefined;
  readonly content: McqCourseContent;
  readonly presentation: "inline" | "full-slide";
}

export function McqCourseInteraction({
  assessmentTargetId,
  content,
  presentation,
}: McqCourseInteractionProps) {
  return (
    <SelectableChoiceCourseInteraction
      assessmentTargetId={assessmentTargetId}
      content={content}
      interactionKind="single-select"
      presentation={presentation}
    />
  );
}
