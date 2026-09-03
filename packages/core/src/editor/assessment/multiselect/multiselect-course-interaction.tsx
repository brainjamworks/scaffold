import { SelectableChoiceCourseInteraction } from "@/editor/blocks/assessment/shared/runtime/SelectableChoiceCourseInteraction";

import type { MultiselectCourseContent } from "./multiselect-course-content";

export interface MultiselectCourseInteractionProps {
  readonly assessmentTargetId: string | null | undefined;
  readonly content: MultiselectCourseContent;
  readonly presentation: "inline" | "full-slide";
}

export function MultiselectCourseInteraction({
  assessmentTargetId,
  content,
  presentation,
}: MultiselectCourseInteractionProps) {
  return (
    <SelectableChoiceCourseInteraction
      assessmentTargetId={assessmentTargetId}
      content={content}
      interactionKind="multi-select"
      presentation={presentation}
    />
  );
}
