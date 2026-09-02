import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { ProjectedCourseStructure } from "@/document/model/course-structure";

import type { SemanticDocumentSnapshot } from "./semantic-document-snapshot";

export function resolveSemanticTargetSurfaceId(
  targetId: EmbeddedNodeId,
  semantics: SemanticDocumentSnapshot,
  courseStructure: ProjectedCourseStructure,
): EmbeddedNodeId | null {
  const location = semantics.locationById.get(targetId);
  if (location?.surfaceId) return location.surfaceId;
  if (semantics.itemById.get(targetId)?.kind !== "course-section") return null;
  return courseStructure.courseSectionById[targetId]?.firstSurfaceId ?? null;
}
