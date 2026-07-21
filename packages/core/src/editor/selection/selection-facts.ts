import { AllSelection, NodeSelection, TextSelection, type Selection } from "@tiptap/pm/state";

export const CourseSelectionMode = {
  AllSelection: "allSelection",
  NodeSelection: "nodeSelection",
  OtherSelection: "otherSelection",
  TextCaret: "textCaret",
  TextRange: "textRange",
} as const;

export type CourseSelectionMode = (typeof CourseSelectionMode)[keyof typeof CourseSelectionMode];

export interface CourseSelectionRange {
  from: number;
  to: number;
}

/** Normalized raw ProseMirror selection facts for Scaffold readers. */
export interface CourseSelectionFacts {
  empty: boolean;
  range: CourseSelectionRange;
  selectionMode: CourseSelectionMode;
}

export function isNodeSelection(selection: Selection): selection is NodeSelection {
  return selection instanceof NodeSelection;
}

export function isTextSelection(selection: Selection): selection is TextSelection {
  return selection instanceof TextSelection;
}

export function isAllSelection(selection: Selection): selection is AllSelection {
  return selection instanceof AllSelection;
}

export function resolveCourseSelectionFacts(selection: Selection): CourseSelectionFacts {
  return {
    empty: selection.empty,
    range: { from: selection.from, to: selection.to },
    selectionMode: resolveCourseSelectionMode(selection),
  };
}

function resolveCourseSelectionMode(selection: Selection): CourseSelectionMode {
  if (isNodeSelection(selection)) return CourseSelectionMode.NodeSelection;
  if (isAllSelection(selection)) return CourseSelectionMode.AllSelection;
  if (isTextSelection(selection)) {
    return selection.empty ? CourseSelectionMode.TextCaret : CourseSelectionMode.TextRange;
  }
  return CourseSelectionMode.OtherSelection;
}
