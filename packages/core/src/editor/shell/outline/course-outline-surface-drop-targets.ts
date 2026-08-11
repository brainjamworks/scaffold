import type { EmbeddedNodeId } from "@scaffold/contracts";

import type { SurfaceDestination, SurfaceId } from "@/document/model/course-structure";
import type { SemanticItem } from "@/document/model/semantic-document";

export interface CourseOutlineSurfaceDropTarget {
  readonly targetSurfaceId?: SurfaceId;
  readonly targetSectionId?: EmbeddedNodeId;
  readonly destination: SurfaceDestination;
}

export function orderedCourseOutlineSurfaces(
  roots: readonly SemanticItem[],
): readonly SemanticItem[] {
  const surfaces: SemanticItem[] = [];
  const visit = (items: readonly SemanticItem[]) => {
    for (const item of items) {
      if (item.kind === "surface") surfaces.push(item);
      else if (item.kind === "course-section") visit(item.children);
    }
  };
  visit(roots);
  return surfaces;
}

export function deriveCourseOutlineSurfaceDropTargets(
  roots: readonly SemanticItem[],
  sourceId: EmbeddedNodeId,
): readonly CourseOutlineSurfaceDropTarget[] {
  const surfaces = orderedCourseOutlineSurfaces(roots);
  const sourceIndex = surfaces.findIndex((item) => item.id === sourceId);
  if (sourceIndex < 0) return [];

  const targets: CourseOutlineSurfaceDropTarget[] = [];
  for (const root of roots) {
    if (root.kind !== "course-section" || root.children.some((child) => child.kind === "surface")) {
      continue;
    }
    targets.push({
      targetSectionId: root.id,
      destination: { intoCourseSectionId: root.id, edge: "end" },
    });
  }
  for (const [targetIndex, target] of surfaces.entries()) {
    if (target.id === sourceId) continue;
    if (sourceIndex !== targetIndex - 1) {
      targets.push({ targetSurfaceId: target.id, destination: { beforeSurfaceId: target.id } });
    }
    if (sourceIndex !== targetIndex + 1) {
      targets.push({ targetSurfaceId: target.id, destination: { afterSurfaceId: target.id } });
    }
  }
  return targets;
}
