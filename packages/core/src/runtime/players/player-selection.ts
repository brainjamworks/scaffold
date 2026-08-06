import type { CourseStructure } from "@/document/model/course-structure";

import type { RuntimePlayerSelection } from "./player-types";

export function selectRuntimePlayer(
  structure: CourseStructure,
): RuntimePlayerSelection {
  if (structure.mode === "page") {
    return {
      status: "available",
      player: "page",
      mode: "page",
      surfaceIds: [structure.surfaceIds[0]],
    };
  }

  const [firstSurfaceId, ...remainingSurfaceIds] = structure.surfaceIds;
  return {
    status: "available",
    player: "slideshow",
    mode: "slideshow",
    surfaceIds: [firstSurfaceId, ...remainingSurfaceIds],
  };
}
