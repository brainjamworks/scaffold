import type { CourseOutlineStructureIssue } from "./course-outline-structure-authoring";

export function courseOutlineStructureIssueMessage(issue: CourseOutlineStructureIssue): string {
  switch (issue.code) {
    case "course_section_membership_changed":
      return "This Course Section changed while the dialog was open. Review the updated related Surfaces, then try again.";
    case "cannot_delete_final_course_section":
      return "The final Course Section cannot be deleted. Add another Course Section first.";
    case "course_section_not_found":
      return "This Course Section is no longer available.";
    case "course_structure_unavailable":
      return "Course Section editing is no longer available for this document.";
    case "surface_move_cancelled":
      return issue.reason
        ? `Surface move cancelled (${issue.reason}).`
        : "The Surface move was cancelled.";
    case "course_structure_operation_unavailable":
      return unavailableOperationMessage(issue.operation);
  }
}

function unavailableOperationMessage(
  operation: Extract<
    CourseOutlineStructureIssue,
    { readonly code: "course_structure_operation_unavailable" }
  >["operation"],
): string {
  switch (operation) {
    case "create-course-section":
      return "This Course Section could not be created. The document may have changed.";
    case "rename-course-section":
      return "This Course Section could not be renamed. The document may have changed.";
    case "duplicate-course-section":
      return "This Course Section could not be duplicated. The document may have changed.";
    case "delete-course-section":
      return "This Course Section could not be deleted. The document may have changed.";
    case "move-surface":
      return "This Surface could not be moved. The document may have changed.";
  }
}
