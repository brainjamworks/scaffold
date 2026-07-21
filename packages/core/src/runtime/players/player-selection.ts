import type { ValidatedCourseSurfaceProjection } from "@/document/model/validation";

import type { RuntimePlayerSelection } from "./player-types";

export function selectRuntimePlayer(
  projection: ValidatedCourseSurfaceProjection,
): RuntimePlayerSelection {
  if (projection.mode === "page") {
    return {
      status: "available",
      player: "page",
      mode: "page",
      surfaceIds: [projection.surfaces[0].instanceId],
    };
  }

  const [firstSurface, ...remainingSurfaces] = projection.surfaces;
  return {
    status: "available",
    player: "slideshow",
    mode: "slideshow",
    surfaceIds: [firstSurface.instanceId, ...remainingSurfaces.map(({ instanceId }) => instanceId)],
  };
}
