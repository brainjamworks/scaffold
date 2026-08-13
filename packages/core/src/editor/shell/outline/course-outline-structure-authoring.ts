import type { Editor } from "@tiptap/core";

import type {
  CourseSectionId,
  SurfaceDestination,
  SurfaceId,
} from "@/document/model/course-structure";

export type CourseOutlineStructureResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

export interface CourseOutlineStructureAuthoringPort {
  createCourseSection(title: string): CourseOutlineStructureResult;
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
    unavailableMessage: string,
  ): CourseOutlineStructureResult => {
    if (editor.isDestroyed || !editor.can().applyCourseStructureCommand(command)) {
      return { ok: false, message: unavailableMessage };
    }
    return editor.chain().applyCourseStructureCommand(command).run()
      ? { ok: true }
      : { ok: false, message: unavailableMessage };
  };

  const port: CourseOutlineStructureAuthoringPort = {
    createCourseSection(title) {
      return apply(
        { type: "course-section.create", title, placement: "end" },
        "This Course Section could not be created. The document may have changed.",
      );
    },
    canMoveSurface(surfaceId, destination) {
      return (
        !editor.isDestroyed &&
        editor.can().applyCourseStructureCommand({ type: "surface.move", surfaceId, destination })
      );
    },
    renameCourseSection(input) {
      return apply(
        { type: "course-section.rename", ...input },
        "This Course Section could not be renamed. The document may have changed.",
      );
    },
    duplicateCourseSection(courseSectionId) {
      return apply(
        { type: "course-section.duplicate", courseSectionId },
        "This Course Section could not be duplicated. The document may have changed.",
      );
    },
    deleteCourseSection(input) {
      return apply(
        { type: "course-section.delete", ...input },
        "This Course Section could not be deleted. Its membership may have changed.",
      );
    },
    moveSurface(input) {
      return apply(
        { type: "surface.move", ...input },
        "This Surface could not be moved. The document may have changed.",
      );
    },
  };
  return Object.freeze(port);
}
