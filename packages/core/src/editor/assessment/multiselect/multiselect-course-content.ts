import {
  selectableChoiceCourseContentFromProseMirror,
  type SelectableChoiceCourseChoice,
  type SelectableChoiceCourseContent,
} from "@/editor/blocks/assessment/shared/runtime/selectable-choice-course-content";

export type MultiselectCourseChoice = SelectableChoiceCourseChoice;
export type MultiselectCourseContent = SelectableChoiceCourseContent;
export const multiselectCourseContentFromProseMirror = selectableChoiceCourseContentFromProseMirror;
