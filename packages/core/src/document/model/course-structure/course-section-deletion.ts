import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Result, type Result as ResultType } from "better-result";

import { directChildren, isCourseSurfaceRoot } from "./transaction-helpers";
import type { CourseSectionId, SurfaceId } from "./types";

export interface CourseSectionDeletionInput {
  readonly courseSectionId: CourseSectionId;
  readonly expectedSurfaceIds: readonly SurfaceId[];
}

export type CourseSectionDeletionIssue =
  | {
      readonly code: "course_structure_unavailable";
      readonly courseSectionId: CourseSectionId;
    }
  | {
      readonly code: "course_section_not_found";
      readonly courseSectionId: CourseSectionId;
    }
  | {
      readonly code: "cannot_delete_final_course_section";
      readonly courseSectionId: CourseSectionId;
    }
  | {
      readonly code: "course_section_membership_changed";
      readonly courseSectionId: CourseSectionId;
      readonly expectedSurfaceIds: readonly SurfaceId[];
      readonly actualSurfaceIds: readonly SurfaceId[];
    };

export interface CourseSectionDeletionScope {
  readonly fromChildIndex: number;
  readonly toChildIndex: number;
  readonly surfaceIds: readonly SurfaceId[];
}

export type CourseSectionDeletionResult = ResultType<
  CourseSectionDeletionScope,
  CourseSectionDeletionIssue
>;

export function checkCourseSectionDeletion(
  document: ProseMirrorNode,
  input: CourseSectionDeletionInput,
): CourseSectionDeletionResult {
  const courseDocument = document.firstChild;
  if (
    courseDocument?.type.name !== "courseDocument" ||
    courseDocument.attrs["mode"] !== "slideshow"
  ) {
    return Result.err({
      code: "course_structure_unavailable",
      courseSectionId: input.courseSectionId,
    });
  }

  return resolveCourseSectionDeletion(directChildren(courseDocument), input);
}

export function resolveCourseSectionDeletion(
  children: readonly ProseMirrorNode[],
  input: CourseSectionDeletionInput,
): CourseSectionDeletionResult {
  const sectionIndices = children.flatMap((node, index) =>
    node.type.name === "courseSection" ? [index] : [],
  );
  const fromChildIndex = sectionIndices.find(
    (index) => children[index]?.attrs["id"] === input.courseSectionId,
  );

  if (fromChildIndex === undefined) {
    return Result.err({
      code: "course_section_not_found",
      courseSectionId: input.courseSectionId,
    });
  }
  if (sectionIndices.length === 1) {
    return Result.err({
      code: "cannot_delete_final_course_section",
      courseSectionId: input.courseSectionId,
    });
  }

  const sectionIndex = sectionIndices.indexOf(fromChildIndex);
  const toChildIndex = sectionIndices[sectionIndex + 1] ?? children.length;
  const surfaceIds = Object.freeze(
    children.slice(fromChildIndex + 1, toChildIndex).flatMap((node) => {
      const id = node.attrs["id"];
      return isCourseSurfaceRoot(node) && typeof id === "string" ? [id as SurfaceId] : [];
    }),
  );

  if (!sameIds(surfaceIds, input.expectedSurfaceIds)) {
    return Result.err({
      code: "course_section_membership_changed",
      courseSectionId: input.courseSectionId,
      expectedSurfaceIds: Object.freeze([...input.expectedSurfaceIds]),
      actualSurfaceIds: surfaceIds,
    });
  }

  return Result.ok(
    Object.freeze({
      fromChildIndex,
      toChildIndex,
      surfaceIds,
    }),
  );
}

function sameIds(left: readonly SurfaceId[], right: readonly SurfaceId[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}
