import type { Editor } from "@tiptap/core";
import { Result, type Result as ResultType } from "better-result";

import type {
  CourseSectionDeletionIssue,
  CourseSectionId,
  SurfaceDestination,
  SurfaceId,
} from "@/document/model/course-structure";
import { checkCourseSectionDeletion } from "@/document/model/course-structure";

export type CourseOutlineStructureOperation =
  | "create-course-section"
  | "rename-course-section"
  | "duplicate-course-section"
  | "delete-course-section"
  | "move-surface";

export type CourseOutlineStructureIssue =
  | CourseSectionDeletionIssue
  | {
      readonly code: "course_structure_operation_unavailable";
      readonly operation: CourseOutlineStructureOperation;
    }
  | {
      readonly code: "surface_move_cancelled";
      readonly reason: string | null;
    };

export type CourseOutlineStructureResult = ResultType<void, CourseOutlineStructureIssue>;

export interface CourseOutlineStructureAuthoringPort {
  createCourseSection(): CourseOutlineStructureResult;
  canMoveSurface(surfaceId: SurfaceId, destination: SurfaceDestination): boolean;
  renameCourseSection(input: {
    readonly courseSectionId: CourseSectionId;
    readonly title: string;
  }): CourseOutlineStructureResult;
  duplicateCourseSection(courseSectionId: CourseSectionId): CourseOutlineStructureResult;
  deleteCourseSection(input: {
    readonly courseSectionId: CourseSectionId;
    readonly expectedSurfaceIds: readonly SurfaceId[];
  }): CourseOutlineStructureResult;
  moveSurface(input: {
    readonly surfaceId: SurfaceId;
    readonly destination: SurfaceDestination;
  }): CourseOutlineStructureResult;
}

export function createCourseOutlineStructureAuthoringPort(
  editor: Editor,
): CourseOutlineStructureAuthoringPort {
  const apply = (
    command: Parameters<Editor["commands"]["applyCourseStructureCommand"]>[0],
    operation: CourseOutlineStructureOperation,
  ): CourseOutlineStructureResult => {
    if (editor.isDestroyed || !editor.can().applyCourseStructureCommand(command)) {
      return operationUnavailable(operation);
    }
    return editor.chain().applyCourseStructureCommand(command).run()
      ? Result.ok()
      : operationUnavailable(operation);
  };

  const port: CourseOutlineStructureAuthoringPort = {
    createCourseSection() {
      return apply({ type: "course-section.create", placement: "end" }, "create-course-section");
    },
    canMoveSurface(surfaceId, destination) {
      return (
        !editor.isDestroyed &&
        editor.can().applyCourseStructureCommand({ type: "surface.move", surfaceId, destination })
      );
    },
    renameCourseSection(input) {
      return apply({ type: "course-section.rename", ...input }, "rename-course-section");
    },
    duplicateCourseSection(courseSectionId) {
      return apply(
        { type: "course-section.duplicate", courseSectionId },
        "duplicate-course-section",
      );
    },
    deleteCourseSection(input) {
      if (editor.isDestroyed) return operationUnavailable("delete-course-section");
      const deletion = checkCourseSectionDeletion(editor.state.doc, input);
      if (deletion.isErr()) return Result.err(deletion.error);
      return apply({ type: "course-section.delete", ...input }, "delete-course-section");
    },
    moveSurface(input) {
      return apply({ type: "surface.move", ...input }, "move-surface");
    },
  };
  return Object.freeze(port);
}

function operationUnavailable(
  operation: CourseOutlineStructureOperation,
): CourseOutlineStructureResult {
  return Result.err({ code: "course_structure_operation_unavailable", operation });
}
