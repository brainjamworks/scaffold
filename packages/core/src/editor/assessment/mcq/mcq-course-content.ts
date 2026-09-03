import {
  selectableChoiceCourseContentFromProseMirror,
  type SelectableChoiceCourseChoice,
  type SelectableChoiceCourseContent,
} from "@/editor/blocks/assessment/shared/runtime/selectable-choice-course-content";

export type McqCourseChoice = SelectableChoiceCourseChoice;
export type McqCourseContent = SelectableChoiceCourseContent;
export const mcqCourseContentFromProseMirror = selectableChoiceCourseContentFromProseMirror;
