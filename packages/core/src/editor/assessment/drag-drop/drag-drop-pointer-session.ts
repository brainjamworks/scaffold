import type { EmbeddedDataId } from "@scaffold/contracts";

import type {
  SpatialImagePoint,
  SpatialImageSurfaceState,
} from "@/editor/assessment/shared/spatial";

type PointerPlacementSurface = Pick<SpatialImageSurfaceState, "pointFromClient" | "status">;

export type DragDropPointerPlacementResolution =
  | {
      readonly status: "commit";
      readonly markerId: EmbeddedDataId;
      readonly point: SpatialImagePoint;
    }
  | {
      readonly status: "cancelled";
      readonly markerId: EmbeddedDataId;
      readonly reason: "attempt-locked" | "outside-image" | "surface-unavailable";
    };

export function resolveDragDropPointerPlacement({
  clientPoint,
  locked,
  markerId,
  surface,
}: {
  readonly clientPoint: SpatialImagePoint | null;
  readonly locked: boolean;
  readonly markerId: EmbeddedDataId;
  readonly surface: PointerPlacementSurface;
}): DragDropPointerPlacementResolution {
  if (locked) return { status: "cancelled", markerId, reason: "attempt-locked" };
  if (surface.status !== "ready") {
    return { status: "cancelled", markerId, reason: "surface-unavailable" };
  }
  const point = clientPoint ? surface.pointFromClient(clientPoint) : null;
  if (!point) return { status: "cancelled", markerId, reason: "outside-image" };
  return { status: "commit", markerId, point };
}
